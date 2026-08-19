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
    python run_revachol_crew.py                        # 默认 sequential，跑全部四个 Task
    python run_revachol_crew.py --requirement "为贴纸系统新增旋转功能"
    python run_revachol_crew.py --debug                # 开启 LITELLM_LOG=DEBUG
    python run_revachol_crew.py --dry-run              # 只构建不执行（验证配置）
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

import argparse
import json
import logging
import os
import re
import sys

from typing import Any, List, Type

from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

from crewai import Agent, Crew, LLM, Process, Task

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
) -> BaseModel | None:
    """从 LLM 原始输出中提取 JSON 并校验为 Pydantic 模型。

    Args:
        raw_output: LLM 返回的原始字符串
        model_class: 目标 Pydantic 模型类
        task_name: 任务名称（用于日志定位）

    Returns:
        校验通过的 Pydantic 模型实例；解析/校验失败时返回 None（优雅降级，不中断流程）。
    """
    json_str = _extract_json(raw_output)
    if json_str is None:
        print(f"[WARN] {task_name}: 未从输出中提取到 JSON 内容")
        return None

    # 1) JSON 语法解析
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        print(f"[WARN] {task_name}: JSON 解析失败 - {exc}")
        print(f"[DEBUG] {task_name} 原始输出前 200 字符: {raw_output[:200]}...")
        return None

    # 2) Pydantic 校验
    try:
        return model_class.model_validate(data)
    except ValidationError as exc:
        print(f"[WARN] {task_name}: Pydantic 校验失败 - {exc}")
        print(f"[DEBUG] {task_name} 解析到的 JSON: {json.dumps(data, ensure_ascii=False)[:200]}...")
        # 3) 优雅降级：跳过校验尽量保留数据（字段缺失/类型不符时不崩溃）
        try:
            return model_class.model_construct(**data)
        except Exception as inner_exc:  # noqa: BLE001
            print(f"[WARN] {task_name}: 降级构造失败 - {inner_exc}")
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


def write_parsed_output(task_name: str, parsed: BaseModel | None, raw_output: str) -> None:
    """将后处理校验结果写入 output/{task_name}_parsed.json。"""
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    try:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"{task_name}_parsed.json")
        if parsed is None:
            payload: dict[str, Any] = {"parse_error": True, "raw": raw_output}
        else:
            payload = parsed.model_dump(mode="json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        print(f"[OK] 校验结果已写入 {path}")
    except (OSError, IOError) as exc:
        print(f"[WARN] {task_name}: 写入解析文件失败 - {exc}")


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
}


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
        mcps=[
            {
                "command": "uvx",
                "args": [
                    "mcp-server-git",
                    "--repository", "D:/Revachol",  # 仓库根目录绝对路径（正斜杠）
                ],
            }
        ],
    )

    return {
        "planner": planner,
        "coder": coder,
        "reviewer": reviewer,
        "document_admin": document_admin,
    }


# ============================================================================
# 4. Task 定义（体现协作：reviewer 依赖 coder 输出，doc 汇总全链路）
# ============================================================================


def build_tasks(agents: dict, requirement: str, save_outputs: bool) -> list:
    """构建四个 Task 并形成协作链。"""

    def _output_file(name: str) -> str | None:
        """Task 级输出文件：写入 output/ 目录（create_directory 自动建目录）。"""
        return f"output/{name}.json" if save_outputs else None

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
# 6. 调试与日志
# ============================================================================


def setup_logging(debug: bool) -> None:
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
    print(f"[Debug] LITELLM_LOG = {os.environ['LITELLM_LOG']}")


def print_team_summary(agents: dict, tasks: list) -> None:
    """打印团队配置摘要（API Key 脱敏，便于核对端点与模型）。"""
    print("=" * 60)
    print("REVACHOL Crew 配置摘要")
    print("=" * 60)
    for agent_id in ["planner", "coder", "reviewer", "document_admin"]:
        llm = agents[agent_id].llm
        prefix = _AGENT_ENV[agent_id]["prefix"]
        key = os.getenv(f"{prefix}_API_KEY", "")
        masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "(未配置)"
        print(
            f"  - {agent_id:<15} model={llm.model:<22} "
            f"base_url={llm.base_url:<42} key={masked}"
        )
    print("-" * 60)
    print(f"  Task 链路: {' → '.join(t.name for t in tasks)}")
    print("=" * 60)


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
        default="为贴纸系统新增旋转功能（数据驱动锚点架构 WIP 基础上）",
        help="本次任务的需求描述（注入到规划 Task 的 {requirement}）",
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


def main() -> None:
    args = parse_args()
    setup_logging(args.debug)
    validate_env()

    # Git MCP 服务器依赖 uvx（uv 已随项目安装；首次运行自动下载 mcp-server-git）
    if not check_uvx_available():
        print("[WARN] uvx 未在 PATH 中找到。MCP Git 服务器将无法启动。")
        print("       请安装 uv (https://docs.astral.sh/uv/) 或更换 mcps 配置中的启动命令。")

    # 构建 Agent 与 Task
    agents = build_agents()
    tasks = build_tasks(agents, args.requirement, save_outputs=not args.no_output_files)

    # 记忆配置（可选）
    embedder = None
    if args.memory:
        embedder = build_embedder()

    # 构建 Crew
    crew = build_crew(agents, tasks, args.process, args.memory, args.planning)
    if embedder:
        crew.embedder = embedder

    print_team_summary(agents, tasks)

    if args.dry_run:
        print("[Dry-run] 构建成功，未执行 kickoff。移除 --dry-run 后即可正式运行。")
        return

    # ---- 执行 ----
    print("\n[Crew] 开始执行 kickoff() ...\n")
    result = crew.kickoff()

    # 打印最终结果（CrewOutput.raw 为 LLM 原始输出）
    print("\n" + "=" * 60)
    print("最终结果")
    print("=" * 60)
    print(getattr(result, "raw", None) or str(result))

    # ---- 后处理：提取 / 校验 / 落盘（替代 output_pydantic）----
    print("\n" + "=" * 60)
    print("结构化输出后处理")
    print("=" * 60)
    parsed_results: dict[str, BaseModel | None] = {}
    for task_output in getattr(result, "tasks_output", []):
        name = task_output.name or ""
        model_class = _OUTPUT_MODELS.get(name)
        if model_class is None:
            continue

        # --debug 模式：打印完整原始 LLM 输出，便于排查 JSON 解析问题
        if args.debug:
            print(f"\n[DEBUG] ======== {name} 原始输出 START ========")
            print(task_output.raw)
            print(f"[DEBUG] ======== {name} 原始输出 END ========")

        parsed = parse_and_validate_output(
            task_output.raw, model_class, task_name=name
        )
        parsed_results[name] = parsed
        if not args.no_output_files:
            write_parsed_output(name, parsed, task_output.raw)

    # 后处理摘要
    print("\n" + "-" * 60)
    for name, parsed in parsed_results.items():
        if parsed is None:
            print(f"  {name:<15} ❌ 解析/校验失败（见上方 WARN 日志，流程未中断）")
        else:
            fields = list(parsed.model_dump(mode="json").keys())
            print(f"  {name:<15} ✅ 校验通过，字段: {', '.join(fields)}")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"\n❌ {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n已手动中断。", file=sys.stderr)
        sys.exit(130)
