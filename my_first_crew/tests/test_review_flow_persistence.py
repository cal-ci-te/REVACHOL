# -*- coding: utf-8 -*-
"""RFC-001 D7 断点续跑测试：状态快照保存 / 加载 / 列表。"""

import json

import pytest

from flows.persistence import (
    flow_state_dir,
    list_state_snapshots,
    load_state_snapshot,
    save_state_snapshot,
)
from flows.state import FlowStatus, ReviewLoopState


@pytest.fixture()
def tmp_output(tmp_path, monkeypatch):
    """将 CREW_OUTPUT_DIR 指向临时目录，避免污染真实 output/。"""
    monkeypatch.setenv("CREW_OUTPUT_DIR", str(tmp_path))
    return tmp_path


def test_save_and_load_roundtrip(tmp_output):
    state = ReviewLoopState(
        task_id="test-task-001",
        requirement="断点续跑测试需求",
        plan="plan",
        document="doc",
        code="code",
        revision_count=2,
        status=FlowStatus.REVIEWING,
        review_history=[
            {"approved": False, "feedback": "fix", "timestamp": "2026-08-24T00:00:00"}
        ],
    )
    path = save_state_snapshot(state)
    assert path.exists()
    assert path.name == "test-task-001.json"

    loaded = load_state_snapshot("test-task-001")
    assert loaded is not None
    assert loaded.task_id == state.task_id
    assert loaded.requirement == state.requirement
    assert loaded.revision_count == 2
    assert loaded.status == FlowStatus.REVIEWING
    assert loaded.review_history == state.review_history
    assert loaded.updated_at  # 保存时 touch


def test_load_missing_returns_none(tmp_output):
    assert load_state_snapshot("does-not-exist") is None


def test_list_snapshots(tmp_output):
    for i in range(2):
        save_state_snapshot(ReviewLoopState(task_id=f"task-{i}"))
    files = list_state_snapshots()
    assert len(files) == 2
    assert {f.name for f in files} == {"task-0.json", "task-1.json"}


def test_snapshot_json_contains_rfc_fields(tmp_output):
    state = ReviewLoopState(
        task_id="fields-task",
        requirement="req",
        plan="p",
        document="d",
        code="c",
        review_feedback="fb",
        revision_count=1,
        review_history=[{"approved": False}],
    )
    path = save_state_snapshot(state)
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in (
        "task_id",
        "requirement",
        "plan",
        "document",
        "code",
        "review_feedback",
        "revision_count",
        "review_history",
        "status",
        "staging_area",
        "retention_days",
        "notified_at",
        "notify_channel",
        "failure_report",
        "created_at",
        "updated_at",
    ):
        assert key in data
