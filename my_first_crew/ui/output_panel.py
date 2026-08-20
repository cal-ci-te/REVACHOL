from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from rich.panel import Panel as RichPanel
from rich.syntax import Syntax
from rich.text import Text
from rich.console import Group


@dataclass
class AgentOutputBlock:
    """单个 Agent/Task 的输出块：思考链 + 最终输出。"""

    agent_name: str
    task_name: str
    status: str  # "running", "done", "failed"
    thinking_lines: List[str] = field(default_factory=list)
    final_output: Optional[str] = None
    timestamp: str = field(
        default_factory=lambda: datetime.now().strftime("%H:%M:%S")
    )


class OutputPanel:
    """右上输出窗口：按 Agent/Task 记录思考链与最终输出，支持回溯。"""

    def __init__(self, max_blocks: int = 20):
        self.blocks: List[AgentOutputBlock] = []
        self.current_block: Optional[AgentOutputBlock] = None
        self.max_blocks = max_blocks
        self.filter_agent: Optional[str] = None
        self.current_task = ""
        self.global_output = ""

    def clear(self):
        """清空所有历史块与全局输出"""
        self.blocks = []
        self.current_block = None
        self.filter_agent = None
        self.current_task = ""
        self.global_output = ""

    def set_task(self, task_name: str):
        """切换当前任务标签（不清空历史块）"""
        self.current_task = task_name

    def start_agent(self, agent_name: str, task_name: str):
        """Agent 开始执行：新建输出块"""
        self.current_block = AgentOutputBlock(
            agent_name=agent_name,
            task_name=task_name,
            status="running",
        )
        self.blocks.append(self.current_block)
        if len(self.blocks) > self.max_blocks:
            self.blocks = self.blocks[-self.max_blocks:]

    def append_thought(self, thought: str):
        """追加一条思考/推理内容到当前输出块"""
        if self.current_block and thought:
            self.current_block.thinking_lines.append(thought)

    def finish_agent(self, final_output: str, status: str = "done"):
        """Agent 执行结束：填充最终输出"""
        if self.current_block:
            self.current_block.status = status
            if final_output:
                self.current_block.final_output = final_output
            self.current_block = None

    def append(self, content: str, is_json: bool = False):
        """兼容旧接口：当前块存在时写入最终输出，否则写入全局输出"""
        content = content or ""
        if self.current_block is not None:
            self.current_block.final_output = (
                (self.current_block.final_output or "") + content
            )
        else:
            self.global_output = (self.global_output or "") + content

    def show_agent_block(self, agent_name: str):
        """只显示指定 Agent 的输出块"""
        self.filter_agent = agent_name

    def show_all_blocks(self):
        """显示所有输出块"""
        self.filter_agent = None

    def render(self) -> RichPanel:
        """渲染输出窗口：思考过程弱化，最终输出醒目"""
        blocks = self.blocks
        if self.filter_agent:
            blocks = [b for b in blocks if b.agent_name == self.filter_agent]

        if not blocks and not self.global_output:
            return RichPanel(
                "等待输出...",
                title="📋 执行回放",
                border_style="dim",
            )

        content: List[object] = []
        for block in blocks:
            status_icon = (
                "▶"
                if block.status == "running"
                else "✅"
                if block.status == "done"
                else "❌"
            )
            header = Text(
                f"{status_icon} {block.agent_name} [{block.timestamp}]",
                style="bold cyan",
            )
            content.append(header)

            # 思考过程：弱化 + 缩进
            if block.thinking_lines:
                content.append(Text("  思考过程:", style="dim italic"))
                for line in block.thinking_lines[-10:]:
                    content.append(Text(f"    {line}", style="dim"))

            # 最终输出：醒目
            if block.final_output:
                content.append(Text("  📋 最终输出:", style="bold green"))
                if block.final_output.strip().startswith("{"):
                    content.append(
                        Syntax(
                            block.final_output,
                            "json",
                            theme="monokai",
                            word_wrap=True,
                        )
                    )
                else:
                    content.append(
                        Text(f"  {block.final_output[:500]}", style="white")
                    )

            content.append(Text("─" * 40, style="dim"))

        # 全局最终输出（整轮 Crew 的 result.raw）
        if self.global_output:
            content.append(Text("📋 最终输出:", style="bold green"))
            if self.global_output.strip().startswith("{"):
                content.append(
                    Syntax(
                        self.global_output,
                        "json",
                        theme="monokai",
                        word_wrap=True,
                    )
                )
            else:
                content.append(Text(self.global_output[:500], style="white"))

        return RichPanel(
            Group(*content),
            title="📋 执行回放",
            border_style="green",
            padding=(1, 2),
        )
