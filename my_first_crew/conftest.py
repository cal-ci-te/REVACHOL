# -*- coding: utf-8 -*-
"""pytest 根配置：确保 my_first_crew/ 在 sys.path，可导入 flows 与 run_revachol_flow。"""

import os
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
