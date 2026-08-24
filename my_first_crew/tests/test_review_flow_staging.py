# -*- coding: utf-8 -*-
"""RFC-001 D3/D4 暂存区测试：快照写入、通知人工、30 天清理。"""

import json
import os
from datetime import datetime, timedelta

import pytest

from flows.staging import (
    cleanup_expired_staging,
    notify_human,
    staging_dir_for,
    write_staging_snapshot,
)
from flows.state import ReviewLoopState


@pytest.fixture()
def tmp_output(tmp_path, monkeypatch):
    monkeypatch.setenv("CREW_OUTPUT_DIR", str(tmp_path))
    return tmp_path


class _FakeEmitter:
    def __init__(self):
        self.events = []
        self.logs = []

    def log(self, message, level="info"):
        self.logs.append((level, message))

    def _emit(self, type_, **payload):
        self.events.append((type_, payload))


def test_write_staging_snapshot(tmp_output):
    state = ReviewLoopState(
        task_id="staging-task",
        requirement="需求",
        plan="计划",
        document="文档",
        code="代码",
        review_feedback="意见",
        revision_count=3,
        review_history=[{"approved": False, "feedback": "x"}],
    )
    path = write_staging_snapshot(state)
    assert path.name == "snapshot.json"
    assert path.parent.name == "staging-task"

    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["task_id"] == "staging-task"
    assert data["plan"] == "计划"
    assert data["document"] == "文档"
    assert data["code"] == "代码"
    assert data["review_history"] == state.review_history
    assert data["review_feedback"] == "意见"
    assert data["revision_count"] == 3
    assert data["retention_days"] == 30


def test_notify_human_sets_notified_at_and_emits(tmp_output):
    state = ReviewLoopState(task_id="notify-task", notify_channel="crew-dashboard")
    emitter = _FakeEmitter()

    notified = notify_human(state, emitter=emitter)

    assert notified == state.notified_at
    assert state.notified_at is not None
    assert len(emitter.events) == 1
    assert emitter.events[0][0] == "flow:staged"
    assert emitter.events[0][1]["task_id"] == "notify-task"
    assert emitter.events[0][1]["channel"] == "crew-dashboard"
    assert emitter.logs  # 事件日志


def test_notify_human_is_idempotent(tmp_output):
    state = ReviewLoopState(task_id="notify-task")
    emitter = _FakeEmitter()
    first = notify_human(state, emitter=emitter)
    second = notify_human(state, emitter=emitter)
    assert first == second
    assert len(emitter.events) == 1  # 只广播一次


def test_cleanup_expired_staging(tmp_output):
    root = staging_dir_for("old-task")
    (root / "snapshot.json").write_text("{}", encoding="utf-8")
    old_mtime = datetime.now() - timedelta(days=31)
    os.utime(root, (old_mtime.timestamp(), old_mtime.timestamp()))

    fresh = staging_dir_for("fresh-task")
    (fresh / "snapshot.json").write_text("{}", encoding="utf-8")

    removed = cleanup_expired_staging(days=30, now=datetime.now())
    assert root in removed
    assert not root.exists()
    assert fresh.exists()
    assert len(removed) == 1


def test_cleanup_keeps_recent(tmp_output):
    staging_dir_for("recent-task")  # mtime 为当前时间
    removed = cleanup_expired_staging(days=30)
    assert removed == []
