# ！终端 UI 包
# 实时展示多 Agent 协作状态，对外只导出下方 __all__ 中的三个符号。
"""
REVACHOL 终端 UI 模块
提供三栏式仪表盘布局，用于实时展示多Agent协作状态
"""

from .dashboard import Dashboard, wait_for_input
from .layout import LayoutManager

__all__ = ["Dashboard", "LayoutManager", "wait_for_input"]