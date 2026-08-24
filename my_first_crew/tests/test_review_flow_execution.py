# -*- coding: utf-8 -*-
"""RFC-001 端到端执行测试：通过实例级 monkeypatch 覆写 _run_* 验证完整状态机。

说明：CrewAI 1.15.17 的 Flow 结构定义不继承到子类（flow_definition.methods 为空），
因此这里不采用子类覆写，而是直接替换实例方法，保持基类状态机结构不变。
"""

import pytest

from flows.document_review_flow import DocumentReviewFlow
from flows.state import FlowStatus


def make_flow(approvals):
    """构建一个不调用 LLM 的 Flow，按预设 approvals 序列模拟 Reviewer 结论。"""
    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    counter = {
        "approvals": list(approvals),
        "i": 0,
        "plan": 0,
        "draft": 0,
        "code": 0,
        "merge": 0,
        "stage": 0,
        "report": 0,
    }

    def _run_planning(revision: bool = False) -> None:
        counter["plan"] += 1
        flow.state.plan = f"plan-{counter['plan']}"

    def _run_drafting() -> None:
        counter["draft"] += 1
        flow.state.document = "draft"

    def _run_coding() -> None:
        counter["code"] += 1
        flow.state.document = f"code-{counter['code']}"

    def _run_reviewing() -> None:
        approved = (
            counter["approvals"][counter["i"]]
            if counter["i"] < len(counter["approvals"])
            else False
        )
        counter["i"] += 1
        flow.state.review_history.append(
            {
                "approved": approved,
                "feedback": "ok" if approved else "请修改",
                "timestamp": "2026-08-24T00:00:00",
            }
        )
        flow.state.review_feedback = "ok" if approved else "请修改"

    def _run_merging() -> None:
        counter["merge"] += 1

    def _run_staging() -> None:
        counter["stage"] += 1
        flow.state.staging_area = "output/staging/test"

    def _run_failure_report() -> None:
        counter["report"] += 1
        flow.state.failure_report = "output/staging/test/failure_report.md"

    flow._run_planning = _run_planning
    flow._run_drafting = _run_drafting
    flow._run_coding = _run_coding
    flow._run_reviewing = _run_reviewing
    flow._run_merging = _run_merging
    flow._run_staging = _run_staging
    flow._run_failure_report = _run_failure_report
    return flow, counter


class TestExecution:
    def test_first_review_approved_merges(self):
        flow, c = make_flow([True])
        flow.state.requirement = "测试需求"
        flow.kickoff()

        assert flow.state.status == FlowStatus.MERGED
        assert c["plan"] == 1
        assert c["draft"] == 1  # TextProcessor 首次撰写
        assert c["code"] == 1  # Coder 承接初稿后提交
        assert c["merge"] == 1
        assert flow.state.revision_count == 0
        assert len(flow.state.review_history) == 1
        assert c["stage"] == 0

    def test_second_review_approved_merges_after_one_revision(self):
        flow, c = make_flow([False, True])
        flow.state.requirement = "测试需求"
        flow.kickoff()

        assert flow.state.status == FlowStatus.MERGED
        assert c["plan"] == 2  # 初始计划 + 修订计划
        assert c["draft"] == 1  # TextProcessor 仅首次撰写（D1）
        assert c["code"] == 2  # 首次提交 + 修改循环提交
        assert c["merge"] == 1
        assert flow.state.revision_count == 1
        assert len(flow.state.review_history) == 2

    def test_three_rejections_go_to_staging_and_failure_report(self):
        flow, c = make_flow([False, False, False])
        flow.state.requirement = "测试需求"
        flow.kickoff()

        assert flow.state.status == FlowStatus.FAILED  # failure_report 后终态
        assert flow.state.revision_count == 3
        assert len(flow.state.review_history) == 3
        assert c["stage"] == 1
        assert c["report"] == 1
        assert flow.state.staging_area == "output/staging/test"
        assert flow.state.failure_report == "output/staging/test/failure_report.md"
        assert c["merge"] == 0

    def test_drafting_only_happens_once(self):
        """D1：即使多轮修改，TextProcessor 也只调用一次。"""
        flow, c = make_flow([False, False, True])
        flow.state.requirement = "测试需求"
        flow.kickoff()

        assert flow.state.status == FlowStatus.MERGED
        assert c["draft"] == 1
        assert c["code"] == 3
        assert flow.state.revision_count == 2
        assert len(flow.state.review_history) == 3


class TestResumeExecution:
    def test_resume_from_reviewing_skips_planning_and_drafting(self):
        """D7：从 Reviewing 恢复时不再重新规划/撰写，直接回到审查。"""
        flow, c = make_flow([True])
        flow.state.requirement = "测试需求"
        flow.state.status = FlowStatus.REVIEWING  # 模拟中断在审查前
        flow.state.review_history = []
        flow.kickoff()

        assert flow.state.status == FlowStatus.MERGED
        assert c["plan"] == 0  # 恢复路径跳过 Planning
        assert c["draft"] == 0
        assert c["code"] == 0
        assert c["merge"] == 1

    def test_resume_from_staging_reaches_failure_report(self):
        """D7：从 Staging 恢复时进入暂存与失败报告。"""
        flow, c = make_flow([])
        flow.state.requirement = "测试需求"
        flow.state.status = FlowStatus.STAGED
        flow.state.staging_area = "output/staging/resume-test"
        flow.state.notified_at = "2026-08-24T00:00:00"
        flow.kickoff()

        # staging 内部幂等：已有 staging_area 与 notified_at 时跳过重复写入/通知
        assert c["stage"] == 1  # _run_staging 被调用但幂等返回
        assert c["report"] == 1
        assert flow.state.status == FlowStatus.FAILED
