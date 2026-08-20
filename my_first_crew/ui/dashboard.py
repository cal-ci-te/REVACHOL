import os
import sys
import threading
from time import sleep, time
from typing import Any

from rich.console import Console
from rich.live import Live
from rich.panel import Panel

from .layout import LayoutManager
from .agent_panel import AgentPanel
from .output_panel import OutputPanel
from .stats_panel import StatsPanel
from .log_panel import LogPanel


class Dashboard:
    """主仪表盘，整合所有面板"""

    def __init__(self):
        # Windows 兼容性设置：由 Rich 自动检测终端能力，
        # 并尽量启用 VT 处理（Windows Terminal / PowerShell 7 支持）。
        self.console = Console(
            legacy_windows=True,  # 允许 Rich 使用 Win32 控制台 API 回退
            color_system="auto",
        )
        # Windows 上显式启用 VT 处理；失败则忽略（Rich 会自动降级）
        try:
            if os.name == "nt":
                self.console.enable_virtual_terminal_processing()
        except Exception:  # noqa: BLE001
            pass

        self.layout = LayoutManager(self.console)
        self.agent_panel = AgentPanel()
        self.output_panel = OutputPanel()
        self.stats_panel = StatsPanel()
        self.log_panel = LogPanel()

        self.start_time = time()
        self.is_running = False
        self.live = None
        self._live_paused = False  # prompt_toolkit 输入期间 Rich Live 是否已完全暂停
        self._live_rebuild_failed = False  # Live 重建失败标记，允许后续重试
        self.refresh_rate = 2  # 降低刷新率到 2Hz，减少闪烁

        # ---- 输入面板状态 ----
        self.input_buffer = ""
        self.input_active = True  # 是否处于输入模式（main 可按需关闭）
        self.input_callback = None  # 提交输入时的回调函数
        self.cursor_visible = True  # 光标闪烁控制
        self._cursor_timer = None  # 光标闪烁定时器
        self.debug_mode = False  # 是否打印按键调试日志（由 main 根据 --debug 设置）
        self._input_locked_message = ""  # 输入面板锁屏状态提示

        # ---- Agent 选择器数据（None 表示“显示全部”）----
        self.agent_list = ["Planner", "Coder", "Reviewer", "Document Admin", None]
        self.agent_list_display = [
            "Planner",
            "Coder",
            "Reviewer",
            "Document Admin",
            "显示全部",
        ]

    def start(self):
        """启动仪表盘"""
        self.is_running = True
        self.start_time = time()

        # 启动Live渲染，使用低刷新率
        self.live = Live(
            self.layout.get_layout(),
            console=self.console,
            refresh_per_second=self.refresh_rate,
            screen=True,
            vertical_overflow="crop",  # 裁剪溢出内容，减少绘制压力
        )
        self.live.__enter__()

        # 关键：进入备用屏幕后立即渲染首帧，避免“闪空屏后消失”
        self._render_all()
        self.live.refresh()

    def stop(self):
        """停止仪表盘"""
        self.is_running = False
        self._stop_cursor_blink()

        if self.live is not None:
            try:
                if getattr(self.live, "_started", False):
                    self.live.__exit__(None, None, None)
            except Exception:  # noqa: BLE001
                pass
            finally:
                self.live = None

        self._live_paused = False

    def pause_live(self):
        """完全暂停 Rich Live：退出备用缓冲区、销毁旧实例并释放终端控制。

        这样 prompt_toolkit 可以在普通屏幕上以原始模式读取键盘；
        恢复时通过“销毁即重生”策略完全重建，避免状态残留。
        """
        if self.live is None:
            return

        try:
            if getattr(self.live, "_started", False):
                self.live.__exit__(None, None, None)
        except Exception as exc:  # noqa: BLE001
            if self.debug_mode:
                self.log(f"[DEBUG] 暂停 Live 时退出失败: {exc}", "warning")

        self.live = None  # 清除引用，强制下次重建
        self._live_paused = True

    def resume_live(self):
        """恢复 Rich Live：完全重建 Live 实例，彻底清除渲染状态。

        核心改进：
        1. 不再尝试恢复旧 Live 实例，直接销毁重建
        2. 使用 refresh_rate（2Hz）减少终端绘制压力
        3. screen=True 失败时降级到 screen=False，再降级到静态渲染
        """
        if not getattr(self, "_live_paused", False):
            return  # 如果没有暂停过，无需恢复

        # 第一步：彻底清理旧实例
        if self.live is not None:
            try:
                if getattr(self.live, "_started", False):
                    self.live.__exit__(None, None, None)
            except Exception as exc:  # noqa: BLE001
                if self.debug_mode:
                    self.log(f"[DEBUG] 退出旧 Live 失败: {exc}", "warning")
            finally:
                self.live = None

        # 第二步：重建 Live 实例
        try:
            # 首选：使用备用屏幕（全屏模式）
            self.live = Live(
                self.layout.get_layout(),
                console=self.console,
                refresh_per_second=self.refresh_rate,
                screen=True,
                vertical_overflow="crop",
            )
            self.live.__enter__()
            self._render_all()
            self.live.refresh()
            self._live_rebuild_failed = False
            if self.debug_mode:
                self.log("[DEBUG] Live 重建成功 (screen=True)", "info")
        except Exception as exc:  # noqa: BLE001
            # 降级方案：不使用备用屏幕（兼容模式）
            if self.debug_mode:
                self.log(
                    f"[DEBUG] screen=True 模式失败: {exc}，降级到 screen=False",
                    "warning",
                )
            try:
                self.live = Live(
                    self.layout.get_layout(),
                    console=self.console,
                    refresh_per_second=self.refresh_rate,
                    screen=False,  # 不使用备用屏幕，避免 VT 兼容性问题
                    vertical_overflow="crop",
                )
                self.live.__enter__()
                self._render_all()
                self.live.refresh()
                self._live_rebuild_failed = False
                if self.debug_mode:
                    self.log("[DEBUG] Live 重建成功 (screen=False 降级)", "info")
            except Exception as exc2:  # noqa: BLE001
                # 完全降级：只更新布局但不启用 Live；标记失败，后续 update() 可重试
                self.log(f"⚠️ Live 重建完全失败，使用静态渲染: {exc2}", "error")
                self.live = None
                self._live_rebuild_failed = True
                self._render_all()
        finally:
            self._live_paused = False

    def cleanup_event_loop(self):
        """清理 asyncio 事件循环，避免退出时残留任务导致
        `cannot schedule new futures after shutdown` 错误。"""
        try:
            import asyncio

            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop is None:
                try:
                    loop = asyncio.get_event_loop_policy().get_event_loop()
                except Exception:  # noqa: BLE001
                    loop = None

            if loop is not None:
                if loop.is_running():
                    loop.stop()
                # 取消所有未完成任务
                tasks = asyncio.all_tasks(loop)
                for task in tasks:
                    task.cancel()
        except Exception:  # noqa: BLE001
            pass

    def update(self):
        """刷新所有面板"""
        # 如果之前 Live 重建失败且当前不在输入暂停中，尝试用 screen=False 复活
        if self.live is None and not self._live_paused and self._live_rebuild_failed:
            try:
                self.live = Live(
                    self.layout.get_layout(),
                    console=self.console,
                    refresh_per_second=self.refresh_rate,
                    screen=False,
                    vertical_overflow="crop",
                )
                self.live.__enter__()
                self._render_all()
                self.live.refresh()
                self._live_rebuild_failed = False
                if self.debug_mode:
                    self.log("[DEBUG] Live 通过 update() 复活 (screen=False)", "info")
            except Exception:  # noqa: BLE001
                self.live = None

        # prompt_toolkit 输入期间 Live 已完全暂停（_started=False），不向终端写入
        if self.live and getattr(self.live, "_started", False):
            self._render_all()
            self.live.refresh()

    def _render_all(self):
        """渲染所有面板"""
        elapsed = int(time() - self.start_time)
        elapsed_str = f"{elapsed//60:02d}:{elapsed%60:02d}"

        # 更新顶部栏
        self.layout.update_header(
            title="REVACHOL Crew Execution",
            subtitle="v1.19.0",
            status="⏳ Running" if self.is_running else "⏸ Paused",
            elapsed=elapsed_str,
        )

        # 更新输入面板
        self.layout.update_input_panel(self._render_input_panel())

        # 更新各面板
        self.layout.update_left_panel(self.agent_panel.render())
        self.layout.update_output_panel(self.output_panel.render())
        self.layout.update_stats_panel(self.stats_panel.render())
        self.layout.update_footer(self.log_panel.render())

    # ===== 输入面板 =====

    def _render_input_panel(self) -> Panel:
        """渲染交互式输入面板（支持锁屏状态）"""
        if not self.input_active and self._input_locked_message:
            return Panel(
                f"[bold yellow]{self._input_locked_message}[/bold yellow]",
                border_style="yellow",
                padding=(0, 2),
                height=3,
            )

        if not self.input_active:
            return Panel("", border_style="dim")

        # 光标闪烁效果
        cursor = "▌" if self.cursor_visible else " "
        display_text = self.input_buffer + cursor

        # 截断过长的输入
        if len(display_text) > 60:
            display_text = "..." + display_text[-57:]

        return Panel(
            f"[bold cyan]📝 需求:[/bold cyan] {display_text}\n"
            "[dim]按 Enter 提交 · Esc 取消 · Ctrl+C 退出 · /select Agent名 回溯[/dim]",
            border_style="bright_blue",
            padding=(0, 2),
            height=3,
        )

    def start_input_mode(self, callback) -> None:
        """进入输入模式，callback 在用户按 Enter 时被调用"""
        self.input_active = True
        self.input_buffer = ""
        self.input_callback = callback
        self._start_cursor_blink()
        self.update()

    def submit_input(self) -> None:
        """提交当前输入"""
        if self.input_buffer.strip() and self.input_callback:
            callback = self.input_callback
            content = self.input_buffer.strip()
            self.input_buffer = ""
            self.input_active = False
            self._stop_cursor_blink()
            self.update()
            callback(content)

    def cancel_input(self) -> None:
        """取消当前输入"""
        self.input_buffer = ""
        self.input_active = False
        self._stop_cursor_blink()
        self.update()

    def append_to_input(self, char: str) -> None:
        """向输入缓冲区追加字符"""
        if self.input_active:
            self.input_buffer += char
            self.update()

    def backspace_input(self) -> None:
        """删除输入缓冲区最后一个字符"""
        if self.input_active and self.input_buffer:
            self.input_buffer = self.input_buffer[:-1]
            self.update()

    def clear_input(self) -> None:
        """清空输入缓冲区"""
        if self.input_active:
            self.input_buffer = ""
            self.update()

    def lock_input(self, status_message: str = "⏳ 执行中，请稍候...") -> None:
        """锁定输入面板，显示执行状态"""
        self.input_active = False
        self._input_locked_message = status_message
        self._stop_cursor_blink()
        self.update()

    def unlock_input(self) -> None:
        """解锁输入面板，恢复输入状态"""
        self.input_active = True
        self._input_locked_message = ""
        self.update()

    def reset_for_new_session(self) -> None:
        """重置仪表盘状态，准备接受新需求"""
        self.agent_panel._init_agents()
        self.output_panel.clear()
        self.output_panel.set_task("等待输入")
        self.stats_panel.reset()
        self.input_active = True
        self.input_buffer = ""
        self._input_locked_message = ""
        self.is_running = False
        self.start_time = time()
        self.update()  # 使用 update() 而不是 _render_all()，确保重置后立即刷新

    def select_agent(self, agent_name: str | None) -> None:
        """选中 Agent，更新面板并切换输出视图"""
        self.agent_panel.select_agent(agent_name)
        if self.agent_panel.selected_agent:
            self.output_panel.show_agent_block(self.agent_panel.selected_agent)
        else:
            self.output_panel.show_all_blocks()
        self.update()

    # ===== 光标闪烁 =====

    def _start_cursor_blink(self) -> None:
        """启动光标闪烁定时器"""
        self._stop_cursor_blink()
        self.cursor_visible = True

        def _blink() -> None:
            if not self.input_active:
                return
            self.cursor_visible = not self.cursor_visible
            self.update()
            if self.input_active:
                self._cursor_timer = threading.Timer(0.5, _blink)
                self._cursor_timer.daemon = True
                self._cursor_timer.start()

        self._cursor_timer = threading.Timer(0.5, _blink)
        self._cursor_timer.daemon = True
        self._cursor_timer.start()

    def _stop_cursor_blink(self) -> None:
        """停止光标闪烁定时器"""
        if self._cursor_timer:
            self._cursor_timer.cancel()
            self._cursor_timer = None
        self.cursor_visible = True

    # ===== 对外接口 =====

    def set_agent_status(self, agent: str, status: str, task: str = "", detail: str = ""):
        """更新Agent状态"""
        self.agent_panel.update_status(agent, status, task, detail)
        self.update()

    def set_output(self, content: str, is_json: bool = False):
        """更新输出窗口"""
        self.output_panel.append(content, is_json)
        self.update()

    def set_task(self, task_name: str):
        """切换当前任务"""
        self.output_panel.set_task(task_name)
        self.update()

    def log(self, message: str, level: str = "info"):
        """添加日志"""
        self.log_panel.log(message, level)
        self.update()

    def update_stats(self, agent: str, tokens: int, cost: float = 0.0):
        """更新统计"""
        self.stats_panel.update_tokens(agent, tokens, cost)
        self.update()


