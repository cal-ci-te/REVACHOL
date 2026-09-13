# ！Agent 列表面板
# 左侧栏，逐 Agent 展示状态图标、名称与当前任务，并支持选中高亮。
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from typing import Dict, List, Optional

class AgentPanel:
    """左侧Agent列表面板"""
    
    # 状态到图标的映射；未识别状态在渲染时回退为「暂停」，见 render
    STATUS_ICONS = {
        "idle": "⏸",
        "running": "▶",
        "done": "✅",
        "failed": "❌",
        "waiting": "⏳"
    }
    
    # 与上表同键，此处负责着色：图标表意，颜色表况
    STATUS_COLORS = {
        "idle": "dim",
        "running": "yellow",
        "done": "green",
        "failed": "red",
        "waiting": "blue"
    }
    
    # 构造时即建好全部 Agent 条目：渲染阶段无需判空，缺项只可能来自未知名称
    def __init__(self):
        self.agents: Dict[str, dict] = {}
        self.selected_agent: Optional[str] = None
        self._init_agents()
    
    # 名单顺序即渲染顺序；此处为显示名，与后端 AGENT_IDS 的英文标识不同
    def _init_agents(self):
        """初始化各 Agent 的状态"""
        self.selected_agent = None
        agent_names = ["Planner", "Coder", "Reviewer", "Document Admin", "Csser"]
        for name in agent_names:
            self.agents[name] = {
                "status": "idle",
                "task": "",
                "detail": ""
            }

    # 再次选中同一项即取消选中，省去单独的「取消」操作
    def select_agent(self, agent_name: Optional[str]):
        """选中/取消选中某个 Agent"""
        if self.selected_agent == agent_name:
            self.selected_agent = None
        else:
            self.selected_agent = agent_name
    
    # 只更新传入的非空字段：调用方可只刷新状态而不清掉已有 task/detail
    def update_status(self, agent_name: str, status: str, task: str = "", detail: str = ""):
        """更新Agent状态"""
        if agent_name in self.agents:
            self.agents[agent_name]["status"] = status
            if task:
                self.agents[agent_name]["task"] = task
            if detail:
                self.agents[agent_name]["detail"] = detail
    
    # 渲染为 Rich 表格：三列定宽，任务名过长时以省略号截断
    def render(self) -> Panel:
        """渲染Agent列表面板"""
        table = Table(
            show_header=False,
            box=None,
            padding=(0, 1),
            expand=True
        )
        table.add_column("Status", width=4)
        table.add_column("Agent", width=14)
        table.add_column("Task", width=20)
        
        for name, data in self.agents.items():
            status = data["status"]
            icon = self.STATUS_ICONS.get(status, "⏸")
            color = self.STATUS_COLORS.get(status, "dim")
            
            status_text = Text(icon, style=color)
            # 选中项以高亮底色区分，未选中沿用状态色
            if self.selected_agent == name:
                name_text = Text(name, style="bold green on dark_green")
            else:
                name_text = Text(name, style=f"bold {color}")
            task_text = Text(data["task"], style="dim", overflow="ellipsis")
            
            table.add_row(status_text, name_text, task_text)
        
        return Panel(
            table,
            title="🤖 Agents",
            border_style="cyan",
            padding=(1, 0)
        )