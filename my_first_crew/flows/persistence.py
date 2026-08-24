# -*- coding: utf-8 -*-
"""RFC-001 D7 断点续跑：Flow 状态快照的保存 / 加载 / 列表。"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from .state import ReviewLoopState


def default_output_dir() -> Path:
    """返回运行产物根目录（兼容 CREW_OUTPUT_DIR 环境变量，Docker 挂载到 ./output）。"""
    env = os.getenv("CREW_OUTPUT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parent.parent / "output"


def flow_state_dir() -> Path:
    """Flow 状态快照目录：<output>/flow_state/。"""
    d = default_output_dir() / "flow_state"
    d.mkdir(parents=True, exist_ok=True)
    return d


def state_file(task_id: str) -> Path:
    """单个任务的快照文件路径。"""
    return flow_state_dir() / f"{task_id}.json"


def save_state_snapshot(state: ReviewLoopState) -> Path:
    """将 Flow 状态写入 <output>/flow_state/<task_id>.json，返回路径。"""
    state.touch()
    path = state_file(state.task_id)
    payload = state.model_dump(mode="json")
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def load_state_snapshot(task_id: str) -> Optional[ReviewLoopState]:
    """读取最近一次 Flow 状态快照；不存在返回 None。"""
    path = state_file(task_id)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return ReviewLoopState.model_validate(data)


def list_state_snapshots() -> list[Path]:
    """列出全部 Flow 状态快照文件（按文件名排序）。"""
    return sorted(flow_state_dir().glob("*.json"))
