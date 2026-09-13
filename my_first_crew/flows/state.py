# -*- coding: utf-8 -*-
# ！RFC-001 数据模型
# 定义 FlowStatus 与 ReviewLoopState，后者贯穿文档撰写与审查循环的整个生命周期。
"""RFC-001 数据模型：FlowStatus 与 ReviewLoopState。"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class FlowStatus(str, Enum):
    """工作流状态枚举（本期不包含仲裁/样式状态，见 RFC-001 未来工作）。"""

    # 继承 str 以便直接序列化为字符串
    PLANNING = "planning"
    # DRAFTING 仅出现在首次撰写：后续修改一律走 CODING
    DRAFTING = "drafting"
    CODING = "coding"
    REVIEWING = "reviewing"
    MERGED = "merged"
    STAGED = "staged"
    # FAILED 表示已产出未通过审查报告并关闭任务，不再重试
    FAILED = "failed"


class ReviewLoopState(BaseModel):
    """文档撰写 + 审查修改循环的 Flow 状态（RFC-001 数据模型）。"""

    # task_id 默认取时间戳，未显式传入时也能得到可直接用作目录名的标识
    task_id: str = Field(default_factory=lambda: datetime.now().strftime("%Y%m%d%H%M%S"))
    requirement: str = ""

    # 各阶段产物，依次对应 Planner / TextProcessor / Coder / Reviewer 的输出
    # plan 会随审查反馈修订，故同一任务可能先后写入多版
    plan: str = ""
    # document 有两个来源：TextProcessor 的初稿，或 Coder 修改后的文档
    document: str = ""
    # code 可能是完整代码，也可能只是一段补丁
    code: str = ""
    # 只保留最近一次意见，历史意见统一在 review_history 中留档
    review_feedback: str = ""

    # 循环控制（决议 D2：总计最多 3 次审查）
    # revision_count 统计已发生的修改次数（取值 0..max_revisions）
    revision_count: int = 0
    # 轮数含初始审查，故 3 轮 = 首次审查 + 2 次复查
    max_review_rounds: int = 3
    # 修改上限由审查轮数派生：轮数 = 修改次数 + 1，故此处为轮数减一
    max_revisions: int = 2
    status: FlowStatus = FlowStatus.PLANNING
    review_history: list[dict[str, Any]] = Field(default_factory=list)

    # 暂存与失败闭环（决议 D3/D4）
    # staging_area 形如 output/staging/<task_id>；与 notified_at 为空即尚未暂存、尚未通知
    staging_area: Optional[str] = None
    # 单位为天
    retention_days: int = 30
    # ISO 8601 字符串
    notified_at: Optional[str] = None
    # 可选值 crew-dashboard / webhook；目前仅前者有实现
    notify_channel: str = "crew-dashboard"
    # 存报告的文件路径或报告正文
    failure_report: Optional[str] = None

    # 审计
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    def touch(self) -> None:
        """更新审计时间戳。"""
        # 只刷新 updated_at：created_at 一经构造即固定，保留首次创建时间
        self.updated_at = datetime.now().isoformat()
