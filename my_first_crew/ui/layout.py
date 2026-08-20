from rich.layout import Layout
from rich.panel import Panel
from rich.console import Console, Group
from rich.text import Text
from rich.align import Align
from rich.live import Live
from rich.table import Table

class LayoutManager:
    """管理三栏式仪表盘的布局"""
    
    def __init__(self, console: Console):
        self.console = console
        self.layout = Layout()
        self._build_layout()
    
    def _build_layout(self):
        """构建三栏式布局（含顶部输入区域）"""
        # 主体：顶部状态栏(1) + 输入区(3) + 主区域 + 底部日志(6)
        self.layout.split(
            Layout(name="header", size=1),
            Layout(name="input", size=3),
            Layout(name="body"),
            Layout(name="footer", size=6)
        )
        
        # Body: 左侧30% + 右侧70%
        self.layout["body"].split_row(
            Layout(name="left_panel", ratio=30),
            Layout(name="right_panel", ratio=70)
        )
        
        # Right panel: 上80% + 下20%
        self.layout["right_panel"].split(
            Layout(name="output_panel", ratio=70),
            Layout(name="stats_panel", ratio=30)
        )
    
    def update_header(self, title: str, subtitle: str, status: str, elapsed: str):
        """更新顶部状态栏"""
        header_text = Text()
        header_text.append(f"🚀 {title}", style="bold cyan")
        header_text.append(f"  {subtitle}", style="dim")
        header_text.append(f"  {status}", style="yellow")
        header_text.append(f"  ⏱ {elapsed}", style="green")
        
        self.layout["header"].update(
            Panel(
                Align.center(header_text),
                style="bright_black",
                border_style="bright_black"
            )
        )
    
    def update_input_panel(self, content: Panel):
        """更新顶部输入区域"""
        self.layout["input"].update(content)

    def update_left_panel(self, content: Panel):
        """更新左侧Agent列表"""
        self.layout["left_panel"].update(content)
    
    def update_output_panel(self, content: Panel):
        """更新右上输出窗口"""
        self.layout["output_panel"].update(content)
    
    def update_stats_panel(self, content: Panel):
        """更新右下统计面板"""
        self.layout["stats_panel"].update(content)
    
    def update_footer(self, content: Panel):
        """更新底部日志栏"""
        self.layout["footer"].update(content)
    
    def get_layout(self) -> Layout:
        return self.layout