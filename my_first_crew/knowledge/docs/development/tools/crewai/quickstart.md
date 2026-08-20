# CrewAI 多 Agent 协作 — 快速启动

> 面向新接入的开发者或 AI 助手。完整说明见 [crewai-guide.md](crewai-guide.md)。
> 项目版本：crewai 1.15.16 | 更新：2026-08-20

REVACHOL 使用 **CrewAI 框架**（JSON-first 声明式配置）编排多 Agent 协作。四个 Agent 各司其职：技术规划 → 代码开发 → 代码审查 → 文档处理。

---

## 1. 环境准备

### 1.1 Python 版本要求

- Python **3.10 – 3.13**（`pyproject.toml` 中 `requires-python = ">=3.10,<3.14"`）
- 依赖管理器：[uv](https://docs.astral.sh/uv/)（本项目的虚拟环境与依赖锁定均由 uv 管理）
- Docker 镜像内使用 Python 3.11（`node:22-bookworm-slim`）

### 1.2 安装依赖

在项目根目录（`my_first_crew/`）执行：

```bash
uv sync
```

或使用 pip（Docker 构建路径）：

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

核心依赖：

| 依赖 | 版本 | 说明 |
|------|------|------|
| `crewai[litellm,tools]` | `>=1.15.16,<2.0.0` | CrewAI 框架 + LiteLLM 模型路由 + 内置工具集 |

### 1.3 配置 `.env`

在项目根目录创建 `.env`（模板见下，**密钥值切勿提交到仓库**）。四个 Agent 各有一组 API Key，Embedding 单独一组：

```dotenv
# ============================================================
# 技术规划师 (Planner) - deepseek-v4-pro
# ============================================================
DEEPSEEK_PRO_API_KEY=your_key_here
DEEPSEEK_PRO_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_PRO_MODEL=deepseek-v4-pro

# ============================================================
# 代码开发者 (Coder) - deepseek-v4-flash
# ============================================================
DEEPSEEK_FLASH_API_KEY=your_key_here
DEEPSEEK_FLASH_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash

# ============================================================
# 代码审查员 (Reviewer) - kimi-k2.7-code (Moonshot AI)
# ============================================================
KIMI_API_KEY=your_key_here
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=kimi-k2.7-code

# ============================================================
# 文档处理员 (Document Admin) - mimo-v2.5 (Xiaomi MiMo)
# ============================================================
MIMO_API_KEY=your_key_here
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.5

# ============================================================
# CrewAI 记忆存储 / Embedding（通过 4SAPI 中转 OpenAI 兼容接口）
# 对应 crew.jsonc 中 embedder 配置（memory: true 时必需）
# ============================================================
OPENAI_API_KEY=your_key_here
OPENAI_API_BASE=https://4sapi.org/v1
```

> **四个必须配置的 API Key**：`DEEPSEEK_PRO_API_KEY`、`DEEPSEEK_FLASH_API_KEY`、`KIMI_API_KEY`、`MIMO_API_KEY`。
> Embedding 变量 `OPENAI_API_KEY` / `OPENAI_API_BASE` 在启用 `memory: true` 时必需（详见 [crewai-guide.md §4](#4-记忆功能配置)）。

---

## 2. 项目结构速览

```
my_first_crew/
├── .env                    # API Keys 与 Embedding 配置（gitignore，勿提交）
├── pyproject.toml          # 项目依赖 + [tool.crewai] 入口声明（definition = crew.jsonc）
├── uv.lock                 # uv 依赖锁定文件
├── crew.jsonc              # 主配置：Crew 设置 + Task 定义 + 记忆/执行流程
├── agents/                 # Agent 定义目录（每个 Agent 一个 JSONC 文件）
│   ├── _planner.jsonc          # 技术规划师 (Planner)
│   ├── _coder.jsonc            # 代码开发者 (Coder)
│   ├── _reviewer.jsonc         # 代码审查员 (Reviewer)
│   └── _document_admin.jsonc   # 文档处理员 (Document Admin)
├── tools/                  # 自定义工具目录（Python，预留）
├── knowledge/              # 知识库目录（Agent 可读取的项目文档）
│   ├── AI_CONTEXT.md
│   ├── README.md
│   └── docs/               # 项目文档镜像（architecture/development/...）
└── skills/                 # 技能目录（预留，SKILL.md 模板）
```

### 2.1 各文件/目录用途

| 路径 | 用途 |
|------|------|
| `crew.jsonc` | 引用 `agents/` 下的 Agent、内联定义 Task、设置执行流程（`process`）、记忆（`memory`/`embedder`）与运行时输入（`inputs`） |
| `agents/*.jsonc` | 单个 Agent 的定义：角色、目标、人设、模型、工具、行为设置 |
| `tools/` | 自定义 Python 工具，通过 `"custom:工具名"` 引用 |
| `knowledge/` | 知识库文档，Agent 通过 `knowledge_sources` 或文件工具读取 |
| `skills/` | 技能定义目录（预留） |

### 2.2 Agent 配置文件字段说明

以 `agents/_planner.jsonc` 为例：

```jsonc
{
  "role": "技术规划师 (Planner)",          // 角色标题，出现在 prompt 与日志中，支持 {placeholder}
  "goal": "1. 负责将复杂的开发任务拆解为清晰、可执行的子任务清单；...",  // 核心目标（分号分隔多条）
  "backstory": "你是一位拥有 12 年全栈架构经验的首席技术规划师，...",    // 人设背景，塑造回答风格
  "llm": {                                  // 模型配置（对象写法，见完整文档 §2.2）
    "model": "openai/deepseek-v4-pro",
    "api_key": "${DEEPSEEK_PRO_API_KEY}",   // ${VAR} 从 .env 读取
    "base_url": "https://api.deepseek.com/v1"
  },
  "tools": ["SerperDevTool", "FileReadTool"],  // 可用工具列表（内置工具名或 custom:xxx）
  "settings": {                             // 行为设置
    "verbose": false,                       // 是否输出详细执行日志
    "allow_delegation": true,               // 允许将子任务委派给其他 Agent
    "planning": true                        // 执行前先生成逐步计划
  }
}
```

---

## 3. 快速运行

```bash
# 1. 进入项目目录
cd my_first_crew

# 2. 激活虚拟环境（Windows）
.venv\Scripts\activate

# 3. 直接运行 Crew（使用 crew.jsonc 中 inputs 的默认值）
crewai run

# 4. 传参运行（覆盖 inputs 中的占位符）
crewai run --inputs '{"requirement": "为贴纸系统新增旋转功能", "project_context": "REVACHOL v1.18.4 数据驱动锚点架构（WIP）"}'
```

运行后将看到四个 Agent 按 `sequential` 顺序依次执行，最终输出汇总结果。详细日志由 `crew.jsonc` 的 `"verbose": true` 控制。

### 3.1 Web Dashboard 无头模式（`--once --json-logs`）

REVACHOL 内置 Crew Dashboard（`/crew-dashboard.html`）通过后端 `child_process.spawn()` 调用脚本的无头模式：

```bash
# 单次执行一个需求后退出，并向 stdout 输出 NDJSON 事件流
python run_revachol_crew.py --once --json-logs --requirement "为贴纸系统新增旋转功能"

# 安全验证：只构建 Agent/Task/Crew，不调用 LLM
python run_revachol_crew.py --once --json-logs --dry-run --requirement "验证配置"
```

事件流类型：`crew:started` / `crew:log` / `crew:agent-status` / `crew:task` / `crew:output` / `crew:stats` / `crew:finished`。后端 `backend/routes/crew.cjs` 解析后翻译为 WebSocket 广播 `CREW_*` 事件，由前端实时渲染。

---

## 4. 常见问题

### Q1：Memory 功能报错 / Embedding 失败？

`crew.jsonc` 中 `"memory": true` 时，CrewAI 需要 Embedding 模型来写入和检索短期/长期记忆。本项目已通过 **4SAPI 中转**（OpenAI 兼容接口）配置：

- `.env` 中配置 `OPENAI_API_KEY` + `OPENAI_API_BASE=https://4sapi.org/v1`
- `crew.jsonc` 的 `embedder` 使用 `provider: "openai"`、`model: "text-embedding-3-small"`，通过 `${OPENAI_API_KEY}` / `${OPENAI_API_BASE}` 读取环境变量

若仍失败，检查：`.env` 中这两个变量是否已填写、密钥是否有效、网络是否能访问 `4sapi.org`。

### Q2：LiteLLM 依赖？

已安装。`pyproject.toml` 的依赖为 `crewai[litellm,tools]`，其中 `litellm` 负责将 `llm.model` 字符串（如 `openai/deepseek-v4-pro`）路由到对应 provider。无需额外安装。

### Q3：修改 Agent / Task 配置需要重启吗？

不需要。CrewAI 每次执行 `crewai run` 时都会重新读取 `crew.jsonc` 与 `agents/*.jsonc`，**修改配置后直接生效**。仅 `.env` 修改后需要重新执行 `crewai run`（环境变量在进程启动时加载）。

### Q4：`crewai run` 提示找不到命令？

确认已激活虚拟环境（`.venv\Scripts\activate`），且 `uv sync` 已成功执行。也可直接使用 `uv run crewai run`。

### Q5：Agent 配置文件中的 `$` 或中文乱码？

- `agents/*.jsonc` 是 JSONC（JSON with Comments），字段值中的中文若以 `\uXXXX` 转义形式存储是正常的，编辑器会正常显示
- 配置文件注释必须使用 `//` 或 `/* */`，不允许尾逗号（trailing comma）
