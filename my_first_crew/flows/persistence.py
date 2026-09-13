# -*- coding: utf-8 -*-
# ！RFC-001 断点续跑
# 把 Flow 状态快照落盘并可再读回，使中断的流程能从上次状态继续。
"""RFC-001 D7 断点续跑：Flow 状态快照的保存 / 加载 / 列表。"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from .state import ReviewLoopState


def default_output_dir() -> Path:
    """返回运行产物根目录（兼容 CREW_OUTPUT_DIR 环境变量，Docker 挂载到 ./output）。"""
    # 环境变量优先：容器内挂载卷的位置由部署决定，不能写死在代码里
    env = os.getenv("CREW_OUTPUT_DIR")
    if env:
        return Path(env)
    # 回退到包目录的上一级：本地开发时产物与代码同仓，便于直接查看
    return Path(__file__).resolve().parent.parent / "output"


def flow_state_dir() -> Path:
    """Flow 状态快照目录：<output>/flow_state/。"""
    # 建目录放在此处而非调用方：任何取用该目录的路径都无需再关心目录是否存在
    d = default_output_dir() / "flow_state"
    d.mkdir(parents=True, exist_ok=True)
    return d


def state_file(task_id: str) -> Path:
    """单个任务的快照文件路径。"""
    # 以 task_id 为文件名：同一任务重复保存即覆盖同一文件，天然幂等
    return flow_state_dir() / f"{task_id}.json"


def save_state_snapshot(state: ReviewLoopState) -> Path:
    """将 Flow 状态写入 <output>/flow_state/<task_id>.json，返回路径。"""
    # 落盘前刷新 updated_at，使快照时间与「最后一次保存」一致
    state.touch()
    path = state_file(state.task_id)
    payload = state.model_dump(mode="json")
    # ensure_ascii=False：保留中文原样，便于人工直接查看快照文件
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path


def load_state_snapshot(task_id: str) -> Optional[ReviewLoopState]:
    """读取最近一次 Flow 状态快照；不存在返回 None。"""
    path = state_file(task_id)
    # 用 None 而非抛异常表示「无快照」：首次运行时这属正常情形，调用方据此新建状态
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return ReviewLoopState.model_validate(data)


def list_state_snapshots() -> list[Path]:
    """列出全部 Flow 状态快照文件（按文件名排序）。"""
    # 按文件名排序等价于按 task_id 排序，即时间顺序
    return sorted(flow_state_dir().glob("*.json"))
