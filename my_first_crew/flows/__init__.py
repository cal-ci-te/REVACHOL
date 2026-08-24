# -*- coding: utf-8 -*-
"""RFC-001 CrewAI Flow 工作流包。

包含：
- state：FlowStatus 枚举 + ReviewLoopState（Pydantic 状态模型）
- document_review_flow：DocumentReviewFlow（状态机 + 路由）
- persistence：断点续跑快照
- staging：暂存区、自动通知、30 天清理
"""
