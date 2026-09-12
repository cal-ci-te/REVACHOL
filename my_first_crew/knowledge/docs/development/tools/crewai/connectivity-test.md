# 模型连通性测试

> 在终端快速验证各 Agent 模型（含 Csser / GLM）的 API Key 有效性、端点可达性与基本响应能力。
> 版本：v1.29.0+ | 更新：2026-08-30

## 背景

REVACHOL Crew/Flow 使用多个 LLM 模型：

| Agent | 模型 | 角色 |
|-------|------|------|
| Planner | deepseek-v4-pro | 技术规划师 |
| Coder | deepseek-v4-flash | 代码开发者 |
| Reviewer | kimi-k2.7-code | 代码审查员 |
| Document Admin | mimo-v2.5 | 文档处理员 |
| TextProcessor | deepseek-v4-flash（复用） | 文本处理员 |
| Csser | glm-5.3-flash | CSS 开发者 |

---

## 1. 使用 `test_single_model.py` 测试

该脚本支持全部六个模型，base_url 优先读取 `.env` 中的 `<PREFIX>_BASE_URL`（与运行时的 `build_llm()` 行为一致），缺失时回退到官方端点。

### 1.1 测试单个模型

```bash
cd my_first_crew

# 激活虚拟环境（Windows）
.venv\Scripts\activate

# 测试 Csser（GLM）连通性
python test_single_model.py --model csser --message "输出一条 CSS 规则：使用 var(--color-accent)"

# 测试 Planner
python test_single_model.py --model planner --message "解释 CSS 变量体系"

# 测试 Coder
python test_single_model.py --model coder --message "用 JavaScript 写一个 hello 函数"

# 测试 Reviewer
python test_single_model.py --model reviewer --temperature 0.5 --message "审查这段代码..."

# 测试 Document Admin
python test_single_model.py --model document_admin --message "总结 CSS 文件结构"

# 自定义温度和最大 token
python test_single_model.py --model csser --temperature 0.1 --max-tokens 200 --message "输出一条 flex 居中代码"
```

### 1.2 测试所有模型

```bash
python test_single_model.py --model all
```

按顺序逐一调用所有模型，输出完整响应，适用于一次性全链路排查。

### 1.3 交互式对话

```bash
python test_single_model.py --interactive --model csser
```

进入连续对话模式，输入 `exit` 退出，`clear` 清空历史。

---

## 2. 使用 curl 直接测试

绕过 CrewAI/LLM，直接验证 API 端点可用性，适合快速定位是模型问题还是框架问题。

### 2.1 GLM / Csser

```bash
# 加载环境变量
set -a; source my_first_crew/.env; set +a

# 列出可用模型
curl -sS --max-time 30 \
  -H "Authorization: Bearer ${GLM_API_KEY}" \
  "${GLM_BASE_URL%/}/models" \
  | python -m json.tool 2>/dev/null || echo "JSON 解析失败"

# 测试 chat 连通性
curl -sS --max-time 60 -X POST "${GLM_BASE_URL%/}/chat/completions" \
  -H "Authorization: Bearer ${GLM_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5.3-flash","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}'
```

### 2.2 DeepSeek（Planner / Coder / TextProcessor）

```bash
curl -sS --max-time 60 -X POST "${DEEPSEEK_PRO_BASE_URL%/}/chat/completions" \
  -H "Authorization: Bearer ${DEEPSEEK_PRO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-pro","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'
```

### 2.3 Kimi（Reviewer）

```bash
curl -sS --max-time 60 -X POST "${KIMI_BASE_URL%/}/chat/completions" \
  -H "Authorization: Bearer ${KIMI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"kimi-k2.7-code","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'
```

### 2.4 MiMo（Document Admin）

```bash
curl -sS --max-time 60 -X POST "${MIMO_BASE_URL%/}/chat/completions" \
  -H "Authorization: Bearer ${MIMO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2.5","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'
```

---

## 3. 使用 Flow dry-run 验证

dry-run 不调用 LLM，只构建 Flow 并打印摘要，验证 Agent 配置正确（含 Csser）：

```bash
cd my_first_crew
.venv\Scripts\activate
python run_revachol_flow.py --once --json-logs --dry-run --requirement "验证连通性"
```

预期输出摘要中包含 `参与 Agent = Planner / TextProcessor / Coder / Csser / Reviewer / Document_Admin`。

---

## 4. 使用 Flow 实际执行验证

运行一次完整 Flow（会调用所有 Agent 的 LLM），确认 Csser（GLM）在真实流程中工作：

```bash
cd my_first_crew
.venv\Scripts\activate
python run_revachol_flow.py --once --json-logs \
  --requirement "为 .card 组件补充 CSS 样式：使用项目 CSS 变量体系统一三套主题下的卡片边框与悬停效果"
```

运行后检查输出中是否存在 `Csser` 的 `flow:log` 和 `flow:stats` 事件。

> 注意：若 `.env` 中 DEEPSEEK_* 的 BASE_URL 指向统一网关（如 `api.ginka.cloud`），而该网关仅有 GLM 渠道可用，则 Planner 等依赖 DeepSeek 模型的步骤会失败，但这不影响 Csser 本身连通性的验证。此时可单独验证 Csser（见 §1 或 §2）。

---

## 5. 常见失败排查

### 5.1 "模型已关闭" / "No available channel for model"

- **原因**：模型的 BASE_URL 指向了不支持该模型的网关（例如用 GLM 的 API Key 调用 DeepSeek 模型，或 DeepSeek 模型在网关中已下架）。
- **解决**：
  - 检查 `.env` 中对应的 `BASE_URL` 和 `API_KEY` 是否匹配服务商。
  - 若需走统一网关，确认网关侧是否开通了对应模型渠道。
  - 回退到服务商官方端点（如 `https://api.deepseek.com/v1`）。

### 5.2 "Connection reset" / "Request timed out"

- **原因**：网络不稳定、端点防火墙限制、或超时设置过短（默认 600s 已宽松）。
- **解决**：
  - 使用 `curl` 直接测试（见 §2）排除框架层问题。
  - 检查代理/VPN 是否影响 API 直连。
  - 确认 API Key 未过期、额度未耗尽。

### 5.3 "401 Unauthorized"

- **原因**：API Key 无效或未配置。
- **解决**：
  - 检查 `.env` 中对应 `API_KEY` 是否有值且正确。
  - 确认 Key 没有空格或换行符污染。

### 5.4 "400 response_format" / "This response_format type is unavailable"

- **原因**：CrewAI 的 `output_pydantic` 会注入 `response_format`，部分模型不支持。
- **解决**：本项目已通过「Prompt 约束 + 后处理校验」绕过，无需额外配置。若出现此错误，说明某个 Task 未正确移除 `output_pydantic`，请检查 `run_revachol_crew.py` 中的 Task 定义。

---

## 6. 参考

- [quickstart.md](quickstart.md) — 快速启动
- [crewai-guide.md](crewai-guide.md) — 完整指南
- `test_single_model.py` — 单模型测试工具
- `run_revachol_flow.py` — Flow 入口