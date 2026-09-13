# -*- coding: utf-8 -*-
# ！pytest 根配置
# 把 my_first_crew/ 注入 sys.path，使测试能按包名导入 flows 与 run_revachol_flow。
"""pytest 根配置：确保 my_first_crew/ 在 sys.path，可导入 flows 与 run_revachol_flow。"""

import os
import sys

# 以本文件位置定位项目目录：仅依赖 __file__，不受执行时工作目录影响
_ROOT = os.path.dirname(os.path.abspath(__file__))
# 先判存在再插入，避免重复运行（如 pytest-xdist 多次导入）时堆积重复路径
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
