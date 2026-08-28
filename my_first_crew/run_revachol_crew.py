#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
run_revachol_crew.py — REVACHOL 多 Agent 直接构建脚本（绕过 JSONC 配置）

背景
----
CrewAI 1.15.16 在解析 `agents/*.jsonc` 中的 `${VAR}` 环境变量时存在 Bug：
`LITELLM_LOG=DEBUG` 日志显示 URL 被错误解析为 `$%7BDEEPSEEK_PRO_BASE_URL%7D/...`。
原生 curl 测试所有 API Key 均有效，排除网络问题。

本脚本改为在 Python 代码中直接通过 `os.getenv()` 读取环境变量并构建 LLM，
完全绕过 JSON 配置的变量解析缺陷。

第二轮修复：DeepSeek API 兼容性问题
-----------------------------------
现象：运行时报 HTTP 400，错误信息为
`{"error": {"message": "This response_format type is unavailable now", ...}}`。

根因：CrewAI 的 `output_pydantic`（以及 `output_json`，两者实现路径相同）
会把 Pydantic 模型作为 `response_model` 传给 LLM 调用，内部经由
`InternalInstructor`（instructor 库）在请求中注入 `response_format`（JSON Schema）。
DeepSeek 的 OpenAI 兼容 API 未实现该参数，直接拒绝。

修复方案：「Prompt 约束 + 后处理校验」
1. 移除所有 Task 的 `output_pydantic` / `output_json`（不再触发 response_format）
2. 在 Task 描述中内联 JSON Schema 示例（由 Pydantic 模型自动生成，保证不漂移）
3. LLM 返回后由 `parse_and_validate_output()` 提取 JSON 并校验为 Pydantic 模型
4. 解析失败仅记录警告，不中断流程（优雅降级）
5. 校验后的结果写入 `output/{name}_parsed.json`

第三轮：为 Document Admin 集成 Git MCP 服务器（`mcps` DSL）
---------------------------------------------------------
- 通过 CrewAI 的 `mcps` 参数（`MCPServerStdio` DSL）接入官方 Git MCP 服务器
  `mcp-server-git`（Python 版，经 `uvx` 启动），仓库限定为 `D:/Revachol`
- 注意：npm 上的 `@modelcontextprotocol/server-git` 不存在（实测 404），官方参考
  实现是 modelcontextprotocol/servers 仓库的 Python 包 `mcp-server-git`
- document_admin 在执行 documentation Task 时，可调用 `git_diff`（target=HEAD~1）、
  `git_status`、`git_log` 等工具获取工作区变更，据此撰写变更日志
- MCP 工具在 `create_agent_executor()`（kickoff 时）才解析启动，`--dry-run` 不会拉起进程
- uvx 缺失时仅告警不中断（优雅降级）

四个 Agent 与其模型
-------------------
| Agent           | 角色         | 模型               | 环境变量（.env）          |
|-----------------|--------------|--------------------|---------------------------|
| planner         | 技术规划师   | deepseek-v4-pro    | DEEPSEEK_PRO_*            |
| coder           | 代码开发者   | deepseek-v4-flash  | DEEPSEEK_FLASH_*          |
| reviewer        | 代码审查员   | kimi-k2.7-code     | KIMI_*                    |
| document_admin  | 文档处理员   | mimo-v2.5          | MIMO_*                    |

使用方法
--------
    python run_revachol_crew.py                        # 默认 sequential；未传需求时进入仪表盘交互式输入
    python run_revachol_crew.py --requirement "为贴纸系统新增旋转功能"   # 跳过输入面板
    python run_revachol_crew.py --debug                # 开启 LITELLM_LOG=DEBUG
    python run_revachol_crew.py --dry-run              # 只构建不执行（验证配置，不启动输入面板）
    python run_revachol_crew.py --process hierarchical  # 层级流程（需 manager LLM）
    python run_revachol_crew.py --memory               # 启用记忆（需 OPENAI_API_KEY/BASE）

长期演进（官方推荐 Flow-First 架构）
-----------------------------------
生产级部署时，建议重构为：

    src/revachol/
    ├── main.py          # Flow 类 + kickoff() 入口（状态管理 + 控制流）
    └── crews/           # 各 Crew 定义
        ├── planner_crew.py
        ├── coder_crew.py
        └── ...

