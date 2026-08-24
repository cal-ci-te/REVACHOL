#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""run_revachol_flow.py — RFC-001 CrewAI Flow 入口（双入口之一）。

与既有 run_revachol_crew.py 并存（灰度迁移第 1 步：双入口）：
- 旧入口：run_revachol_crew.py            （Crew 顺序执行）
- 新入口：run_revachol_flow.py            （Flow 状态机 + 审查循环）

无头模式（后端 child_process 调用）：
    python run_revachol_flow.py --once --json-logs --requirement "你的需求"
    python run_revachol_flow.py --once --json-logs --resume <task_id>

其他：
    python run_revachol_flow.py --dry-run --requirement "..."   # 安全验证
    python run_revachol_flow.py --cleanup-staging --days 30     # 清理过期暂存
"""

# 在导入 CrewAI / httpx 之前禁用异步客户端，避免退出时 asyncio 事件循环冲突
import os

os.environ.setdefault("CREWAI_DISABLE_ASYNC", "1")
os.environ.setdefault("HTTPX_USE_SYNC", "1")

import argparse
import json
import sys

from dotenv import load_dotenv

from run_revachol_crew import (
    JsonLogEmitter,
    check_uvx_available,
    setup_logging,
    validate_env,
)
from flows.persistence import load_state_snapshot

# ============================================================================
# 环境加载
# ============================================================================

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(_ENV_PATH)

# ============================================================================
# 事件发射器
# ============================================================================


class FlowJsonLogEmitter(JsonLogEmitter):
    """Flow 版 NDJSON 发射器：事件类型使用 flow:* 前缀，便于与 crew:* 区分。"""

    def log(self, message: str, level: str = "info") -> None:
        self._emit("flow:log", level=level, message=str(message))

    def set_agent_status(
        self, agent: str, status: str, task: str = "", detail: str = ""
    ) -> None:
        self._emit(
            "flow:agent-status",
            agent=agent,
            status=status,
            task=task,
            detail=detail,
        )

    def set_task(self, task_name: str) -> None:
        self._emit("flow:task", task=task_name or "")

    def set_output(self, content: str, is_json: bool = False) -> None:
        self._emit(
            "flow:output",
            content=(content or "")[:2000],
            is_json=bool(is_json),
        )

    def update_stats(
        self,
        agent: str,
        tokens: int,
        cost: float = 0.0,
        model: str = "unknown",
        provider: str = "unknown",
    ) -> None:
        self._emit(
            "flow:stats",
            agent=agent,
            model=model,
            provider=provider,
            tokens=int(tokens or 0),
            cost=float(cost or 0.0),
        )


class ConsoleEmitter:
    """非 NDJSON 模式的简单控制台输出（实现同一组接口）。"""

    def __init__(self, debug: bool = False):
        self.debug_mode = debug
        self.is_running = False
        self.input_active = False
        self.output_panel = None

    def log(self, message: str, level: str = "info") -> None:
        prefix = {"info": "ℹ", "success": "✅", "warning": "⚠️", "error": "❌"}.get(
            level, "•"
        )
        print(f"{prefix} {message}", flush=True)

    def set_agent_status(
        self, agent: str, status: str, task: str = "", detail: str = ""
    ) -> None:
        print(f"👤 [{agent}] {status} {task} {detail}".strip(), flush=True)

    def set_task(self, task_name: str) -> None:
        print(f"📋 当前状态: {task_name}", flush=True)

    def set_output(self, content: str, is_json: bool = False) -> None:
        if self.debug_mode:
            print(f"--- output ---\n{content}\n--- end ---", flush=True)

    def update_stats(
        self,
        agent: str,
        tokens: int,
        cost: float = 0.0,
        model: str = "unknown",
        provider: str = "unknown",
    ) -> None:
        print(f"📊 [{agent}] tokens={tokens} cost={cost} model={model}", flush=True)

    def _emit(self, type_: str, **payload) -> None:
        print(
            f"[EVENT {type_}] {json.dumps(payload, ensure_ascii=False)}",
            flush=True,
        )


# ============================================================================
# 参数
# ============================================================================


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="REVACHOL CrewAI Flow 入口（RFC-001：文本处理员先行 + 审查循环）"
    )
    parser.add_argument(
        "--requirement",
        type=str,
        default=None,
        help="本次任务的需求描述（Flow 初始状态）；--resume 时忽略",
    )
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        metavar="TASK_ID",
        help="从 output/flow_state/<task_id>.json 恢复执行（D7 断点续跑）",
    )
    parser.add_argument(
        "--cleanup-staging",
        action="store_true",
        help="清理超过保留期的暂存快照后退出（D3）",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="暂存快照保留天数（默认 30，配合 --cleanup-staging）",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="开启 LITELLM_LOG=DEBUG 与 DEBUG 日志",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只构建 Flow 并打印摘要，不执行 kickoff",
    )
    parser.add_argument(
        "--no-output-files",
        action="store_true",
        help="不写 Flow 状态快照与暂存文件",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="只执行一次后退出（供后端 child_process.spawn 无头调用）",
    )
    parser.add_argument(
        "--json-logs",
        action="store_true",
        help="向 stdout 输出 NDJSON 结构化事件流（flow:* 事件），隐含 --once",
    )
    return parser.parse_args()


# ============================================================================
# 主入口
# ============================================================================


def build_flow(emitter, save_snapshots: bool):
    """构建 DocumentReviewFlow 实例。"""
    from flows.document_review_flow import DocumentReviewFlow

    return DocumentReviewFlow(
        emitter=emitter,
        save_snapshots=save_snapshots,
    )


def restore_flow_state(flow, state) -> None:
    """将 ReviewLoopState 快照恢复到 Flow。

    Flow.state 是只读 property（无 setter），因此逐字段回填。
    """
    from flows.state import ReviewLoopState

    for name in ReviewLoopState.model_fields:
        setattr(flow.state, name, getattr(state, name))


def main() -> None:
    args = parse_args()
    setup_logging(args.debug, quiet=args.json_logs)

    # ---- 清理暂存区（D3，不依赖 API Key）----
    if args.cleanup_staging:
        from flows.staging import cleanup_expired_staging

        removed = cleanup_expired_staging(days=args.days)
        print(f"清理完成：删除 {len(removed)} 个过期暂存目录", flush=True)
        for path in removed:
            print(f"  - {path}", flush=True)
        return

    validate_env()

    if args.json_logs:
        args.once = True

    if args.once:
        if not args.resume and not args.requirement:
            raise RuntimeError(
                "[配置错误] --once/--json-logs 模式必须提供 --requirement 或 --resume"
            )
        emitter = FlowJsonLogEmitter(debug=args.debug)
        emitter.is_running = True
        emitter._emit(
            "flow:started",
            requirement=args.requirement or "",
            resume=args.resume or "",
            debug=args.debug,
            dry_run=args.dry_run,
        )
        if not check_uvx_available():
            emitter.log(
                "⚠️ uvx 未在 PATH 中找到。MCP Git 服务器将无法启动（Document_Admin 相关步骤受限）。",
                "warning",
            )
        try:
            if args.dry_run:
                flow = build_flow(emitter, save_snapshots=not args.no_output_files)
                if args.resume:
                    state = load_state_snapshot(args.resume)
                    if state is None:
                        raise RuntimeError(f"[配置错误] 未找到快照: {args.resume}")
                    restore_flow_state(flow, state)
                else:
                    flow.state.requirement = args.requirement or ""
                print_flow_summary(flow, emitter)
                emitter.log("📋 Dry-run 模式，不执行实际任务", "warning")
                emitter._emit("flow:finished", success=True, error=None)
            else:
                run_flow(emitter, args)
                emitter._emit("flow:finished", success=True, error=None)
        except Exception as exc:  # noqa: BLE001
            emitter.log(f"❌ Flow 执行失败: {exc}", "error")
            emitter._emit("flow:finished", success=False, error=str(exc))
            raise
        finally:
            emitter.is_running = False
        return

    # ---- 本地单次执行（非 TUI，输出到控制台）----
    emitter = ConsoleEmitter(debug=args.debug)
    emitter.is_running = True
    try:
        run_flow(emitter, args)
        emitter.log("✅ Flow 执行完成", "success")
    except Exception as exc:  # noqa: BLE001
        emitter.log(f"❌ Flow 执行失败: {exc}", "error")
        sys.exit(1)
    finally:
        emitter.is_running = False


def run_flow(emitter, args: argparse.Namespace) -> None:
    """执行一轮 Flow：恢复快照或新建状态 -> kickoff。"""
    flow = build_flow(emitter, save_snapshots=not args.no_output_files)

    if args.resume:
        state = load_state_snapshot(args.resume)
        if state is None:
            raise RuntimeError(f"[配置错误] 未找到 Flow 状态快照: {args.resume}")
        restore_flow_state(flow, state)
        emitter.log(f"↪️ 从快照恢复任务 {state.task_id}（status={state.status.value}）", "info")
    else:
        if not args.requirement:
            raise RuntimeError("[配置错误] 本地模式需要 --requirement 或 --resume")
        flow.state.requirement = args.requirement
        emitter.log(f"🚀 开始新 Flow 任务：{args.requirement[:80]}", "info")

    print_flow_summary(flow, emitter)
    flow.kickoff()

    # 汇总
    state = flow.state
    emitter.log(
        f"🏁 最终状态: {state.status.value} | 审查次数: {len(state.review_history)} | "
        f"revision_count: {state.revision_count}",
        "info",
    )
    if state.staging_area:
        emitter.log(f"📁 暂存区: {state.staging_area}", "warning")
    if state.failure_report:
        emitter.log(f"📄 未通过审查报告: {state.failure_report}", "warning")


def print_flow_summary(flow, emitter) -> None:
    """打印 Flow 配置摘要（含状态机链路与参与 Agent，便于与旧 Crew 摘要区分）。"""
    state = flow.state
    lines = [
        "=" * 60,
        "REVACHOL Flow 配置摘要（RFC-001）",
        "=" * 60,
        f"  task_id          = {state.task_id}",
        f"  requirement      = {(state.requirement or '')[:60]}",
        f"  状态机链路       = Planning → Drafting → Coding → Reviewing ↺ → Merging / Staging → FailureReport",
        f"  参与 Agent       = Planner / TextProcessor / Coder / Reviewer / Document_Admin",
        f"  max_review_rounds= {state.max_review_rounds}",
        f"  max_revisions    = {state.max_revisions}",
        f"  status           = {state.status.value}",
        f"  revision_count   = {state.revision_count}",
        f"  review_history   = {len(state.review_history)} 条",
        "=" * 60,
    ]
    emitter.log("\n".join(lines), "info")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"\n❌ {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n已手动中断。", file=sys.stderr)
        sys.exit(130)
