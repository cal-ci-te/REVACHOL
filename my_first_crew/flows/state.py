# -*- coding: utf-8 -*-
"""RFC-001 数据模型：FlowStatus 与 ReviewLoopState。"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class FlowStatus(str, Enum):
    """工作流状态枚举（本期不包含仲裁/样式状态，见 RFC-001 未来工作）。"""

    PLANNING = "planning"    # 计划制定中
    DRAFTING = "drafting"    # 文本处理员撰写初稿中（仅首次）
    CODING = "coding"        # Coder 修改中
    REVIEWING = "reviewing"  # Reviewer 审查中
    MERGED = "merged"        # 已合入
    STAGED = "staged"        # 已进入暂存区
    FAILED = "failed"        # 已出未通过审查报告，任务关闭


class ReviewLoopState(BaseModel):
    """文档撰写 + 审查修改循环的 Flow 状态（RFC-001 数据模型）。"""

    # 任务标识
    task_id: str = Field(default_factory=lambda: datetime.now().strftime("%Y%m%d%H%M%S"))
    requirement: str = ""  # 原始需求描述

    # 各阶段产物
    plan: str = ""  # Planner 产出（初始/修订版）
    document: str = ""  # TextProcessor 初稿 / Coder 修改后的文档
    code: str = ""  # Coder 产出的代码或补丁
    review_feedback: str = ""  # Reviewer 最近一次修改意见

    # 循环控制（决议 D2：总计最多 3 次审查）
    revision_count: int = 0  # 累计审查不通过次数（0..3）
    max_review_rounds: int = 3  # 总计最多审查轮数（含初始审查）
    max_revisions: int = 2  # 修改循环上限 = max_review_rounds - 1
    status: FlowStatus = FlowStatus.PLANNING  # 当前状态
    review_history: list[dict[str, Any]] = Field(default_factory=list)  # 审查历史

    # 暂存与失败闭环（决议 D3/D4）
    staging_area: Optional[str] = None  # 暂存区路径，如 output/staging/<task_id>
    retention_days: int = 30  # 暂存快照保留时长（天）
    notified_at: Optional[str] = None  # 自动通知人工时间（ISO 8601）
    notify_channel: str = "crew-dashboard"  # 通知渠道：crew-dashboard / webhook
    failure_report: Optional[str] = None  # 未通过审查报告路径或内容

    # 审计
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    def touch(self) -> None:
        """更新审计时间戳。"""
        self.updated_at = datetime.now().isoformat()
