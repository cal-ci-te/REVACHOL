# -*- coding: utf-8 -*-
"""RFC-001 核心：DocumentReviewFlow 状态机与路由。

设计要点（对齐 RFC-001 决议）：
- D1：TextProcessor 仅首次撰写初稿（revision_count == 0 → drafting）；
  修改循环由 Coder 直接修改（revision_count > 0 → coding）。
- D2：总计最多 3 次审查（初始 1 次 + 修改循环最多 2 轮）。
- D3/D4：3 次审查仍不通过 → 暂存区（保留 30 天）并自动通知人工。
- D7：每个状态转换后写 <output>/flow_state/<task_id>.json 快照，支持断点续跑。
- D6：GPT-4 仲裁者 / Doubao 样式生成本期不实施，仅预留注释位。
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import PrivateAttr

from crewai.flow.flow import Flow, listen, or_, router, start

from .persistence import save_state_snapshot
from .staging import (
    notify_human,
    schedule_cleanup,
    staging_dir_for,
    write_staging_snapshot,
)
from .state import FlowStatus, ReviewLoopState

# 路由标签：为避免 CrewAI 1.15 对“监听自身完成”的校验，
# 路由返回的标签与处理方法名保持不同。
_DRAFT_DOC = "draft_doc"
_CODE_DOC = "code_doc"
_MERGE_APPROVED = "merge_approved"
_REVISE_PLAN = "revise_plan"
_STAGE_FAILED = "stage_failed"
_RESUME_REVIEWING = "resume_reviewing"
_RESUME_STAGING = "resume_staging"
_RESUME_DONE = "flow_done"

# Agent ID -> Dashboard 显示名（与 ui/agent_panel.py / backend/routes/crew.cjs 对齐）
_AGENT_DISPLAY_NAMES = {
    "planner": "Planner",
    "text_processor": "Text Processor",
    "coder": "Coder",
    "reviewer": "Reviewer",
    "document_admin": "Document Admin",
}

# 网络/API 稳定性加固：
# - LLM 调用对 ConnectionError/TimeoutError 做指数退避重试（缓解 DeepSeek 间歇性连接重置）
# - Reviewer/Document_Admin 的输入上下文截断，降低 Kimi/MiMo 大文档生成耗时与超时概率
_LLM_RETRY_ATTEMPTS = 5
_LLM_RETRY_BASE_SLEEP = 3
_MAX_REVIEW_PLAN_CHARS = 8000
_MAX_REVIEW_DOC_CHARS = 40000
_MAX_MERGE_DOC_CHARS = 40000


class DocumentReviewFlow(Flow[ReviewLoopState]):
    """文档撰写 + 审查修改循环的 CrewAI Flow。"""

    # --- 注入点（Pydantic 字段，便于 CLI / 测试注入） ---
    emitter: Any = None  # NDJSON 事件发射器（JsonLogEmitter 兼容）
    agent_builder: Any = None  # callable() -> dict[str, Agent]；缺省使用 run_revachol_crew
    save_snapshots: bool = True  # 是否写 flow_state 快照
    flow_output_dir: Optional[str] = None  # 覆盖输出目录（一般交给 CREW_OUTPUT_DIR）

    _agents: dict = PrivateAttr(default_factory=dict)

    # =====================================================================
    # 日志 / 快照
    # =====================================================================

    def _log(self, level: str, message: str) -> None:
        if self.emitter is not None:
            log = getattr(self.emitter, "log", None)
            if callable(log):
                log(message, level)
                return
        print(f"[flow:{level}] {message}")

    def _emit(self, type_: str, **payload: Any) -> None:
        if self.emitter is not None:
            emit = getattr(self.emitter, "_emit", None)
            if callable(emit):
                emit(type_, **payload)

    def _checkpoint(self) -> None:
        """D7：每个状态转换完成后保存快照。"""
        if not self.save_snapshots:
            return
        try:
            path = save_state_snapshot(self.state)
            self._log("info", f"Flow 状态快照已写入 {path}")
        except Exception as exc:  # noqa: BLE001 - 快照失败不应中断主流程
            self._log("warning", f"Flow 状态快照写入失败: {exc}")

    # =====================================================================
    # Agent 构建（复用既有 Crew 资产）
    # =====================================================================

    def _ensure_agents(self) -> dict:
        """构建/复用 Agent 字典；包含既有四 Agent + 新增 TextProcessor。"""
        if self._agents:
            return self._agents

        if self.agent_builder is not None:
            agents = self.agent_builder()
        else:
            from run_revachol_crew import build_agents, build_text_processor_agent

            agents = build_agents()
            agents["text_processor"] = build_text_processor_agent()

        self._agents = agents
        return agents

    def _run_single_task(
        self,
        agent_id: str,
        task_name: str,
        description: str,
        expected_output: str,
    ) -> str:
        """用单个 Agent + Task 组成临时 Crew 执行，返回 raw 输出。

        网络加固：对 ConnectionError / TimeoutError 做指数退避重试，
        缓解 DeepSeek/Kimi 等 OpenAI 兼容端点的间歇性连接重置与超时。
        """
        from crewai import Crew, Task

        agents = self._ensure_agents()
        task = Task(
            name=task_name,
            description=description,
            expected_output=expected_output,
            agent=agents[agent_id],
        )
        crew = Crew(
            agents=[agents[agent_id]],
            tasks=[task],
            process="sequential",
            verbose=False,
        )

        last_exc: Exception | None = None
        for attempt in range(1, _LLM_RETRY_ATTEMPTS + 1):
            try:
                result = crew.kickoff()
                return (getattr(result, "raw", None) or str(result)).strip()
            except (ConnectionError, TimeoutError) as exc:
                last_exc = exc
                self._log(
                    "warning",
                    f"[retry] {agent_id}/{task_name} 第 {attempt} 次调用失败: {exc}",
                )
                if attempt < _LLM_RETRY_ATTEMPTS:
                    sleep_secs = _LLM_RETRY_BASE_SLEEP * (2 ** (attempt - 1))
                    self._log(
                        "warning",
                        f"[retry] {agent_id}/{task_name} {sleep_secs}s 后重试",
                    )
                    time.sleep(sleep_secs)
        if last_exc is not None:
            raise last_exc
        raise RuntimeError(f"{agent_id}/{task_name} 执行失败：无可用结果")

    def emit_usage_stats(self) -> None:
        """将各 Agent 的 Token 用量以 flow:stats 事件发出（后端翻译为 crew:stats 落库）。

        在 Flow 结束后调用一次，避免同一 Agent 多次任务导致累计值重复计数。
        """
        from run_revachol_crew import _infer_provider

        for agent_id, agent in self._agents.items():
            try:
                usage = agent.llm.get_token_usage_summary()
                tokens = int(getattr(usage, "total_tokens", 0) or 0)
                cost = float(getattr(usage, "cost", 0.0) or 0.0)
                if not tokens:
                    continue
                model = getattr(agent.llm, "model", "unknown")
                provider = _infer_provider(model, agent_id)
                display = _AGENT_DISPLAY_NAMES.get(agent_id, agent_id)
                self._emit(
                    "flow:stats",
                    agent=display,
                    model=model,
                    provider=provider,
                    tokens=tokens,
                    cost=cost,
                )
                self._log("info", f"[stats] {display}: {tokens} tokens, cost={cost:.4f}")
            except Exception as exc:  # noqa: BLE001 - 统计失败不影响主流程
                self._log("warning", f"[stats] {agent_id} Token 统计失败: {exc}")

    # =====================================================================
    # 各状态的实际执行（可被测试覆写，避免真实 LLM 调用）
    # =====================================================================

    def _run_planning(self, revision: bool = False) -> None:
        """Planner：制定计划（首次）或结合 review_feedback 制定修订计划。"""
        import run_revachol_crew as rrc

        if revision and self.state.review_feedback:
            feedback_block = (
                "\n\n⚠️ 这是修订版规划。Reviewer 的修改意见如下（必须消化）：\n"
                f"{self.state.review_feedback}"
            )
        else:
            feedback_block = ""

        description = (
            "你是技术规划师。请针对以下需求进行技术规划：\n"
            f"需求：{self.state.requirement}\n\n"
            "1. architecture：整体架构方案；\n"
            "2. tech_stack：技术选型列表；\n"
            "3. milestones：按执行顺序排列的里程碑步骤（至少 2 条）。"
            f"{feedback_block}"
            + rrc.build_output_requirement(rrc.PlanningOutput)
        )
        raw = self._run_single_task(
            "planner",
            "planning",
            description,
            "符合上述 JSON Schema 的规划结果：architecture、tech_stack、milestones。",
        )
        parsed = rrc.parse_and_validate_output(
            raw, rrc.PlanningOutput, task_name="planning", log_fn=self._log
        )
        if parsed is not None:
            self.state.plan = parsed.model_dump_json(indent=2, ensure_ascii=False)
        else:
            self.state.plan = raw
        self._log("info", f"Planner 规划完成（revision={revision}）")

    def _run_drafting(self) -> None:
        """TextProcessor：仅首次撰写文档初稿（D1）。"""
        description = (
            "你是文本处理员。请依据以下 Planner 计划，撰写结构完整、内容准确的文档初稿。\n\n"
            f"计划：\n{self.state.plan}\n\n"
            "要求：\n"
            "1. 输出文档正文（Markdown 或纯文本均可）；\n"
            "2. 结构清晰、内容准确，可直接交付 Reviewer 审查；\n"
            "3. 不要输出 JSON 包装，直接输出文档内容。"
        )
        self.state.document = self._run_single_task(
            "text_processor",
            "drafting",
            description,
            "一份结构完整的文档初稿。",
        )
        self._log("info", "TextProcessor 初稿完成")

    def _run_coding(self) -> None:
        """Coder：完善文档 / 编写代码；修改循环中直接承接修订计划（D1）。"""
        feedback_block = (
            "\n\n⚠️ Reviewer 修改意见（必须解决）：\n" + self.state.review_feedback
            if self.state.review_feedback
            else ""
        )
        description = (
            "你是代码开发者。请依据计划完善文档（必要时补充代码/补丁）：\n\n"
            f"计划：\n{self.state.plan}\n\n"
            f"当前文档：\n{self.state.document}\n"
            f"{feedback_block}\n\n"
            "要求：\n"
            "1. 直接输出修改/完善后的文档正文；\n"
            "2. 若涉及代码，可在文档后附代码块；\n"
            "3. 不要输出 JSON 包装。"
        )
        self.state.document = self._run_single_task(
            "coder",
            "coding",
            description,
            "一份已按计划/修改意见完善的文档。",
        )
        self._log("info", "Coder 修改完成")

    def _run_reviewing(self) -> None:
        """Reviewer：按量化合入标准审查，输出结构化结论并写入 review_history。"""
        import run_revachol_crew as rrc

        # 上下文截断：Kimi 对大文档审查耗时长，控制输入体积以降低超时概率
        plan_text = (self.state.plan or "").strip()
        doc_text = (self.state.document or "").strip()
        if len(plan_text) > _MAX_REVIEW_PLAN_CHARS:
            plan_text = plan_text[:_MAX_REVIEW_PLAN_CHARS] + "\n...[计划已截断]"
        if len(doc_text) > _MAX_REVIEW_DOC_CHARS:
            doc_text = doc_text[:_MAX_REVIEW_DOC_CHARS] + "\n...[文档已截断]"

        description = (
            "你是代码审查员。请审查以下文档/代码，输出结构化 JSON 审查结论：\n\n"
            f"计划：\n{plan_text}\n\n"
            f"文档：\n{doc_text}\n\n"
            "审查维度：逻辑与计划一致性、测试、静态检查、构建、安全、文档同步。\n"
            "审查分级标准：\n"
            "- P0：数据丢失、安全漏洞、核心功能不可用；\n"
            "- P1：明确功能缺陷、接口契约错误、会导致返工的问题；\n"
            "- P2 及以下：样式细节、体验优化、文档措辞、低风险建议。\n"
            "合入规则：不允许存在 P0/P1 级别问题；P2 及以下问题可以存在，"
            "不影响合入，但仍应在 issues/suggestions 中记录。\n"
            "若 approved 为 false，必须在 feedback 中给出具体、可执行的 P0/P1 修改意见。"
            + rrc.build_output_requirement(rrc.ReviewOutput)
        )
        raw = self._run_single_task(
            "reviewer",
            "review",
            description,
            "符合上述 JSON Schema 的审查结论：approved、summary、issues、suggestions、review_standard。",
        )
        parsed = rrc.parse_and_validate_output(
            raw, rrc.ReviewOutput, task_name="review", log_fn=self._log
        )

        now = datetime.now().isoformat()
        if parsed is not None:
            feedback = (
                "\n".join(parsed.suggestions)
                if parsed.suggestions
                else (parsed.summary or "请根据 issues 修改。")
            )
            entry = {
                "approved": bool(parsed.approved),
                "summary": parsed.summary,
                "issues": parsed.issues,
                "suggestions": parsed.suggestions,
                "review_standard": parsed.review_standard,
                "feedback": feedback,
                "timestamp": now,
            }
        else:
            # 解析失败按“不通过”处理，避免未审查内容直接合入
            entry = {
                "approved": False,
                "summary": raw[:500],
                "issues": [],
                "suggestions": [],
                "review_standard": "parse-fallback",
                "feedback": "审查输出解析失败，请人工复核。",
                "timestamp": now,
            }

        self.state.review_history.append(entry)
        self.state.review_feedback = entry["feedback"]
        self._log(
            "info",
            f"Reviewer 审查完成（第 {len(self.state.review_history)} 次，"
            f"approved={entry['approved']}）",
        )

    def _run_merging(self) -> None:
        """Document_Admin：合入通过项并同步相关文档。"""
        doc_text = (self.state.document or "").strip()
        if len(doc_text) > _MAX_MERGE_DOC_CHARS:
            doc_text = doc_text[:_MAX_MERGE_DOC_CHARS] + "\n...[文档已截断]"

        description = (
            "你是文档处理员。以下文档已通过审查，请执行合入并同步相关文档：\n\n"
            f"需求：{self.state.requirement}\n\n"
            f"计划：\n{self.state.plan}\n\n"
            f"文档：\n{doc_text}\n\n"
            "请确认合入完成，并简要说明同步了哪些文档。"
        )
        self._run_single_task(
            "document_admin",
            "merging",
            description,
            "合入确认与文档同步说明。",
        )
        self._log("info", "Document_Admin 合入完成")

    def _run_staging(self) -> None:
        """系统步骤：写入暂存区快照 + 自动通知人工 + 安排 30 天清理（D3/D4）。"""
        state = self.state
        # 幂等：重复执行不产生重复快照/重复通知
        if state.staging_area and state.notified_at:
            self._log("info", f"暂存区步骤幂等跳过：{state.staging_area}")
            return

        state.staging_area = str(staging_dir_for(state.task_id))
        write_staging_snapshot(state)
        notify_human(state, emitter=self.emitter)
        schedule_cleanup(days=state.retention_days)
        self._log("warning", f"任务 {state.task_id} 已进入暂存区: {state.staging_area}")

    def _run_failure_report(self) -> None:
        """Document_Admin：撰写未通过审查报告并更新文档。"""
        state = self.state
        if state.failure_report:
            self._log("info", f"未通过审查报告已存在，幂等跳过：{state.failure_report}")
            return

        history_lines = []
        for i, entry in enumerate(state.review_history, start=1):
            history_lines.append(
                f"### 第 {i} 次审查\n"
                f"- approved: {entry.get('approved')}\n"
                f"- feedback: {entry.get('feedback', '')}\n"
                f"- timestamp: {entry.get('timestamp', '')}\n"
            )

        report = (
            "# 未通过审查报告\n\n"
            f"- 任务 ID：{state.task_id}\n"
            f"- 需求摘要：{state.requirement}\n"
            f"- 最终审查轮次：{len(state.review_history)}\n"
            f"- 最终未通过原因：{state.review_feedback}\n\n"
            "## 审查意见汇总\n\n"
            + "\n".join(history_lines)
            + "\n\n## 建议后续动作\n\n"
            "1. 人工介入复核暂存区快照；\n"
            "2. 等待仲裁（未来项，本期不实施）；\n"
            "3. 或关闭任务。\n"
        )

        report_path = staging_dir_for(state.task_id) / "failure_report.md"
        report_path.write_text(report, encoding="utf-8")
        state.failure_report = str(report_path)

        # 调用 Document_Admin 检查/更新知识库文档（真实执行时启用）
        try:
            description = (
                "你是文档处理员。请基于以下未通过审查报告，检查 knowledge/docs/ 下"
                "相关文档是否需要标记“待修订”或补充已知问题，并输出检查结论。\n\n"
                f"{report}"
            )
            self._run_single_task(
                "document_admin",
                "failure_report",
                description,
                "知识库文档检查与更新结论。",
            )
        except Exception as exc:  # noqa: BLE001 - 报告已落盘，文档检查失败不阻断
            self._log("warning", f"Document_Admin 文档检查失败（报告已生成）: {exc}")

        self._log("error", f"未通过审查报告已生成: {report_path}")

    # =====================================================================
    # 状态机 / 路由
    # =====================================================================

    @start()
    def planning(self) -> None:
        """进入 Planning：首次制定计划；恢复快照时按状态跳过重复规划。"""
        resume_status = self.state.status
        if resume_status in (FlowStatus.REVIEWING, FlowStatus.STAGED, FlowStatus.FAILED):
            # D7 断点续跑：从快照恢复时保留现场，不重新规划
            self._log(
                "info",
                f"从快照恢复（status={resume_status.value}），跳过重复 Planning",
            )
        else:
            self._run_planning(revision=self.state.revision_count > 0)
            self.state.status = FlowStatus.PLANNING
        self._checkpoint()

    @router(planning)
    def route_after_planning(self) -> Literal[
        "draft_doc", "code_doc", "resume_reviewing", "resume_staging", "resume_done"
    ]:
        """首次撰写 vs 修改循环（D1）；同时处理断点续跑路由。"""
        if self.state.status == FlowStatus.REVIEWING:
            return _RESUME_REVIEWING
        if self.state.status == FlowStatus.STAGED:
            return _RESUME_STAGING
        if self.state.status == FlowStatus.FAILED:
            return _RESUME_DONE
        if self.state.revision_count == 0:
            return _DRAFT_DOC  # 首次：TextProcessor 先行撰写
        return _CODE_DOC  # 修改循环：直接交 Coder

    @listen(_DRAFT_DOC)
    def drafting(self) -> None:
        """TextProcessor 首次撰写初稿。"""
        self._run_drafting()
        self.state.status = FlowStatus.DRAFTING
        self._checkpoint()

    @listen(or_("drafting", _CODE_DOC))
    def coding(self) -> None:
        """Coder 修改/完善文档。"""
        self._run_coding()
        self.state.status = FlowStatus.CODING
        self._checkpoint()

    @router(coding)
    def route_after_coding(self) -> Literal["resume_reviewing"]:
        """Coding 完成后统一进入 Reviewing（首次撰写与修改循环均适用）。

        使用独立 router 而非 or_("coding", ...) 监听器：断点续跑时 coding
        可能是本轮首次执行，CrewAI 的 OR 监听器不会被循环清理重新武装，
        会导致修改循环后 Reviewer 不再触发（RFC-001 审查循环中断）。
        """
        return _RESUME_REVIEWING

    @listen(_RESUME_REVIEWING)
    def reviewing(self) -> None:
        """Reviewer 审查。"""
        self._run_reviewing()
        self.state.status = FlowStatus.REVIEWING
        self._checkpoint()

    @router(reviewing)
    def route_after_review(self) -> Literal["merge_approved", "revise_plan", "stage_failed"]:
        """审查结论路由（D2：总计最多 3 次审查）。

        临时模式：设置环境变量 CREW_REVIEWER_BLOCK_DISABLED=1 时，
        Reviewer 仅作为质量审查（记录 issues/suggestions），不再禁止合入。
        """
        if os.getenv("CREW_REVIEWER_BLOCK_DISABLED") == "1":
            self._log(
                "warning",
                "Reviewer 禁止合入权限已临时禁用（仅质量审查），直接进入合入",
            )
            return _MERGE_APPROVED

        approved = bool(self.state.review_history[-1].get("approved", False)) if self.state.review_history else False
        if approved:
            return _MERGE_APPROVED

        self.state.revision_count += 1
        self.state.touch()
        if self.state.revision_count < self.state.max_review_rounds:
            self._log("warning", f"审查不通过，revision_count={self.state.revision_count}，返回修订规划")
            return _REVISE_PLAN
        self._log("error", f"已满 {self.state.max_review_rounds} 次审查，进入暂存区")
        return _STAGE_FAILED

    @listen(_REVISE_PLAN)
    def planning_revision(self) -> None:
        """Planner 消化修改意见并制定修订版计划。"""
        self._run_planning(revision=True)
        self.state.status = FlowStatus.PLANNING
        self._checkpoint()

    @router(planning_revision)
    def route_after_revision(self) -> Literal["code_doc"]:
        """修改循环：新计划直接交 Coder（D1）。"""
        return _CODE_DOC

    @listen(_MERGE_APPROVED)
    def merging(self) -> None:
        """Document_Admin 合入并同步文档。"""
        self._run_merging()
        self.state.status = FlowStatus.MERGED
        self._checkpoint()

    @listen(or_(_STAGE_FAILED, _RESUME_STAGING))
    def staging(self) -> None:
        """进入暂存区（D3/D4）。"""
        self._run_staging()
        self.state.status = FlowStatus.STAGED
        self._checkpoint()

    @listen("staging")
    def failure_report(self) -> None:
        """Document_Admin 撰写未通过审查报告（幂等）。"""
        self._run_failure_report()
        self.state.status = FlowStatus.FAILED
        self._checkpoint()

    @listen(_RESUME_DONE)
    def resume_done(self) -> None:
        """断点续跑已完成任务时的收尾节点。"""
        self._log("info", f"任务 {self.state.task_id} 已处于终态 {self.state.status.value}，无需继续执行")
