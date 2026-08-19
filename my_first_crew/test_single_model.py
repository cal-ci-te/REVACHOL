#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
test_single_model.py — 单模型独立测试工具

用途：
- 快速测试四个 Agent 使用的模型（DeepSeek Pro/Flash、Kimi、Mimo）
- 验证 API Key 有效性、模型连通性
- 支持自定义消息、温度参数
- 支持交互式对话模式

使用方法：
    python test_single_model.py --model planner      # 测试 Planner 模型
    python test_single_model.py --model coder        # 测试 Coder 模型
    python test_single_model.py --model reviewer     # 测试 Reviewer 模型
    python test_single_model.py --model document_admin  # 测试 Document Admin 模型
    python test_single_model.py --model all          # 测试所有模型
    python test_single_model.py --interactive        # 交互式对话模式
    python test_single_model.py --model planner --message "解释微服务架构" --temperature 0.5
"""

import argparse
import os
import sys
from typing import Optional

from dotenv import load_dotenv
from crewai import LLM

# ============================================================================
# 0. 环境加载（复用 run_revachol_crew.py 的配置）
# ============================================================================

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(_ENV_PATH)

# ============================================================================
# 1. 模型配置（与 run_revachol_crew.py 保持一致）
# ============================================================================

# 各 Agent 对应的模型配置
# 与 run_revachol_crew.py 中的 _AGENT_ENV 完全一致
_MODEL_CONFIGS = {
    "planner": {
        "model": "deepseek-v4-pro",
        "api_key_env": "DEEPSEEK_PRO_API_KEY",
        "base_url": "https://api.deepseek.com/v1",
        "temperature": 0.3,
        "description": "DeepSeek V4 Pro — 技术规划师",
    },
    "coder": {
        "model": "deepseek-v4-flash",
        "api_key_env": "DEEPSEEK_FLASH_API_KEY",
        "base_url": "https://api.deepseek.com/v1",
        "temperature": 0.1,
        "description": "DeepSeek V4 Flash — 代码开发者",
    },
    "reviewer": {
        "model": "kimi-k2.7-code",
        "api_key_env": "KIMI_API_KEY",
        "base_url": "https://api.moonshot.cn/v1",
        "temperature": 1.0,  # Kimi 强制要求 1.0
        "description": "Kimi K2.7 Code — 代码审查员",
    },
    "document_admin": {
        "model": "mimo-v2.5",
        "api_key_env": "MIMO_API_KEY",
        "base_url": "https://api.xiaomimimo.com/v1",
        "temperature": 0.4,
        "description": "Mimo V2.5 — 文档处理员",
    },
}


def build_llm(model_key: str, temperature: Optional[float] = None) -> LLM:
    """根据模型 Key 构建 LLM 实例"""
    config = _MODEL_CONFIGS[model_key]
    
    api_key = os.getenv(config["api_key_env"])
    if not api_key:
        raise ValueError(
            f"[错误] 环境变量 {config['api_key_env']} 未配置，"
            f"请在 .env 文件中添加"
        )
    
    return LLM(
        model=f"openai/{config['model']}",
        api_key=api_key,
        base_url=config["base_url"],
        temperature=temperature if temperature is not None else config["temperature"],
    )


def call_model(
    model_key: str,
    message: str,
    temperature: Optional[float] = None,
    system_prompt: Optional[str] = None,
    max_tokens: int = 500,
) -> str:
    """调用指定模型并返回响应"""
    
    config = _MODEL_CONFIGS[model_key]
    llm = build_llm(model_key, temperature)

    # LLM.call() 不接受 temperature / max_tokens 参数（签名仅含 messages/tools 等），
    # 二者均为实例级字段：temperature 已由 build_llm() 设置，max_tokens 在此赋值
    llm.max_tokens = max_tokens

    # 构建消息列表
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": message})

    print(f"\n[调用] {config['description']}")
    print(f"[模型] {config['model']}")
    print(f"[温度] {temperature if temperature is not None else config['temperature']}")
    print(f"[消息] {message[:100]}{'...' if len(message) > 100 else ''}")
    print("-" * 50)

    try:
        response = llm.call(messages=messages)
        return response
    except Exception as e:
        return f"[错误] 调用失败: {e}"


def test_all_models(message: str = "你好，请简单介绍一下你自己") -> None:
    """测试所有模型"""
    print("\n" + "=" * 60)
    print("🚀 测试所有模型")
    print("=" * 60)
    
    for model_key in _MODEL_CONFIGS.keys():
        print("\n" + "-" * 60)
        result = call_model(model_key, message)
        print(f"\n[响应]\n{result}")
        print("-" * 60)


def interactive_mode(model_key: str = "planner") -> None:
    """交互式对话模式"""
    
    config = _MODEL_CONFIGS[model_key]
    llm = build_llm(model_key)
    
    print("\n" + "=" * 60)
    print(f"💬 交互式对话 — {config['description']}")
    print(f"模型: {config['model']}")
    print("输入 'exit' 退出，'clear' 清空对话")
    print("=" * 60)
    
    messages = [
        {"role": "system", "content": "你是一个乐于助人的AI助手，请用中文回答。"}
    ]
    
    while True:
        user_input = input("\n[你] ").strip()
        if not user_input:
            continue
        
        if user_input.lower() == "exit":
            print("[系统] 再见！👋")
            break
        
        if user_input.lower() == "clear":
            messages = [
                {"role": "system", "content": "你是一个乐于助人的AI助手，请用中文回答。"}
            ]
            print("[系统] 对话历史已清空")
            continue
        
        messages.append({"role": "user", "content": user_input})
        
        print("[AI] 思考中...")
        try:
            response = llm.call(messages=messages)
            messages.append({"role": "assistant", "content": response})
            print(f"\n[AI] {response}")
        except Exception as e:
            print(f"[错误] {e}")


# ============================================================================
# 2. 主入口
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="REVACHOL 单模型独立测试工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python test_single_model.py --model planner
  python test_single_model.py --model coder --message "写一个排序算法"
  python test_single_model.py --model reviewer --temperature 0.5
  python test_single_model.py --model all
  python test_single_model.py --interactive
  python test_single_model.py --interactive --model document_admin
        """
    )
    
    parser.add_argument(
        "--model", "-m",
        choices=list(_MODEL_CONFIGS.keys()) + ["all"],
        default="planner",
        help="要测试的模型 (planner/coder/reviewer/document_admin/all)"
    )
    
    parser.add_argument(
        "--message", "-msg",
        type=str,
        default="你好，请简单介绍一下你自己",
        help="发送给模型的消息"
    )
    
    parser.add_argument(
        "--temperature", "-t",
        type=float,
        default=None,
        help="覆盖模型的温度参数"
    )
    
    parser.add_argument(
        "--system", "-s",
        type=str,
        default=None,
        help="系统提示词"
    )
    
    parser.add_argument(
        "--interactive", "-i",
        action="store_true",
        help="进入交互式对话模式"
    )
    
    parser.add_argument(
        "--max-tokens", "-mt",
        type=int,
        default=500,
        help="最大输出 token 数"
    )
    
    args = parser.parse_args()
    
    # 检查环境变量
    missing = []
    for key in _MODEL_CONFIGS.keys():
        config = _MODEL_CONFIGS[key]
        if not os.getenv(config["api_key_env"]):
            missing.append(config["api_key_env"])
    
    if missing:
        print("[警告] 以下 API Key 未配置:")
        for key in missing:
            print(f"  - {key}")
        print("请在 .env 文件中添加对应的 API Key")
    
    # 交互式模式
    if args.interactive:
        model_key = args.model if args.model != "all" else "planner"
        interactive_mode(model_key)
        return
    
    # 测试所有模型
    if args.model == "all":
        test_all_models(args.message)
        return
    
    # 测试单个模型
    result = call_model(
        model_key=args.model,
        message=args.message,
        temperature=args.temperature,
        system_prompt=args.system,
        max_tokens=args.max_tokens,
    )
    
    print(f"\n[响应]\n{result}")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已手动中断。")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        sys.exit(1)