def _wait_for_input_fallback(dashboard: Dashboard) -> str:
    """prompt_toolkit 不可用时的回退输入（pynput/msvcrt/普通 input）。"""
    result: list[str] = []
    submitted = threading.Event()

    def on_submit(content: str) -> None:
        result.append(content)
        submitted.set()

    def _handle_enter() -> None:
        """Enter 键：普通内容提交；/select 命令切换 Agent 输出视图"""
        content = dashboard.input_buffer.strip()
        if content.startswith("/select "):
            agent_name = content[len("/select ") :].strip()
            dashboard.select_agent(agent_name)
            dashboard.clear_input()
            if dashboard.debug_mode:
                dashboard.log(f"[DEBUG] 切换 Agent 视图: {agent_name!r}", "info")
        elif content == "/all":
            dashboard.select_agent(None)
            dashboard.clear_input()
        else:
            dashboard.submit_input()

    dashboard.start_input_mode(on_submit)

    # ---- 1) pynput ----
    try:
        import pynput  # noqa: F401
    except ImportError:
        pynput = None

    if pynput is not None:
        try:
            from pynput import keyboard

            listener = None

            def on_press(key) -> None:
                try:
                    if dashboard.debug_mode:
                        dashboard.log(f"[DEBUG] pynput 按键: key={key!r}", "info")
                    if key == keyboard.Key.enter:
                        _handle_enter()
                    elif key == keyboard.Key.esc:
                        dashboard.cancel_input()
                        submitted.set()
                    elif key == keyboard.Key.backspace:
                        dashboard.backspace_input()
                    elif hasattr(key, "char") and key.char in ("\x08", "\x7f"):
                        # 部分后端把 Backspace 上报为 KeyCode(char='\x08' / '\x7f')
                        dashboard.backspace_input()
                    elif hasattr(key, "char") and key.char and key.char.isprintable():
                        dashboard.append_to_input(key.char)
                except Exception as exc:  # noqa: BLE001
                    dashboard.log(f"键盘事件错误: {exc}", "error")

            listener = keyboard.Listener(on_press=on_press)
            listener.daemon = True
            listener.start()
            try:
                submitted.wait()
            finally:
                listener.stop()

            if result:
                return result[0]
            raise KeyboardInterrupt("用户取消输入")
        except KeyboardInterrupt:
            raise
        except Exception as exc:  # noqa: BLE001
            dashboard.log(f"pynput 键盘监听不可用，切换到备用输入方式: {exc}", "warning")
            dashboard.cancel_input()
            result.clear()
            submitted.clear()
            dashboard.start_input_mode(on_submit)

    # ---- 2) Windows msvcrt 轮询 ----
    if os.name == "nt":
        import msvcrt

        while not submitted.is_set():
            if msvcrt.kbhit():
                ch = msvcrt.getwch()
                if dashboard.debug_mode:
                    dashboard.log(
                        f"[DEBUG] 按键: ch={repr(ch)}, ord={ord(ch) if ch else 'N/A'}",
                        "info",
                    )

                # 扩展键前缀：方向键/功能键/Delete 等会返回 \xe0 或 \x00 + 第二个键码
                if ch in ("\xe0", "\x00"):
                    ch2 = msvcrt.getwch()
                    if dashboard.debug_mode:
                        dashboard.log(
                            f"[DEBUG] 扩展键: prefix={repr(ch)}, "
                            f"ch2={repr(ch2)}, ord2={ord(ch2) if ch2 else 'N/A'}",
                            "info",
                        )
                    if ch2 == "S":  # Delete 键：清空输入
                        dashboard.clear_input()
                    # 其余扩展键（方向键、Home/End 等）直接忽略，避免被当作可打印字符
                    continue

                # Backspace：\x08 (\b) 或 \x7f (DEL)
                if ord(ch) in (8, 127):
                    dashboard.backspace_input()
                elif ch in ("\r", "\n"):
                    _handle_enter()
                elif ch == "\x1b":  # Esc
                    dashboard.cancel_input()
                    raise KeyboardInterrupt("用户取消输入")
                elif ch == "\x03":  # Ctrl+C
                    dashboard.cancel_input()
                    raise KeyboardInterrupt("用户取消输入")
                elif ch.isprintable():
                    dashboard.append_to_input(ch)
                elif dashboard.debug_mode:
                    dashboard.log(f"[DEBUG] 忽略按键: {repr(ch)}", "info")
            else:
                sleep(0.05)

    # ---- 3) 最终回退：普通行输入 ----
    else:
        dashboard.log("键盘监听不可用，请在下方的普通输入行输入需求...", "warning")
        dashboard.cancel_input()
        content = input("请输入需求: ").strip()
        result.append(content)

    if not result:
        raise KeyboardInterrupt("用户取消输入")
    return result[0]


