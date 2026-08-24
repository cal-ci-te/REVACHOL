# -*- coding: utf-8 -*-
"""RFC-001 路由单元测试：route_after_review / route_after_planning 全部分支。"""

import pytest

from flows.document_review_flow import DocumentReviewFlow
from flows.state import FlowStatus, ReviewLoopState


@pytest.fixture()
def flow():
    return DocumentReviewFlow(emitter=None, save_snapshots=False)


def _set_history(flow, approved: bool):
    flow.state.review_history = [
        {
            "approved": approved,
            "feedback": "ok" if approved else "需要修改",
            "timestamp": "2026-08-24T00:00:00",
        }
    ]


class TestRouteAfterReview:
    def test_approved_routes_to_merging(self, flow):
        _set_history(flow, True)
        assert flow.route_after_review() == "merge_approved"
        # 通过不累计 revision_count
        assert flow.state.revision_count == 0

    def test_first_rejection_routes_to_revise_plan(self, flow):
        _set_history(flow, False)
        assert flow.route_after_review() == "revise_plan"
        assert flow.state.revision_count == 1

    def test_second_rejection_routes_to_revise_plan(self, flow):
        flow.state.revision_count = 1
        _set_history(flow, False)
        assert flow.route_after_review() == "revise_plan"
        assert flow.state.revision_count == 2

    def test_third_rejection_routes_to_staging(self, flow):
        flow.state.revision_count = 2
        _set_history(flow, False)
        assert flow.route_after_review() == "stage_failed"
        assert flow.state.revision_count == 3

    def test_max_review_rounds_one(self):
        """边界：max_review_rounds=1 时，第一次不通过直接进暂存区。"""
        flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
        flow.state.max_review_rounds = 1
        flow.state.max_revisions = 0
        _set_history(flow, False)
        assert flow.route_after_review() == "stage_failed"
        assert flow.state.revision_count == 1

    def test_empty_history_treated_as_rejected(self, flow):
        flow.state.review_history = []
        assert flow.route_after_review() == "revise_plan"
        assert flow.state.revision_count == 1


class TestRouteAfterPlanning:
    def test_first_time_routes_to_drafting(self, flow):
        flow.state.revision_count = 0
        assert flow.route_after_planning() == "draft_doc"

    def test_revision_routes_to_coding(self, flow):
        flow.state.revision_count = 1
        assert flow.route_after_planning() == "code_doc"

    def test_resume_reviewing(self, flow):
        flow.state.status = FlowStatus.REVIEWING
        assert flow.route_after_planning() == "resume_reviewing"

    def test_resume_staging(self, flow):
        flow.state.status = FlowStatus.STAGED
        assert flow.route_after_planning() == "resume_staging"

    def test_resume_failed(self, flow):
        flow.state.status = FlowStatus.FAILED
        assert flow.route_after_planning() == "flow_done"


class TestStateDefaults:
    def test_review_loop_state_matches_rfc(self):
        state = ReviewLoopState(requirement="测试需求")
        assert state.max_review_rounds == 3
        assert state.max_revisions == 2
        assert state.revision_count == 0
        assert state.retention_days == 30
        assert state.notify_channel == "crew-dashboard"
        assert state.status == FlowStatus.PLANNING
        assert state.task_id  # 自动生成
