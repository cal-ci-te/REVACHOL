from rich.panel import Panel
from rich.text import Text
from rich.console import Group
from datetime import datetime

class LogPanel:
    """底部日志栏，显示实时日志"""
    
    def __init__(self, max_lines: int = 3):
        self.max_lines = max_lines
        self.logs: list[tuple[str, str, str]] = []  # (time, level, message)
    
    def log(self, message: str, level: str = "info"):
        """添加日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.logs.append((timestamp, level, message))
        
        if len(self.logs) > self.max_lines:
            self.logs = self.logs[-self.max_lines:]
    
    def render(self) -> Panel:
        """渲染日志面板"""
        lines = []
        for timestamp, level, message in self.logs:
            color = {
                "info": "dim",
                "success": "green",
                "warning": "yellow",
                "error": "red"
            }.get(level, "dim")
            
            line = Text()
            line.append(f"[{timestamp}] ", style="bright_black")
            line.append(message, style=color)
            lines.append(line)
        
        if not lines:
            lines.append(Text("等待执行...", style="dim"))
        
        return Panel(
            Group(*lines),
            title="📋 Logs",
            border_style="bright_black",
            padding=(0, 1)
        )