def wait_for_input(
    dashboard: Dashboard,
    _input: Any | None = None,
    _output: Any | None = None,
) -> str:
    """使用 PromptSession 实现统一的“输入框 / Agent 选择器”交互。

    - 输入框：普通文字输入、Backspace、Enter 提交需求；
      输入 `/select` 后按 Enter 切换到 Agent 列表。
    - Agent 选择：↓ 进入列表，↑/↓ 移动高亮，空格/Enter 选中，Esc 返回。
    - Ctrl+C 退出程序。

    使用 PromptSession 而非 Application，绕开 Windows 上 asyncio 事件循环
    与控制台输入的兼容性问题。

    _input/_output 仅供自动化测试注入 prompt_toolkit 的输入/输出对象。
    """
    # 防御：prompt_toolkit 缺失时回退到旧实现
    try:
        import prompt_toolkit  # noqa: F401
    except ImportError:
        return _wait_for_input_fallback(dashboard)

    from prompt_toolkit import PromptSession
    from prompt_toolkit.filters import Condition
    from prompt_toolkit.history import FileHistory
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.styles import Style

    def _debug(msg: str) -> None:
        if dashboard.debug_mode:
            print(f"[DEBUG] {msg}", file=sys.stderr)

    # 仅测试时注入 input/output；正常路径完全交给 PromptSession 默认管理，
    # 不再创建 Application / Layout / create_input，彻底绕开 asyncio 冲突。
    session_kwargs: dict[str, Any] = {
        "history": FileHistory(".input_history"),
    }
    if _input is not None:
        session_kwargs["input"] = _input
    if _output is not None:
        session_kwargs["output"] = _output

    # 状态
    agent_mode = [False]       # True 表示当前处于 Agent 选择模式
    selected_idx = [0]         # Agent 列表高亮位置

    agent_mode_filter = Condition(lambda: agent_mode[0])

    def _toolbar() -> str:
        """PromptSession 底部工具栏：输入提示 / Agent 选择列表。"""
        if agent_mode[0]:
            lines = ["🤖 选择 Agent（↑/↓ 移动，空格/Enter 确认，Esc 返回）"]
            for idx, (agent, display) in enumerate(
                zip(
                    dashboard.agent_list,
                    dashboard.agent_list_display,
                    strict=True,
                )
            ):
                del agent
                marker = "▶" if idx == selected_idx[0] else " "
                lines.append(f"  {marker} {display}")
            return "\n".join(lines)
        return "📝 输入需求 · ↓ 切换 Agent 列表 · Esc 清空 · Ctrl+C 退出"

    style = Style.from_dict(
        {
            "bottom-toolbar": "bg:#222222 #ffffff",
            "": "",
        }
    )

    kb = KeyBindings()

    def _select_current_agent(event) -> None:
        agent = dashboard.agent_list[selected_idx[0]]
        _debug(f"Select agent: {agent!r}")
        dashboard.select_agent(agent)
        agent_mode[0] = False
        event.app.invalidate()

    @kb.add("c-c")
    def _ctrl_c(event) -> None:
        _debug("Ctrl+C -> exit")
        raise KeyboardInterrupt("用户取消输入")

    @kb.add("escape")
    def _esc(event) -> None:
        if agent_mode[0]:
            _debug("Esc from list -> input")
            agent_mode[0] = False
        else:
            _debug("Esc in input -> clear")
            event.app.current_buffer.reset()
        event.app.invalidate()

    @kb.add("down")
    def _down(event) -> None:
        if not agent_mode[0]:
            _debug("Down from input -> agent list")
            agent_mode[0] = True
            selected_idx[0] = 0
        elif selected_idx[0] < len(dashboard.agent_list) - 1:
            selected_idx[0] += 1
            _debug(f"Down in list -> index {selected_idx[0]}")
        event.app.invalidate()

    @kb.add("up", filter=agent_mode_filter)
    def _up(event) -> None:
        if selected_idx[0] > 0:
            selected_idx[0] -= 1
            _debug(f"Up in list -> index {selected_idx[0]}")
        else:
            _debug("Up at first -> back to input")
            agent_mode[0] = False
        event.app.invalidate()

    @kb.add("space", filter=agent_mode_filter)
    def _space(event) -> None:
        _select_current_agent(event)

    @kb.add("enter")
    def _enter(event) -> None:
        if agent_mode[0]:
            _debug("Enter in list -> select")
            _select_current_agent(event)
            return

        text = event.app.current_buffer.text.strip()
        _debug(f"Enter in input: {text!r}")
        if text.startswith("/select"):
            _debug("/select -> agent list")
            agent_mode[0] = True
            selected_idx[0] = 0
            event.app.current_buffer.reset()
            event.app.invalidate()
            return

        # 正常提交：触发 PromptSession 的 accept 流程
        event.app.current_buffer.validate_and_handle()

    session = PromptSession(
        key_bindings=kb,
        style=style,
        bottom_toolbar=_toolbar,
        refresh_interval=0.05,
        **session_kwargs,
    )

    dashboard.input_active = True
    dashboard.pause_live()
    try:
        _debug("session.prompt() 开始")
        result = session.prompt("📝 需求: ")
        _debug(f"session.prompt() 返回: {result!r}")
    except KeyboardInterrupt:
        raise
    except Exception as exc:  # noqa: BLE001
        # Windows 下 PromptSession 运行失败时回退到 msvcrt 轮询
        if os.name == "nt":
            dashboard.log(
                f"PromptSession 运行失败，回退到 msvcrt: {exc}", "warning"
            )
            dashboard.resume_live()
            return _wait_for_input_fallback(dashboard)
        raise
    finally:
        dashboard.resume_live()  # 重新进入 Rich Live 备用缓冲区

    if result is not None:
        dashboard.input_buffer = result
        dashboard.input_active = False
        return result
    raise KeyboardInterrupt("用户取消输入")