且 `pyproject.toml` 中 `[tool.crewai] type = "flow"`。
"""

# 在导入 CrewAI / httpx 之前禁用异步客户端，避免退出时 asyncio 事件循环冲突
import os

os.environ.setdefault("CREWAI_DISABLE_ASYNC", "1")
os.environ.setdefault("HTTPX_USE_SYNC", "1")
# 关闭 CrewAI 遥测（telemetry.crewai.com 超时噪音，不影响主流程）
os.environ.setdefault("OTEL_SDK_DISABLED", "1")
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "1")

import argparse
import json
import logging
import re
import shutil
import sys
import threading
import time
from datetime import datetime

from typing import Any, Callable, List, Type

from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

from crewai import Agent, Crew, LLM, Process, Task
from crewai.events.event_bus import crewai_event_bus

from ui.dashboard import Dashboard, wait_for_input

# ============================================================================
# 0. 环境加载
# ============================================================================

# 显式定位 .env：无论从哪个目录执行脚本，都能加载到 my_first_crew/.env
_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(_ENV_PATH)

# ============================================================================
# 1. 结构化输出模型（Pydantic v2，Task.output_pydantic 使用）
# ============================================================================


class PlanningOutput(BaseModel):
    """技术规划师产出：架构方案 + 技术选型 + 里程碑。"""

    architecture: str = Field(description="整体架构方案说明")
    tech_stack: List[str] = Field(description="技术选型列表")
    milestones: List[str] = Field(description="里程碑步骤，按执行顺序排列")


class CodeFile(BaseModel):
    """单个代码文件。"""

    path: str = Field(description="文件路径，如 js/services/rotate.js")
    code: str = Field(description="完整代码内容")
    summary: str = Field(description="该文件实现的功能摘要")


class CodingOutput(BaseModel):
    """代码开发者产出：文件列表 + 总体说明。"""

    files: List[CodeFile] = Field(description="本次产出的代码文件列表")
    overall_summary: str = Field(description="整体实现说明")


class ReviewOutput(BaseModel):
    """代码审查员产出：审查结论。"""

    approved: bool = Field(description="是否通过审查")
    summary: str = Field(description="审查总结")
    issues: List[str] = Field(description="发现的问题列表（若无则为空数组）")
    suggestions: List[str] = Field(description="改进建议列表")
    review_standard: str = Field(description="本次采用的审查标准说明")


class DocOutput(BaseModel):
    """文档处理员产出：文档总结。"""

    summary: str = Field(description="一句话总结本次任务的执行结果")
    key_notes: List[str] = Field(description="关键要点列表")
    docs_written: List[str] = Field(description="产出/更新的文档路径列表（无则空数组）")


# ============================================================================
# 1.5 结构化输出后处理（替代 output_pydantic：Prompt 约束 + 后处理校验）
# ============================================================================
# 背景：CrewAI 的 output_pydantic/output_json 会通过 instructor 注入
# `response_format`（JSON Schema），DeepSeek 兼容 API 未实现该参数 → HTTP 400。
# 因此改为：描述中给 Schema 示例 → LLM 输出 JSON → 这里提取/校验/落盘。

# Task 名 → 对应的 Pydantic 模型（供后处理校验）
_OUTPUT_MODELS: dict[str, Type[BaseModel]] = {
    "planning": PlanningOutput,
    "coding": CodingOutput,
    "review": ReviewOutput,
    "documentation": DocOutput,
}


def _extract_json(raw_output: str) -> str | None:
    """从 LLM 原始输出中提取 JSON 字符串。

    依次尝试：
    1. ```json ... ``` 围栏块；
    2. 从第一个 `{` 开始做花括号配对（字符串字面量感知）；
    3. 整段直接返回（交给 json.loads 决定成败）。
    """
    if not raw_output:
        return None

    # 1) fenced code block
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
    if match:
        return match.group(1)

    # 2) 括号配对提取（感知字符串内的 { } 与转义）
    start = raw_output.find("{")
    if start != -1:
        depth = 0
        in_str = False
        escaped = False
        for i in range(start, len(raw_output)):
            ch = raw_output[i]
            if in_str:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return raw_output[start : i + 1]

    # 3) 兜底：整段交给 json.loads
    return raw_output.strip()


def parse_and_validate_output(
    raw_output: str,
    model_class: Type[BaseModel],
    task_name: str = "",
    log_fn: Callable[[str, str], None] | None = None,
) -> BaseModel | None:
    """从 LLM 原始输出中提取 JSON 并校验为 Pydantic 模型。

    Args:
        raw_output: LLM 返回的原始字符串
        model_class: 目标 Pydantic 模型类
        task_name: 任务名称（用于日志定位）
        log_fn: 可选日志回调 (message, level)；缺省时使用 print 输出。

    Returns:
        校验通过的 Pydantic 模型实例；解析/校验失败时返回 None（优雅降级，不中断流程）。
    """

    def _warn(message: str) -> None:
        if log_fn is not None:
            log_fn(message, "warning")
        else:
            print(message)

    json_str = _extract_json(raw_output)
    if json_str is None:
        _warn(f"[WARN] {task_name}: 未从输出中提取到 JSON 内容")
        return None

    # 1) JSON 语法解析
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        _warn(f"[WARN] {task_name}: JSON 解析失败 - {exc}")
        _warn(f"[DEBUG] {task_name} 原始输出前 200 字符: {raw_output[:200]}...")
        return None

    # 2) Pydantic 校验
    try:
        return model_class.model_validate(data)
    except ValidationError as exc:
        _warn(f"[WARN] {task_name}: Pydantic 校验失败 - {exc}")
        _warn(f"[DEBUG] {task_name} 解析到的 JSON: {json.dumps(data, ensure_ascii=False)[:200]}...")
        # 3) 优雅降级：跳过校验尽量保留数据（字段缺失/类型不符时不崩溃）
        try:
            return model_class.model_construct(**data)
        except Exception as inner_exc:  # noqa: BLE001
            _warn(f"[WARN] {task_name}: 降级构造失败 - {inner_exc}")
            return None


def _schema_example(model_class: Type[BaseModel]) -> dict:
    """根据 Pydantic 模型的 JSON Schema 自动生成示例对象。

    生成的示例直接注入 Task 描述，作为 LLM 的输出格式约束，
    保证提示词中的 Schema 与模型定义永不漂移。
    """
    schema = model_class.model_json_schema()

    def _example(props: dict) -> dict:
        out: dict[str, Any] = {}
        for name, prop in (props or {}).items():
            ptype = prop.get("type")
            if ptype == "string":
                out[name] = "示例文本"
            elif ptype == "boolean":
                out[name] = True
            elif ptype in ("integer", "number"):
                out[name] = 0
            elif ptype == "array":
                items = prop.get("items", {})
                if items.get("type") == "object":
                    out[name] = [_example(items.get("properties", {}))]
                else:
                    out[name] = ["示例条目"]
            elif ptype == "object":
                out[name] = _example(prop.get("properties", {}))
            else:
                out[name] = None
        return out

    return _example(schema.get("properties", {}))


def build_output_requirement(model_class: Type[BaseModel]) -> str:
    """生成注入 Task description 的 JSON 输出格式要求。"""
    example = json.dumps(_schema_example(model_class), ensure_ascii=False, indent=2)
    return (
        "\n\n⚠️ **输出格式要求**：请严格按以下 JSON Schema 输出一个 JSON 对象，"
        "不要输出任何其他内容（不要 markdown 注释、不要多余文字）：\n"
        f"```json\n{example}\n```\n"
        "确保所有字段都存在且类型正确。"
    )


def write_parsed_output(
    task_name: str,
    parsed: BaseModel | None,
    raw_output: str,
    log_fn: Callable[[str, str], None] | None = None,
) -> None:
    """将后处理校验结果写入 output/{task_name}_parsed.json。"""

    def _emit(message: str, level: str) -> None:
        if log_fn is not None:
            log_fn(message, level)
        else:
            print(message)

    # 输出目录：优先使用 CREW_OUTPUT_DIR（Docker 挂载到宿主机 ./output），
    # 否则默认写到脚本所在目录的 output/ 子目录
    out_dir = os.getenv("CREW_OUTPUT_DIR") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "output"
    )
    try:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"{task_name}_parsed.json")
        if parsed is None:
            payload: dict[str, Any] = {"parse_error": True, "raw": raw_output}
        else:
            payload = parsed.model_dump(mode="json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        _emit(f"[OK] 校验结果已写入 {path}", "success")
    except (OSError, IOError) as exc:
        _emit(f"[WARN] {task_name}: 写入解析文件失败 - {exc}", "warning")


# ============================================================================
# 1.8 暂存区：Reviewer 拒绝合入时保留代码
# ============================================================================

STAGING_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "staging")


def ensure_staging_dir() -> None:
    """确保暂存区目录存在。"""
    os.makedirs(STAGING_DIR, exist_ok=True)


def _save_to_staging(
    requirement: str,
    review: ReviewOutput,
    coding_data: dict,
) -> str:
    """将审查不通过的代码保存到暂存区，返回会话目录路径。"""
    ensure_staging_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir = os.path.join(STAGING_DIR, f"session_{timestamp}")
    os.makedirs(session_dir, exist_ok=True)

    # 保存需求
    with open(
        os.path.join(session_dir, "requirement.txt"), "w", encoding="utf-8"
    ) as fh:
        fh.write(requirement)

    # 保存审查报告
    with open(
        os.path.join(session_dir, "review_report.json"), "w", encoding="utf-8"
    ) as fh:
        json.dump(review.model_dump(mode="json"), fh, indent=2, ensure_ascii=False)

    # 保存代码文件
    files = coding_data.get("files") if isinstance(coding_data, dict) else None
    if files:
        code_dir = os.path.join(session_dir, "code")
        for file_info in files:
            if not isinstance(file_info, dict):
                continue
            file_path = os.path.join(code_dir, file_info.get("path", "unknown"))
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as fh:
                fh.write(file_info.get("code", ""))

    return session_dir


# ============================================================================
# 2. LLM 工厂：直接从 os.getenv() 读取，绕过 JSONC ${VAR} 解析 Bug
# ============================================================================

# 各 Agent 的环境变量配置表：<key 前缀> -> <模型名>
# 模型名读取顺序：环境变量 *_MODEL -> 默认值
_AGENT_ENV = {
    "planner": {
        "prefix": "DEEPSEEK_PRO",
        "default_model": "deepseek-v4-pro",
        "temperature": 0.3,  # 稳定严谨，适合架构决策
    },
    "coder": {
        "prefix": "DEEPSEEK_FLASH",
        "default_model": "deepseek-v4-flash",
        "temperature": 0.1,  # 确定性高，适合代码生成
    },
    "reviewer": {
        "prefix": "KIMI",
        "default_model": "kimi-k2.7-code",
        "temperature": 1.0,  # kimi的强制温度
    },
    "document_admin": {
        "prefix": "MIMO",
        "default_model": "mimo-v2.5",
        "temperature": 0.4,
    },
    # RFC-001 新增：文本处理员（TextProcessor），复用 deepseek-v4-flash
    "text_processor": {
        "prefix": "DEEPSEEK_FLASH",
        "default_model": "deepseek-v4-flash",
        "temperature": 0.2,
    },
}

# Agent id → Provider 兜底映射（model 字符串无法识别时使用）
_AGENT_PROVIDER_FALLBACK = {
    "planner": "deepseek",
    "coder": "deepseek",
    "reviewer": "moonshot",
    "document_admin": "xiaomimo",
    "text_processor": "deepseek",
}


def _infer_provider(model: str, agent_id: str = "") -> str:
    """从模型名推导 Provider；无法识别时回退到 Agent 配置。"""
    model_lower = str(model or "").lower()
    if "deepseek" in model_lower:
        return "deepseek"
    if "kimi" in model_lower or "moonshot" in model_lower:
        return "moonshot"
    if "mimo" in model_lower or "xiaomimo" in model_lower:
        return "xiaomimo"
    return _AGENT_PROVIDER_FALLBACK.get(agent_id, "unknown")


def build_llm(agent_id: str) -> LLM:
    """根据 Agent ID 构建独立 LLM 实例。

    所有端点均为 OpenAI 兼容接口，故统一使用 `openai/` 前缀交给
    LiteLLM 的 OpenAI 客户端路由；base_url 决定实际请求到哪个服务商。
    """
    cfg = _AGENT_ENV[agent_id]
    prefix = cfg["prefix"]

    api_key = os.getenv(f"{prefix}_API_KEY")
    base_url = os.getenv(f"{prefix}_BASE_URL")
    model = os.getenv(f"{prefix}_MODEL", cfg["default_model"])

    if not api_key:
        raise RuntimeError(f"[配置错误] 缺少环境变量 {prefix}_API_KEY，请在 .env 中配置")

    if not base_url:
        # DeepSeek / Kimi / Mimo 的官方端点兜底
        _DEFAULT_BASE_URLS = {
            "planner": "https://api.deepseek.com/v1",
            "coder": "https://api.deepseek.com/v1",
            "reviewer": "https://api.moonshot.cn/v1",
            "document_admin": "https://api.xiaomimimo.com/v1",
        }
        base_url = _DEFAULT_BASE_URLS[agent_id]

    return LLM(
        model=f"openai/{model}",
        api_key=api_key,
        base_url=base_url,
        temperature=cfg["temperature"],
        # 同步请求超时：Kimi/MiMo 生成大文档审查/文档同步结论可能超过 60s，
        # 放宽到 600s 进一步降低慢生成导致的 Request timed out。
        timeout=600.0,
    )


def validate_env() -> None:
    """启动前校验四个 API Key 是否齐全，缺失时给出明确提示。"""
    missing = [
        f"{cfg['prefix']}_API_KEY"
        for cfg in _AGENT_ENV.values()
        if not os.getenv(f"{cfg['prefix']}_API_KEY")
    ]
    if missing:
        raise RuntimeError(
            "[配置错误] 以下环境变量缺失（请检查 my_first_crew/.env）：\n  - "
            + "\n  - ".join(missing)
        )


# ============================================================================
# 3. Agent 定义（role / goal / backstory 与 agents/*.jsonc 保持一致）
# ============================================================================


def build_git_mcp_config() -> list:
    """构建 document_admin 的 Git MCP 配置（优雅降级）。

    返回空列表表示不启用 MCP。跳过条件：
    1. 环境变量 CREW_DISABLE_GIT_MCP=1 强制禁用；
    2. 仓库路径不存在（Docker 容器内没有 Windows 路径 D:/Revachol）；
    3. uvx 未安装（MCP 服务器无法启动）。
    可用环境变量 CREW_GIT_REPO 覆盖仓库路径。
    """
    git_repo = os.getenv("CREW_GIT_REPO") or "D:/Revachol"

    if os.getenv("CREW_DISABLE_GIT_MCP") == "1":
        print("[WARN] CREW_DISABLE_GIT_MCP=1，跳过 Git MCP 配置")
        return []

    if not os.path.exists(git_repo):
        print(f"[WARN] Git MCP 仓库路径不存在（{git_repo}），跳过 MCP 配置")
        return []

    if shutil.which("uvx") is None:
        print("[WARN] uvx 未在 PATH 中找到，跳过 Git MCP 配置")
        return []

    return [
        {
            "command": "uvx",
            "args": ["mcp-server-git", "--repository", git_repo],
        }
    ]


def build_agents() -> dict:
    """构建四个 Agent，返回 {agent_id: Agent}。"""

    planner_llm = build_llm("planner")
    coder_llm = build_llm("coder")
    reviewer_llm = build_llm("reviewer")
    doc_llm = build_llm("document_admin")

    planner = Agent(
        role="技术规划师 (Planner)",
        goal=(
            "1. 负责将复杂的开发任务拆解为清晰、可执行的子任务清单；"
            "2. 为每个子任务定义明确的输入、输出和验收标准；"
            "3. 协调其他 Agent 的工作，确保整体进度和质量。"
        ),
        backstory=(
            "你是一位拥有 12 年全栈架构经验的首席技术规划师，曾在多家独角兽公司"
            "主导过核心系统的重构。你以'逻辑缜密、洞察深远'著称，擅长将模糊的产品"
            "愿景转化为清晰、可执行的技术蓝图。你坚信'完美的规划是高效执行的前提'，"
            "在制定任务时，你总是优先考虑系统的可扩展性、技术选型的长期成本以及"
            "团队协作的顺畅度。你会确保每个子任务都有明确的输入、输出和可验证的"
            "'完成'标准。"
        ),
        llm=planner_llm,
        allow_delegation=False,
        verbose=True,
    )

    coder = Agent(
        role="代码开发者 (Coder)",
        goal=(
            "1. 根据 Planner 提供的任务清单，编写高质量、可运行的代码；"
            "2. 在实现功能时添加必要的 JSDoc 注释；"
            "3. 确保代码风格统一，处理边界情况和异常。"
        ),
        backstory=(
            "你是一位追求极致代码质量的资深软件工程师。你的代码简洁、高效且具备"
            "很强的可读性。你信奉'代码即文档'的原则，习惯在实现功能的同时编写结构"
            "清晰、符合规范的代码，并为关键函数添加 JSDoc 注释。"
        ),
        llm=coder_llm,
        allow_delegation=False,
        verbose=True,
    )

    reviewer = Agent(
        role="代码审查员 (Reviewer)",
        goal=(
            "1. 严格审查 Coder 生成的代码，确保其逻辑正确、风格统一、没有明显的功能遗漏；"
            "2. 给出具体、有建设性的改进建议；"
            "3. 在代码达到团队标准时给予批准。"
        ),
        backstory=(
            "你是一位以'挑剔'著称的高级代码审查专家。你对代码质量有着近乎苛刻的标准。"
            "你是一位务实者，不仅关注代码逻辑的正确性，还从代码安全性、潜在瓶颈、"
            "可维护性和架构一致性的多维度进行审视。"
        ),
        llm=reviewer_llm,
        allow_delegation=False,
        verbose=True,
    )

    document_admin = Agent(
        role="文档处理员 (Document Admin)",
        goal=(
            "1. 维护项目知识库，确保文档与代码同步；"
            "2. 从海量信息中提取关键架构和模块信息，生成结构化摘要；"
            "3. 解答团队关于项目结构和技术栈的查询；"
            "4. 通过 Git 工具分析代码变更，生成变更日志和文档。"
        ),
        backstory=(
            "你是一位具备强大分析能力的资深文档工程师，尤其擅长从文档海洋中高效"
            "提取关键信息。你总能从看似杂乱的技术文档、会议记录和代码注释中，精准"
            "提取出关键技术决策、模块依赖关系和设计思路。"
            "现在你额外获得了 Git 仓库分析能力，可以通过 MCP 服务器查看代码变更历史。"
        ),
        llm=doc_llm,
        allow_delegation=False,
        verbose=True,
        # Git MCP 服务器：官方 mcp-server-git（Python，PyPI）经 uvx 启动。
        # 注意：npm 上的 @modelcontextprotocol/server-git 不存在（404 实测），
        # 官方参考实现为 modelcontextprotocol/servers 仓库的 Python 版 mcp-server-git。
        # uvx 随项目使用的 uv 一并安装（.venv 由 uv 管理）。
        # 优雅降级：Docker 容器内不存在 Windows 路径 D:/Revachol 时跳过 MCP，
        # 避免 Document_Admin 因 MCP 连接失败而中断整条 Flow。
        mcps=build_git_mcp_config(),
    )

    return {
        "planner": planner,
        "coder": coder,
        "reviewer": reviewer,
        "document_admin": document_admin,
    }


def build_text_processor_agent() -> Agent:
    """构建 RFC-001 新增的文本处理员（TextProcessor）。

    仅在 Flow 工作流中使用，不进入既有 Crew（保持 run_revachol_crew.py
    原有四 Agent 语义不变）。
    """
    llm = build_llm("text_processor")
    return Agent(
        role="文本处理员 (TextProcessor)",
        goal=(
            "1. 依据 Planner 提供的计划，先行撰写结构完整、内容准确的文档初稿；"
            "2. 确保文档与项目知识库规范一致；"
            "3. 仅参与首次撰写，不进入修改循环。"
        ),
        backstory=(
            "你是一位严谨的文档撰写专家，擅长把技术计划转化为结构清晰、内容准确、"
            "可直接评审的文档初稿。你注重文档的完整性、可读性与一致性，会在撰写时"
            "主动参照项目知识库（knowledge/）中的既有规范和格式。你清楚自己的职责"
            "边界：只负责首次初稿，后续修改由 Coder 直接完成。"
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )


# ============================================================================
# 4. Task 定义（体现协作：reviewer 依赖 coder 输出，doc 汇总全链路）
# ============================================================================


def build_tasks(agents: dict, requirement: str, save_outputs: bool) -> list:
    """构建四个 Task 并形成协作链。"""

    def _output_file(name: str) -> str | None:
        """Task 级输出文件：写入 CREW_OUTPUT_DIR 或默认 output/ 目录。"""
        if not save_outputs:
            return None
        out_dir = os.getenv("CREW_OUTPUT_DIR") or "output"
        return os.path.join(out_dir, f"{name}.json")

    # ---- Task 1：规划（Planner）----
    planning_task = Task(
        name="planning",
        description=(
            "你是技术规划师。请针对以下需求进行技术规划：\n"
            f"需求：{requirement}\n\n"
            "1. architecture：整体架构方案；\n"
            "2. tech_stack：技术选型列表；\n"
            "3. milestones：按执行顺序排列的里程碑步骤（至少 2 条）。"
            + build_output_requirement(PlanningOutput)
        ),
        expected_output=(
            "符合上述 JSON Schema 的规划结果：包含 architecture、tech_stack、"
            "milestones 三部分，milestones 至少 2 条且按执行顺序排列。"
        ),
        agent=agents["planner"],
        output_file=_output_file("planning"),
        create_directory=True,
    )

    # ---- Task 2：编码（Coder），依赖规划输出 ----
    coding_task = Task(
        name="coding",
        description=(
            "你是代码开发者。根据技术规划师的规划结果实现代码：\n"
            "context（规划输出）将提供 architecture、tech_stack 与 milestones。\n\n"
            "要求：\n"
            "1. 生成可直接运行的代码文件（本项目为原生 ES Module + JavaScript）；\n"
            "2. 为关键函数添加 JSDoc 注释；\n"
            "3. 处理边界情况和异常。\n"
            "按以下格式输出代码文件列表。"
            + build_output_requirement(CodingOutput)
        ),
        expected_output=(
            "符合上述 JSON Schema 的代码实现：包含 files（每个文件含 path/code/summary）"
            "与 overall_summary。"
        ),
        agent=agents["coder"],
        context=[planning_task],  # 协作：编码依赖规划输出
        output_file=_output_file("coding"),
        create_directory=True,
    )

    # ---- Task 3：审查（Reviewer），依赖编码输出 ----
    review_task = Task(
        name="review",
        description=(
            "你是代码审查员。审查 Coder 生成的代码：\n"
            "context（编码输出）将提供 files 与 overall_summary。\n\n"
            "审查维度：逻辑正确性、代码风格、安全性、潜在瓶颈、可维护性、架构一致性。\n"
            "按以下格式输出审查结论。"
            + build_output_requirement(ReviewOutput)
        ),
        expected_output=(
            "符合上述 JSON Schema 的审查结论：包含 approved、summary、issues、"
            "suggestions、review_standard。"
        ),
        agent=agents["reviewer"],
        context=[coding_task],  # 协作：审查依赖编码输出
        output_file=_output_file("review"),
        create_directory=True,
    )

    # ---- Task 4：文档汇总（Document Admin），依赖规划与审查输出 ----
    doc_task = Task(
        name="documentation",
        description=(
            "你是文档处理员。汇总本次任务的完整执行结果：\n"
            "context 包含规划输出与审查结论。\n\n"
            "1. 首先，使用你的 Git 工具（由 MCP 服务器提供）执行以下操作：\n"
            "   - 使用 `git_status` 查看工作区变更文件状态；\n"
            "   - 使用 `git_diff`（target 参数指定 `HEAD~1`）获取上次提交与当前工作区"
            "之间的变更摘要；\n"
            "   - 识别所有被修改、新增或删除的文件；\n"
            "   - 了解本次变更的范围和影响。\n"
            "2. 然后，综合规划输出和审查结论，完成以下工作：\n"
            "   - 用一句话总结本次任务的执行结果；\n"
            "   - 提炼关键要点（规划、实现、审查各至少 1 条）；\n"
            "   - 列出本次 Git 变更中涉及的文件路径。\n"
            "按以下格式输出文档总结。"
            + build_output_requirement(DocOutput)
        ),
        expected_output=(
            "符合上述 JSON Schema 的文档总结：包含 summary、key_notes、docs_written。"
            "docs_written 应包含本次 Git 变更中涉及的文件路径列表。"
        ),
        agent=agents["document_admin"],
        context=[planning_task, review_task],  # 协作：汇总规划与审查
        output_file=_output_file("documentation"),
        create_directory=True,
    )

    return [planning_task, coding_task, review_task, doc_task]


# ============================================================================
# 5. Crew 编排
# ============================================================================


def build_crew(
    agents: dict,
    tasks: list,
    process: str,
    memory: bool,
    planning: bool,
) -> Crew:
    """组合 Crew。process 支持 sequential / hierarchical。"""

    if process == "hierarchical":
        # 层级流程需要 manager LLM 做任务分配（复用 Planner 的模型）
        manager_llm = build_llm("planner")
        return Crew(
            agents=list(agents.values()),
            tasks=tasks,
            process=Process.hierarchical,
            manager_llm=manager_llm,
            verbose=True,
            memory=memory,
            planning=planning,
        )

    return Crew(
        agents=list(agents.values()),
        tasks=tasks,
        process=Process.sequential,
        verbose=True,
        memory=memory,
        planning=planning,
    )


# ============================================================================
# 5.5 仪表盘事件钩子（基于 CrewAI 事件总线，保持 crew.kickoff() 原有语义）
# ============================================================================

# Task 名 -> Agent 面板显示名
_TASK_AGENT_NAMES = {
    "planning": "Planner",
    "coding": "Coder",
    "review": "Reviewer",
    "documentation": "Document Admin",
}

# Agent ID -> Agent 面板显示名
_AGENT_DISPLAY_NAMES = {
    "planner": "Planner",
    "coder": "Coder",
    "reviewer": "Reviewer",
    "document_admin": "Document Admin",
}


def _task_agent_name(task_name: str) -> str:
    """将 Task 名映射为 Agent 面板显示名。"""
    return _TASK_AGENT_NAMES.get(task_name, task_name or "Agent")


def _install_dashboard_handlers(
    dashboard: Dashboard,
) -> tuple[list[tuple[type, Callable[..., None]]], set[str]]:
    """注册 CrewAI 事件总线钩子，实时更新仪表盘。

    Returns:
        (handlers, completed_tasks): handlers 用于 finally 中注销；
        completed_tasks 用于 kickoff 后兜底补齐状态。
    """
    from crewai.events import (
        AgentReasoningCompletedEvent,
        TaskCompletedEvent,
        TaskFailedEvent,
        TaskStartedEvent,
    )
    from crewai.events.event_bus import crewai_event_bus

    lock = threading.Lock()
    completed_tasks: set[str] = set()

    def _on_task_started(source: Any, event: Any) -> None:
        with lock:
            task_name = getattr(event, "task_name", "") or ""
            agent_name = _task_agent_name(task_name)
            dashboard.output_panel.start_agent(agent_name, task_name)
            dashboard.set_task(task_name)
            dashboard.set_agent_status(agent_name, "running", task_name, "执行中...")
            dashboard.log(f"▶ {agent_name} 开始: {task_name}", "info")

    def _on_task_completed(source: Any, event: Any) -> None:
        with lock:
            output = getattr(event, "output", None)
            task_name = (
                getattr(output, "name", None)
                or getattr(event, "task_name", "")
                or ""
            )
            agent_name = _task_agent_name(task_name)
            raw = getattr(output, "raw", None) or ""
            dashboard.output_panel.finish_agent(raw[:2000], "done")
            dashboard.set_agent_status(agent_name, "done", task_name, "✅ 完成")
            dashboard.log(f"✅ {agent_name} 完成", "success")
            if task_name:
                completed_tasks.add(task_name)

    def _on_task_failed(source: Any, event: Any) -> None:
        with lock:
            task_name = getattr(event, "task_name", "") or ""
            agent_name = _task_agent_name(task_name)
            error = getattr(event, "error", "") or ""
            dashboard.output_panel.finish_agent("", "failed")
            dashboard.set_agent_status(
                agent_name, "failed", task_name, f"❌ {str(error)[:30]}"
            )
            dashboard.log(f"❌ {agent_name} 失败: {error}", "error")

    def _on_agent_thought(source: Any, event: Any) -> None:
        """捕获 Agent 推理/思考过程（CrewAI AgentReasoningCompletedEvent）。"""
        with lock:
            plan = getattr(event, "plan", "") or ""
            if plan:
                dashboard.output_panel.append_thought(plan)

    handlers: list[tuple[type, Callable[..., None]]] = [
        (TaskStartedEvent, _on_task_started),
        (TaskCompletedEvent, _on_task_completed),
        (TaskFailedEvent, _on_task_failed),
        (AgentReasoningCompletedEvent, _on_agent_thought),
    ]
    for event_type, handler in handlers:
        crewai_event_bus.register_handler(event_type, handler)

    return handlers, completed_tasks


def _uninstall_dashboard_handlers(
    handlers: list[tuple[type, Callable[..., None]]],
) -> None:
    """注销仪表盘事件钩子。"""
    from crewai.events.event_bus import crewai_event_bus

    for event_type, handler in handlers:
        crewai_event_bus.off(event_type, handler)


# ============================================================================
# 6. 调试与日志
# ============================================================================


def setup_logging(debug: bool, quiet: bool = False) -> None:
    """读取 / 设置 LITELLM_LOG。--debug 时强制 DEBUG 级别。"""
    # Windows 控制台默认 GBK 编码无法打印 CrewAI 日志中的部分 emoji（如 MCP 连接 🔌），
    # 强制 UTF-8 输出（errors=replace 兜底），避免 "gbk codec can't encode" 噪音
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if debug:
        os.environ["LITELLM_LOG"] = "DEBUG"
    else:
        os.environ.setdefault("LITELLM_LOG", "WARNING")

    log_level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    if not quiet:
        print(f"[Debug] LITELLM_LOG = {os.environ['LITELLM_LOG']}")


def print_team_summary(agents: dict, tasks: list, dashboard: Dashboard | None = None) -> None:
    """打印/记录团队配置摘要（API Key 脱敏，便于核对端点与模型）。

    dashboard 不为 None 时将摘要写入仪表盘日志，否则保持原有 print 输出。
    """
    lines = ["=" * 60, "REVACHOL Crew 配置摘要", "=" * 60]
    for agent_id in ["planner", "coder", "reviewer", "document_admin"]:
        llm = agents[agent_id].llm
        prefix = _AGENT_ENV[agent_id]["prefix"]
        key = os.getenv(f"{prefix}_API_KEY", "")
        masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "(未配置)"
        lines.append(
            f"  - {agent_id:<15} model={llm.model:<22} "
            f"base_url={llm.base_url:<42} key={masked}"
        )
    lines.append("-" * 60)
    lines.append(f"  Task 链路: {' → '.join(t.name for t in tasks)}")
    lines.append("=" * 60)

    summary = "\n".join(lines)
    if dashboard is not None:
        dashboard.log(summary, "info")
    else:
        print(summary)


def check_uvx_available() -> bool:
    """检查 uvx 是否可用（Git MCP 服务器通过 uvx 启动，uv 随项目安装）。"""
    import shutil

    return shutil.which("uvx") is not None


# ============================================================================
# 7. 主入口
# ============================================================================


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="REVACHOL 多 Agent 协作脚本（直接构建，绕过 JSONC ${VAR} 解析 Bug）"
    )
    parser.add_argument(
        "--requirement",
        type=str,
        default=None,
        help=(
            "本次任务的需求描述（注入到规划 Task 的 {requirement}）；"
            "不传时进入仪表盘交互式输入（--dry-run 使用占位需求）"
        ),
    )
    parser.add_argument(
        "--process",
        choices=["sequential", "hierarchical"],
        default="sequential",
        help="Crew 执行流程（默认 sequential；hierarchical 需 manager LLM）",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="开启 LITELLM_LOG=DEBUG 与 DEBUG 日志",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只构建 Agent/Task/Crew 并打印摘要，不执行 kickoff",
    )
    parser.add_argument(
        "--memory",
        action="store_true",
        help="启用 CrewAI 记忆（需 .env 配置 OPENAI_API_KEY / OPENAI_API_BASE）",
    )
    parser.add_argument(
        "--planning",
        action="store_true",
        help="启用 Agent 预规划（执行前先生成 step-by-step 计划）",
    )
    parser.add_argument(
        "--no-output-files",
        action="store_true",
        help="不将各 Task 结果写入 output/ 目录",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="只执行一个需求后退出（供后端 child_process.spawn 无头调用；需配合 --requirement）",
    )
    parser.add_argument(
        "--json-logs",
        action="store_true",
        help="向 stdout 输出 NDJSON 结构化事件流（crew:* 事件），隐含 --once；供 Web Dashboard 实时推送",
    )
    return parser.parse_args()


def build_embedder() -> dict | None:
    """记忆功能所需 Embedding 配置（当前通过 4SAPI 中转 OpenAI 兼容接口）。"""
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_API_BASE", "https://4sapi.org/v1")
    if not api_key:
        raise RuntimeError(
            "[配置错误] --memory 需要 OPENAI_API_KEY（Embedding），请在 .env 中配置"
        )
    return {
        "provider": "openai",
        "config": {
            "model": "text-embedding-3-small",
            "api_key": api_key,
            "base_url": base_url,
        },
    }


def _run_crew(
    dashboard: Dashboard,
    args: argparse.Namespace,
    requirement: str,
) -> None:
    """执行一轮 Crew 任务：构建 -> kickoff -> 后处理 -> 暂存检查。"""
    dashboard.lock_input("⏳ 正在执行需求，请等待...")
    dashboard.is_running = True
    handlers: list[tuple[type, Callable[..., None]]] = []

    try:
        # Git MCP 服务器依赖 uvx（uv 已随项目安装；首次运行自动下载 mcp-server-git）
        if not check_uvx_available():
            dashboard.log(
                "⚠️ uvx 未在 PATH 中找到。MCP Git 服务器将无法启动。\n"
                "       请安装 uv (https://docs.astral.sh/uv/) 或更换 mcps 配置中的启动命令。",
                "warning",
            )

        # 构建 Agent 与 Task
        agents = build_agents()
        tasks = build_tasks(
            agents, requirement, save_outputs=not args.no_output_files
        )

        # 记忆配置（可选）
        embedder = None
        if args.memory:
            embedder = build_embedder()

        # 构建 Crew
        crew = build_crew(agents, tasks, args.process, args.memory, args.planning)
        if embedder:
            crew.embedder = embedder

        print_team_summary(agents, tasks, dashboard=dashboard)

        # ===== 执行：注册事件钩子，保持 crew.kickoff() 原有语义 =====
        handlers, completed_tasks = _install_dashboard_handlers(dashboard)
        dashboard.log("▶ 开始执行 kickoff()", "info")
        result = crew.kickoff()
        crewai_event_bus.flush(timeout=10)  # 等待事件钩子完成，避免 stop 前丢更新

        # ---- Token 消耗统计 ----
        for agent_id, agent in agents.items():
            try:
                usage = agent.llm.get_token_usage_summary()
                tokens = int(getattr(usage, "total_tokens", 0) or 0)
                cost = float(getattr(usage, "cost", 0.0) or 0.0)
                if tokens:
                    display_name = _AGENT_DISPLAY_NAMES.get(agent_id, agent_id)
                    model = getattr(agent.llm, "model", "unknown")
                    provider = _infer_provider(model, agent_id)
                    dashboard.update_stats(
                        display_name,
                        tokens,
                        cost,
                        model=model,
                        provider=provider,
                    )
            except Exception:  # noqa: BLE001 - 统计失败不影响主流程
                pass

        # ---- 后处理：提取 / 校验 / 落盘（替代 output_pydantic）----
        parsed_results: dict[str, BaseModel | None] = {}
        for task_output in getattr(result, "tasks_output", []):
            name = task_output.name or ""
            model_class = _OUTPUT_MODELS.get(name)
            if model_class is None:
                continue

            # --debug 模式：在仪表盘输出窗口展示完整原始 LLM 输出，便于排查
            if args.debug:
                dashboard.log(f"[DEBUG] ======== {name} 原始输出 START ========", "info")
                dashboard.set_task(name)
                dashboard.set_output(task_output.raw[:2000], is_json=True)
                dashboard.log(f"[DEBUG] ======== {name} 原始输出 END ========", "info")

            parsed = parse_and_validate_output(
                task_output.raw,
                model_class,
                task_name=name,
                log_fn=dashboard.log,
            )
            parsed_results[name] = parsed
            if not args.no_output_files:
                write_parsed_output(name, parsed, task_output.raw, log_fn=dashboard.log)

            # 事件钩子缺失时的兜底：补齐 done 状态与输出
            if name not in completed_tasks:
                agent_name = _task_agent_name(name)
                dashboard.set_agent_status(agent_name, "done", name, "✅ 完成")
                dashboard.log(f"✅ {agent_name} 完成", "success")
                if task_output.raw:
                    dashboard.set_task(name)
                    dashboard.set_output(task_output.raw[:2000], is_json=True)

        # 最终结果展示（CrewOutput.raw 为 LLM 原始输出）
        dashboard.set_task("final")
        dashboard.set_output(
            (getattr(result, "raw", None) or str(result))[:2000], is_json=True
        )
        dashboard.log("✅ 所有任务执行完成", "success")

        # 后处理摘要（单条多行日志，保证在日志面板可见）
        summary_lines = ["=" * 60, "结构化输出后处理摘要"]
        for name, parsed in parsed_results.items():
            if parsed is None:
                summary_lines.append(
                    f"  {name:<15} ❌ 解析/校验失败（见上方 WARN 日志，流程未中断）"
                )
            else:
                fields = list(parsed.model_dump(mode="json").keys())
                summary_lines.append(
                    f"  {name:<15} ✅ 校验通过，字段: {', '.join(fields)}"
                )
        summary_lines.append("=" * 60)
        dashboard.log("\n".join(summary_lines), "success")

        # ---- Phase 5：审查未通过时保存代码到暂存区 ----
        review_parsed = parsed_results.get("review")
        coding_parsed = parsed_results.get("coding")
        if (
            review_parsed is not None
            and getattr(review_parsed, "approved", True) is False
        ):
            dashboard.log("⚠️ 审查未通过，代码已保存到暂存区", "warning")
            staging_dir = _save_to_staging(
                requirement,
                review_parsed,
                coding_parsed.model_dump(mode="json")
                if coding_parsed is not None
                else {},
            )
            dashboard.log(f"📁 暂存区: {staging_dir}", "info")

    finally:
        dashboard.is_running = False
        _uninstall_dashboard_handlers(handlers)
        # 确保事件总线中的待处理回调（含异常路径）在 stop 前完成
        try:
            crewai_event_bus.flush(timeout=5)
        except Exception:  # noqa: BLE001
            pass
        dashboard.unlock_input()


# ============================================================================
# 6.5 Web Dashboard 无头模式：NDJSON 结构化事件流
# ============================================================================
# 供 backend/routes/crew.cjs 通过 child_process.spawn 调用：
#   python run_revachol_crew.py --once --json-logs --requirement "..."
# 脚本不再启动 Rich/prompt_toolkit TUI，而是向 stdout 逐行输出 JSON 事件：
#   {"type": "crew:log",         "payload": {"level": "info",    "message": "..."}}
#   {"type": "crew:agent-status", "payload": {"agent": "Planner", "status": "running", "task": "...", "detail": "..."}}
#   {"type": "crew:task",        "payload": {"task": "planning"}}
#   {"type": "crew:output",      "payload": {"content": "...", "is_json": true}}
#   {"type": "crew:stats",       "payload": {"agent": "Planner", "tokens": 123, "cost": 0.0}}
#   {"type": "crew:started",     "payload": {"requirement": "...", "process": "sequential", ...}}
#   {"type": "crew:finished",    "payload": {"success": true, "error": null}}
# 后端负责将这些事件翻译为 WebSocket 广播的 CREW_* 事件。


class _NoopOutputPanel:
    """占位对象：兼容 _run_crew 中对 dashboard.output_panel 的调用。"""

    def start_agent(self, agent_name: str, task_name: str) -> None:
        pass

    def finish_agent(self, final_output: str, status: str = "done") -> None:
        pass

    def append_thought(self, thought: str) -> None:
        pass

    def set_task(self, task_name: str) -> None:
        pass

    def append(self, content: str, is_json: bool = False) -> None:
        pass

    def show_agent_block(self, agent_name: str) -> None:
        pass

    def show_all_blocks(self) -> None:
        pass


class JsonLogEmitter:
    """无 TUI 的 Dashboard 兼容实现：所有状态变更输出为 NDJSON 事件流。"""

    def __init__(self, debug: bool = False):
        self.is_running = False
        self.debug_mode = debug
        self.input_active = False
        self.output_panel = _NoopOutputPanel()

    def _emit(self, type_: str, **payload) -> None:
        event = {
            "type": type_,
            "payload": payload,
            "timestamp": datetime.now().isoformat(timespec="milliseconds"),
        }
        print(json.dumps(event, ensure_ascii=False), flush=True)

    # ---- Dashboard 兼容接口 ----

    def log(self, message: str, level: str = "info") -> None:
        self._emit("crew:log", level=level, message=str(message))

    def set_agent_status(
        self, agent: str, status: str, task: str = "", detail: str = ""
    ) -> None:
        self._emit(
            "crew:agent-status",
            agent=agent,
            status=status,
            task=task,
            detail=detail,
        )

    def set_task(self, task_name: str) -> None:
        self._emit("crew:task", task=task_name or "")

    def set_output(self, content: str, is_json: bool = False) -> None:
        self._emit(
            "crew:output",
            content=(content or "")[:2000],
            is_json=bool(is_json),
        )

    def update_stats(
        self,
        agent: str,
        tokens: int,
        cost: float = 0.0,
        model: str = "unknown",
        provider: str = "unknown",
    ) -> None:
        self._emit(
            "crew:stats",
            agent=agent,
            model=model,
            provider=provider,
            tokens=int(tokens or 0),
            cost=float(cost or 0.0),
        )

    def lock_input(self, status_message: str = "") -> None:
        pass

    def unlock_input(self) -> None:
        pass

    def reset_for_new_session(self) -> None:
        pass


def main() -> None:
    args = parse_args()
    setup_logging(args.debug, quiet=args.json_logs)
    validate_env()

    # ===== Web Dashboard 无头模式：--json-logs 隐含 --once =====
    if args.json_logs:
        args.once = True

    if args.once:
        if not args.requirement:
            raise RuntimeError(
                "[配置错误] --once/--json-logs 模式必须提供 --requirement"
            )
        emitter = JsonLogEmitter(debug=args.debug)
        emitter.is_running = True
        emitter._emit(
            "crew:started",
            requirement=args.requirement,
            process=args.process,
            memory=args.memory,
            planning=args.planning,
            debug=args.debug,
        )
        if not check_uvx_available():
            emitter.log(
                "⚠️ uvx 未在 PATH 中找到。MCP Git 服务器将无法启动。\n"
                "       请安装 uv (https://docs.astral.sh/uv/) 或更换 mcps 配置中的启动命令。",
                "warning",
            )
        try:
            if args.dry_run:
                # ---- Headless dry-run：只构建不执行，输出结构化事件后退出 ----
                agents = build_agents()
                tasks = build_tasks(
                    agents, args.requirement, save_outputs=not args.no_output_files
                )
                embedder = None
                if args.memory:
                    embedder = build_embedder()
                crew = build_crew(agents, tasks, args.process, args.memory, args.planning)
                if embedder:
                    crew.embedder = embedder
                print_team_summary(agents, tasks, dashboard=emitter)
                emitter.log("📋 Dry-run 模式，不执行实际任务", "warning")
                emitter._emit("crew:finished", success=True, error=None)
            else:
                _run_crew(emitter, args, args.requirement)
                emitter._emit("crew:finished", success=True, error=None)
        except Exception as exc:  # noqa: BLE001
            emitter.log(f"❌ 执行失败: {exc}", "error")
            emitter._emit("crew:finished", success=False, error=str(exc))
            raise
        finally:
            emitter.is_running = False
            try:
                crewai_event_bus.flush(timeout=5)
            except Exception:  # noqa: BLE001
                pass
        return

    # ===== 初始化仪表盘（只启动一次，持续复用）=====
    dashboard = Dashboard()
    dashboard.debug_mode = args.debug  # --debug 时打印按键调试日志

    # --dry-run 或首轮提供 --requirement 时不需要交互式输入面板
    if args.dry_run or args.requirement:
        dashboard.input_active = False

    # 启动仪表盘 Live 渲染
    dashboard.start()

    try:
        if args.dry_run:
            # ---- Dry-run：只构建不执行，不启动输入面板 ----
            requirement = args.requirement or "dry-run 占位需求"
            if not check_uvx_available():
                dashboard.log(
                    "⚠️ uvx 未在 PATH 中找到。MCP Git 服务器将无法启动。\n"
                    "       请安装 uv (https://docs.astral.sh/uv/) 或更换 mcps 配置中的启动命令。",
                    "warning",
                )
            agents = build_agents()
            tasks = build_tasks(
                agents, requirement, save_outputs=not args.no_output_files
            )
            embedder = None
            if args.memory:
                embedder = build_embedder()
            crew = build_crew(agents, tasks, args.process, args.memory, args.planning)
            if embedder:
                crew.embedder = embedder
            print_team_summary(agents, tasks, dashboard=dashboard)
            dashboard.log("📋 Dry-run 模式，不执行实际任务", "warning")
            return

        # ---- 核心循环：执行完一个需求后回到输入界面 ----
        while True:
            dashboard.reset_for_new_session()
            dashboard.log("🚀 REVACHOL 准备就绪", "info")

            # 需求获取：命令行参数仅第一轮使用，之后进入交互式输入
            if args.requirement:
                requirement = args.requirement
                args.requirement = None
                dashboard.log(f"使用命令行参数: {requirement}", "info")
                dashboard.lock_input("⏳ 使用命令行参数，准备执行...")
            else:
                dashboard.log("请在输入框中输入需求...", "info")
                requirement = wait_for_input(dashboard)
                dashboard.log(f"收到需求: {requirement}", "info")

            # 执行一轮
            try:
                _run_crew(dashboard, args, requirement)
            except KeyboardInterrupt:
                dashboard.log("⏹ 用户中断，回到输入界面", "warning")
                continue
            except Exception as exc:
                dashboard.log(f"❌ 执行失败: {exc}", "error")
                continue

            dashboard.log("✅ 需求执行完成，准备接受下一个需求", "success")
            time.sleep(2)  # 短暂停留让用户看到完成状态

    except KeyboardInterrupt:
        # 在输入界面按 Esc / Ctrl+C 时退出程序
        dashboard.log("👋 再见", "info")
        dashboard.cleanup_event_loop()
    finally:
        try:
            crewai_event_bus.flush(timeout=5)
        except Exception:  # noqa: BLE001
            pass
        dashboard.cleanup_event_loop()
        dashboard.stop()


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"\n❌ {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n已手动中断。", file=sys.stderr)
        sys.exit(130)
