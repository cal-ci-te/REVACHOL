# ！执行回放面板
# 右上栏，按 Agent/Task 记录思考链与最终输出，便于事后回溯执行过程。
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
    # 取值仅 running / done / failed 三种
    status: str
    thinking_lines: List[str] = field(default_factory=list)
    final_output: Optional[str] = None
    timestamp: str = field(
        default_factory=lambda: datetime.now().strftime("%H:%M:%S")
    )


class OutputPanel:
    """右上输出窗口：按 Agent/Task 记录思考链与最终输出，支持回溯。"""

    # max_blocks 限制保留的块数，超出即从头部丢弃最旧的块
    def __init__(self, max_blocks: int = 20):
        self.blocks: List[AgentOutputBlock] = []
        self.current_block: Optional[AgentOutputBlock] = None
        self.max_blocks = max_blocks
        self.filter_agent: Optional[str] = None
        self.current_task = ""
        self.global_output = ""

    # 重置全部可变态，使同一实例可继续服务下一轮
    def clear(self):
        """清空所有历史块与全局输出"""
        self.blocks = []
        self.current_block = None
        self.filter_agent = None
        self.current_task = ""
        self.global_output = ""

    # 只切换任务标签而不清空历史块，便于跨任务回溯
    def set_task(self, task_name: str):
        """切换当前任务标签（不清空历史块）"""
        self.current_task = task_name

    # 块数超限时截断列表尾部保留最新的 max_blocks 个
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

    # 仅在存在当前块时记录，避免无归属的思考内容污染历史
    def append_thought(self, thought: str):
        """追加一条思考/推理内容到当前输出块"""
        if self.current_block and thought:
            self.current_block.thinking_lines.append(thought)

    # 收尾时清空 current_block，使后续 append 自动落到全局输出
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

    # 只保留指定 Agent 的块，用于聚焦单个 Agent 的回放
    def show_agent_block(self, agent_name: str):
        """只显示指定 Agent 的输出块"""
        self.filter_agent = agent_name

    # 清除 Agent 过滤，回到全量视图
    def show_all_blocks(self):
        """显示所有输出块"""
        self.filter_agent = None

    def render(self) -> RichPanel:
        """渲染输出窗口：思考过程弱化，最终输出醒目"""
        blocks = self.blocks
        if self.filter_agent:
            blocks = [b for b in blocks if b.agent_name == self.filter_agent]

        # 空态占位：既无块也无全局输出时给一行提示，保持面板高度稳定
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
                # 只展示最近 10 条思考：面板高度有限，更早的过程已无参考价值
                for line in block.thinking_lines[-10:]:
                    content.append(Text(f"    {line}", style="dim"))

            # 最终输出：醒目
            if block.final_output:
                content.append(Text("  📋 最终输出:", style="bold green"))
                # 形如 JSON 的正文改用语法高亮，其余按纯文本渲染
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
                    # 截断到 500 字符：避免超长输出撑爆固定高度的面板
                    content.append(
                        Text(f"  {block.final_output[:500]}", style="white")
                    )

            content.append(Text("─" * 40, style="dim"))

        # 全局最终输出（整轮 Crew 的 result.raw）
        if self.global_output:
            content.append(Text("📋 最终输出:", style="bold green"))
            # 同上：整轮 Crew 的输出也按 JSON / 纯文本分流
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
