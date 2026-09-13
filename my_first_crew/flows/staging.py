# -*- coding: utf-8 -*-
# ！RFC-001 暂存区
# 存放未通过审查的任务快照，并负责通知人工与超期清理。
"""RFC-001 D3/D4 暂存区：快照写入、自动通知人工、30 天清理。"""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from .state import ReviewLoopState


    # 目录按需创建，取用方无需先判断是否存在
def staging_root() -> Path:
    """暂存区根目录：<output>/staging/（兼容 CREW_OUTPUT_DIR）。"""
    env = os.getenv("CREW_OUTPUT_DIR")
    base = Path(env) if env else Path(__file__).resolve().parent.parent / "output"
    d = base / "staging"
    d.mkdir(parents=True, exist_ok=True)
    return d


    # 每个任务一个独立目录，避免不同任务的产物混在一处
def staging_dir_for(task_id: str) -> Path:
    """单个任务的暂存区目录：<output>/staging/<task_id>/。"""
    d = staging_root() / task_id
    d.mkdir(parents=True, exist_ok=True)
    return d


    # 写入 RFC-001 要求的字段集合，供人工审阅未通过的任务
def write_staging_snapshot(
    state: ReviewLoopState,
    base_dir: Optional[Path] = None,
) -> Path:
    """将未通过任务快照写入暂存区 snapshot.json，返回路径。

    快照包含 RFC-001 要求的 plan / document / code / review_history / review_feedback。
    """
    d = base_dir or staging_dir_for(state.task_id)
    d.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {
        "task_id": state.task_id,
        "requirement": state.requirement,
        "plan": state.plan,
        "document": state.document,
        "code": state.code,
        "review_history": state.review_history,
        "review_feedback": state.review_feedback,
        "revision_count": state.revision_count,
        "max_review_rounds": state.max_review_rounds,
        "status": state.status.value,
        "retention_days": state.retention_days,
        "staged_at": datetime.now().isoformat(),
    }
    path = d / "snapshot.json"
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


    # 通知人工并在状态上留痕；已有通知时间则直接返回，保证幂等
def notify_human(state: ReviewLoopState, emitter: Any = None) -> str:
    """决议 D4：进入暂存区后自动通知人工。

    默认渠道 crew-dashboard（通过 emitter 广播 flow:staged 事件并写事件日志），
    预留 webhook 通道（state.notify_channel 可切换为 webhook）。
    """
    if state.notified_at:
        # 幂等：重复执行不重复通知
        return state.notified_at

    notified_at = datetime.now().isoformat()
    state.notified_at = notified_at
    state.touch()

    if emitter is not None:
        log = getattr(emitter, "log", None)
        if callable(log):
            log(
                f"[FLOW_STAGED] 任务 {state.task_id} 已进入暂存区，等待人工处理："
                f"{state.staging_area or ''}",
                "warning",
            )
        emit = getattr(emitter, "_emit", None)
        if callable(emit):
            emit(
                "flow:staged",
                task_id=state.task_id,
                staging_area=state.staging_area,
                notified_at=notified_at,
                channel=state.notify_channel,
            )
    return notified_at


    # 仅保留扩展点：目前由命令行选项或外部 cron 触发，未内置定时器
def schedule_cleanup(days: int = 30) -> None:
    """决议 D3：安排 30 天清理。

    当前由 run_revachol_flow.py --cleanup-staging 或外部 cron 每日调用
    cleanup_expired_staging() 完成；此处保留扩展点（可接入后端定时任务）。
    """
    # 预留：生产环境可在此注册 cron / 后端定时任务。
    return None


    # 清理超期暂存目录并返回被删列表，供调用方记录
def cleanup_expired_staging(
    days: int = 30,
    now: Optional[datetime] = None,
    root: Optional[Path] = None,
) -> list[Path]:
    """删除超过 retention_days 的暂存快照目录，返回被删除的目录列表。"""
    # root 可注入，便于测试指向临时目录而不触碰真实 output/
    root = root or staging_root()
    if not root.exists():
        return []
    now = now or datetime.now()
    deadline = now - timedelta(days=days)
    removed: list[Path] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        # stat 可能因权限或竞态失败，单独兜住，不让单个条目中断整轮清理
        try:
            mtime = datetime.fromtimestamp(child.stat().st_mtime)
        except OSError:
            continue
        # 以目录自身 mtime 判定：目录即一个任务的全部产物，其时间即最后写入时间
        if mtime < deadline:
            # ignore_errors：清理属尽力而为，个别文件删不掉也不应中断整轮
            shutil.rmtree(child, ignore_errors=True)
            removed.append(child)
    return removed
