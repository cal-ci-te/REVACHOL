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

## Project Structure

- `agents/` - Agent definitions (JSONC)
- `crew.jsonc` - Crew definition with tasks and configuration
- `tools/` - Custom tools (Python)
- `knowledge/` - Knowledge files for agents

> **Note:** `custom:<name>` tool references execute `tools/<name>.py` as local
> Python code when the crew loads. Only run crew projects from sources you
> trust.
