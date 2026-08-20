from rich.panel import Panel
from rich.table import Table
from typing import Dict

class StatsPanel:
    """右下统计面板，显示Token消耗和成本"""
    
    def __init__(self):
        self.tokens: Dict[str, int] = {}
        self.cost: float = 0.0
    
    def update_tokens(self, agent: str, tokens: int, cost: float = 0.0):
        self.tokens[agent] = tokens
        self.cost += cost

    def reset(self):
        """重置统计面板，准备新一轮会话"""
        self.tokens = {}
        self.cost = 0.0
    
    def render(self) -> Panel:
        """渲染统计面板"""
        table = Table(show_header=True, box=None, padding=(0, 1))
        table.add_column("Agent", style="bold")
        table.add_column("Tokens", justify="right")
        
        total = 0
        for agent, count in self.tokens.items():
            table.add_row(agent, f"{count:,}")
            total += count
        
        table.add_row("─" * 10, "─" * 10)
        table.add_row("📊 Total", f"{total:,}", style="bold green")
        
        if self.cost > 0:
            table.add_row("💰 Cost", f"${self.cost:.4f}", style="yellow")
        
        return Panel(
            table,
            title="📊 Stats",
            border_style="magenta",
            padding=(1, 2)
        )