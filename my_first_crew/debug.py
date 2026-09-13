# ！Crew 调试入口（孤儿调试脚本）
# 直接以最高日志级别加载并启动 Crew，用于人工观察 CrewAI / LiteLLM 的完整调试输出。
# 全仓无任何引用，保留仅作排查参考：如需清理可整体删除，不影响任何功能。
import os
import sys
import logging

# 打开全部日志并输出 LiteLLM 调试信息：排查模型调用问题需要看到 SDK 层的原始日志
logging.basicConfig(level=logging.DEBUG)

# 先载入 .env 再导入 crewai：模型凭据由 LiteLLM 在导入期读取环境变量
from dotenv import load_dotenv
load_dotenv()

os.environ["LITELLM_LOG"] = "DEBUG"

try:
    from crewai.project.crew_loader import load_crew

    print("🔧 正在加载 Crew...")
    # load_crew 返回 (crew, inputs) 元组，须解包后使用
    crew, inputs = load_crew("crew.jsonc")
    print("✅ Crew 加载成功")

    print("🚀 正在启动 Crew...")
    result = crew.kickoff()
    print("✅ 执行完成")
    print(result)

except Exception as e:
    # 调试脚本以完整堆栈为优先：先打印可读信息，再输出 traceback
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()