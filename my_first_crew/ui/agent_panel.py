from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from typing import Dict, List, Optional

class AgentPanel:
    """左侧Agent列表面板"""
    
    STATUS_ICONS = {
        "idle": "⏸",
        "running": "▶",
        "done": "✅",
        "failed": "❌",
        "waiting": "⏳"
    }
    
    STATUS_COLORS = {
        "idle": "dim",
        "running": "yellow",
        "done": "green",
        "failed": "red",
        "waiting": "blue"
    }
    
    def __init__(self):
        self.agents: Dict[str, dict] = {}
        self.selected_agent: Optional[str] = None
        self._init_agents()
    
    def _init_agents(self):
        """初始化四个Agent的状态"""
        self.selected_agent = None
        agent_names = ["Planner", "Coder", "Reviewer", "Document Admin"]
        for name in agent_names:
            self.agents[name] = {
                "status": "idle",
                "task": "",
                "detail": ""
            }

    def select_agent(self, agent_name: Optional[str]):
        """选中/取消选中某个 Agent"""
        if self.selected_agent == agent_name:
            self.selected_agent = None
        else:
            self.selected_agent = agent_name
    
    def update_status(self, agent_name: str, status: str, task: str = "", detail: str = ""):
        """更新Agent状态"""
        if agent_name in self.agents:
            self.agents[agent_name]["status"] = status
            if task:
                self.agents[agent_name]["task"] = task
            if detail:
                self.agents[agent_name]["detail"] = detail
    
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