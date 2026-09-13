# ！Log 日志面板
# 底部固定高度的日志栏，保留最近若干条并逐条按级别着色。
from rich.panel import Panel
from rich.text import Text
from rich.console import Group
from datetime import datetime

class LogPanel:
    """底部日志栏，显示实时日志"""
    
    def __init__(self, max_lines: int = 3):
        self.max_lines = max_lines
        # 元素结构为 (time, level, message) 三元组
        self.logs: list[tuple[str, str, str]] = []
    
    # 追加一条日志，并裁剪到 max_lines——固定高度面板用尾部切片实现滚动窗口
    def log(self, message: str, level: str = "info"):
        """添加日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.logs.append((timestamp, level, message))
        
        if len(self.logs) > self.max_lines:
            self.logs = self.logs[-self.max_lines:]
    
    # 渲染为 Rich 面板：按级别取色后逐行拼接
    def render(self) -> Panel:
        """渲染日志面板"""
        lines = []
        for timestamp, level, message in self.logs:
            # 级别到颜色的映射；未知级别回退 dim，避免未识别级别无样式
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
        
        # 空态占位：面板高度固定，无日志时也需占一行，否则布局抖动
        if not lines:
            lines.append(Text("等待执行...", style="dim"))
        
        return Panel(
            Group(*lines),
            title="📋 Logs",
            border_style="bright_black",
            padding=(0, 1)
        )