// ！贴纸编辑器控制台
// 右下角的贴纸库面板：可拖拽、可折叠，列出全部贴纸并支持点击添加到画布。
// 已放置的贴纸置灰并禁止再次点击，避免同一贴纸被重复添加。
import { DecoShelf } from '../../services/deco.js';
import { UI } from '../../utils/ui-strings.js';

export const Console = {

  // 创建右下角贴纸库面板
  // 复用 .admin-panel / .panel-header / .panel-content 既有样式，不引入新 CSS
  // 位置以 right/bottom 记录：面板贴右下角，用这两者描述可让面板尺寸变化时保持右下角不动
  create(ctx) {
    const self = this;

    const panel = document.createElement('div');
    panel.className = 'admin-panel open';
    panel.id = 'sticker-console-panel';
    panel.style.cssText = 'width:280px;z-index:10000;display:block;';

    const savedPos = this._loadPos();
    panel.style.right = (savedPos.right || 20) + 'px';
    panel.style.bottom = (savedPos.bottom || 80) + 'px';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.style.cursor = 'grab';
    header.innerHTML = '<h4>' + (UI.stickerEditor.consoleTitle || '📚 贴纸库') + '</h4>' +
      '<span class="toggle-icon" id="stickerConsoleToggle">▶</span>';

    const content = document.createElement('div');
    content.className = 'panel-content';
    content.id = 'sticker-console-content';
    content.style.maxHeight = '320px';
    content.style.overflowY = 'auto';

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);

    this._bindDrag(panel, header, function (r, b) { self._savePos(r, b); });

    // 折叠/展开：靠 .collapsed 类收起面板，按钮文案相应翻转指示方向
    let collapsed = false;
    document.getElementById('stickerConsoleToggle').addEventListener('click', function (e) {
      e.stopPropagation();
      collapsed = !collapsed;
      if (collapsed) {
        panel.classList.add('collapsed');
        header.querySelector('.toggle-icon').textContent = '◀';
      } else {
        panel.classList.remove('collapsed');
        header.querySelector('.toggle-icon').textContent = '▶';
      }
    });

    this._refresh(ctx);

    return panel;
  },

  // 刷新贴纸库列表（对外入口）
  refresh(ctx) {
    this._refresh(ctx);
  },

  // 内部实现

  // 重建贴纸库列表
  // 整体重建而非增量更新：列表项状态（已放置/可点击）随画布变化，重建逻辑最简单且不会残留旧状态
  _refresh(ctx) {
    const content = document.getElementById('sticker-console-content');
    if (!content) return;

    const allDecos = DecoShelf.getAll() || [];
    // 用 Set 记录已放置的 decoId：列表项逐个判断时比在数组里反复查找更省
    const placedIds = new Set((ctx.stickerData || []).map(function (s) { return s.decoId; }));
    const self = this;

    content.innerHTML = '';

    if (!allDecos.length) {
      content.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:12px;">' +
        (UI.stickerEditor.emptyLibrary || '贴纸库为空，请先在管理面板上传贴纸') + '</div>';
      return;
    }

    allDecos.forEach(function (deco) {
      const isPlaced = placedIds.has(deco.id);

      // 已放置项置灰：视觉上区分「可用」与「已在画布上」，同时配合下方不挂点击事件
      const item = document.createElement('div');
      item.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:8px 10px', 'margin-bottom:4px',
        'border-radius:4px', 'cursor:' + (isPlaced ? 'default' : 'pointer'),
        'border:1px solid ' + (isPlaced ? 'var(--color-accent)' : 'transparent'),
        'background:' + (isPlaced ? 'var(--color-active, rgba(196,122,68,0.15))' : 'none'),
        'opacity:' + (isPlaced ? '0.7' : '1'),
      ].join(';');

      const thumb = document.createElement('div');
      thumb.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:4px', 'flex-shrink:0',
        'background-image:url(' + (deco.dataUrl || deco.url || '') + ')',
        'background-size:contain', 'background-repeat:no-repeat',
        'background-position:center',
        'background-color:var(--color-bg-primary)',
      ].join(';');
      item.appendChild(thumb);

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      // 名称超长手工截断：面板宽度固定，靠省略号不如定长截断可控
      let name = deco.name || '未命名';
      if (name.length > 16) name = name.slice(0, 14) + '..';
      info.innerHTML = '<div style="color:var(--color-text-accent);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        name + '</div>' +
        (isPlaced ? '<div style="color:var(--color-accent);font-size:11px;">✅ ' +
          (UI.stickerEditor.placedLabel || '已放置') + '</div>' : '');
      item.appendChild(info);

      // 仅未放置项可点击添加，并绑 hover 高亮提示可交互
      if (!isPlaced) {
        item.addEventListener('click', function () {
          ctx.stickersModule.addOne(ctx, deco);
        });
        item.addEventListener('mouseenter', function () {
          item.style.background = 'var(--color-hover, rgba(90,62,43,0.4))';
        });
        item.addEventListener('mouseleave', function () {
          item.style.background = 'none';
        });
      }

      content.appendChild(item);
    });
  },

  // 面板拖拽
  // 移动范围夹在视口内减去 50px，保证标题栏始终留有可抓取区域
  // 拖拽期间关闭过渡，避免面板滞后于光标
  _bindDrag(panel, header, onSave) {
    header.addEventListener('mousedown', function (e) {
      // 点折叠图标时不进入拖拽，否则点击会被拖拽逻辑吞掉
      if (e.target.closest('.toggle-icon')) return;
      e.preventDefault();

      const rect = panel.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      panel.style.transition = 'none';

      const onMove = function (ev) {
        let newRight = window.innerWidth - (ev.clientX - offsetX + rect.width);
        let newBottom = window.innerHeight - (ev.clientY - offsetY + rect.height);
        newRight = Math.max(0, Math.min(newRight, window.innerWidth - 50));
        newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - 50));
        panel.style.right = newRight + 'px';
        panel.style.bottom = newBottom + 'px';
        // 清掉 left/top：与 right/bottom 同时存在时定位结果不可预期
        panel.style.left = 'auto';
        panel.style.top = 'auto';
      };

      const onUp = function () {
        panel.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        if (onSave) onSave(parseFloat(panel.style.right) || 20, parseFloat(panel.style.bottom) || 80);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  // 保存面板位置，localStorage 不可用时静默忽略
  _savePos(right, bottom) {
    try {
      localStorage.setItem('sticker_console_pos', JSON.stringify({ right: right, bottom: bottom }));
    } catch (e) {
      // 存储不可用，位置不持久化
    }
  },

  // 读取面板位置，解析失败回落默认值
  _loadPos() {
    try {
      const s = localStorage.getItem('sticker_console_pos');
      return s ? JSON.parse(s) : { right: 20, bottom: 80 };
    } catch (e) { return { right: 20, bottom: 80 }; }
  },

  destroy(panel) {
    if (panel) panel.remove();
  },
};
