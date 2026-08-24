# my_first_crew

A crewAI project using JSON-first configuration.

## Running

```bash
# JSON-first 方式
crewai run

# 无头模式（Crew Dashboard 后端调用；单次执行 + NDJSON 事件流）
python run_revachol_crew.py --once --json-logs --requirement "your requirement"

# 安全验证（不调用 LLM）
python run_revachol_crew.py --once --json-logs --dry-run --requirement "your requirement"
```

### RFC-001 Flow 入口（文本处理员先行 + 审查修改循环）

```bash
# Flow 无头模式（事件类型为 flow:*）
python run_revachol_flow.py --once --json-logs --requirement "your requirement"

# Flow 安全验证
python run_revachol_flow.py --once --json-logs --dry-run --requirement "your requirement"

# 断点续跑（D7）
python run_revachol_flow.py --once --json-logs --resume <task_id>

# 清理过期暂存快照（D3，默认保留 30 天）
python run_revachol_flow.py --cleanup-staging --days 30
```

Flow 测试：`python -m pytest tests -q`（需先 `uv pip install -r requirements-dev.txt`）。

## Project Structure

- `agents/` - Agent definitions (JSONC, 含 RFC-001 TextProcessor)
- `flows/` - RFC-001 Flow 状态机（state/persistence/staging/document_review_flow）
- `crew.jsonc` - Crew definition with tasks and configuration
- `run_revachol_crew.py` - Crew 顺序执行入口
- `run_revachol_flow.py` - Flow 状态机入口（RFC-001）
- `tools/` - Custom tools (Python)
- `knowledge/` - Knowledge files for agents
- `tests/` - Flow pytest 测试

> **Note:** `custom:<name>` tool references execute `tools/<name>.py` as local
> Python code when the crew loads. Only run crew projects from sources you
> trust.
