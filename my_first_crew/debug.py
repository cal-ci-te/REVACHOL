import os
import sys
import logging

# 开启所有日志
logging.basicConfig(level=logging.DEBUG)

# 加载环境变量
from dotenv import load_dotenv
load_dotenv()

# 设置 LiteLLM 调试
os.environ["LITELLM_LOG"] = "DEBUG"

try:
    from crewai.project.crew_loader import load_crew
    
    print("🔧 正在加载 Crew...")
    crew, inputs = load_crew("crew.jsonc")  # ← 关键修改：解包元组
    print("✅ Crew 加载成功")
    
    print("🚀 正在启动 Crew...")
    result = crew.kickoff()
    print("✅ 执行完成")
    print(result)
    
except Exception as e:
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()