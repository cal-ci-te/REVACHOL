/**
 * 贴纸编辑器 — 主控（状态驻留 + 生命周期 + 组装子模块）。
 *
 * 入口：StickerEditorMode.open(articleData, cursorY)
 * 关闭：StickerEditorMode.close(save)
 *
 * @module sticker-editor/index
 */

import { DecoShelf } from '../../services/deco.js';
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { Utils } from '../../utils.js';
import { UI } from '../../utils/ui-strings.js';

import { Overlay } from './overlay.js';
import { Stickers } from './stickers.js';
import { Console } from './console.js';
import { Toolbar } from './toolbar.js';
import { Keys } from './keys.js';
import { Save } from './save.js';

export const StickerEditorMode = {

  // ---- 状态 ----

  _article: null,
  _stickerData: [],
  _snapshot: null,

  _overlay: null,
  _articleContainer: null,
  _stickerLayer: null,
  _toolbar: null,
  _consoleEl: null,

  _visible: false,
  _escUnbind: null,

  // =========================================================================
  //  入口
  // =========================================================================

  async open(article, cursorY) {
    if (this._visible) return;

    // 移动端禁用
    if (window.innerWidth <= 768) {
      Utils.showToast(UI.stickerEditor.mobileWarning || '贴纸编辑功能仅支持桌面端', true);
      return;
    }

    this._article = article;

    // 加载贴纸库
    var decos = DecoShelf.getAll();
    if (!decos || !decos.length) {
      try { await DecoShelf.loadLibrary(); } catch (e) { console.warn("[StickerEditorMode] 贴纸库加载失败:", e); Utils.showToast(UI.stickerEditor.emptyLibrary || "贴纸库加载失败，请检查网络连接", true); }
    }

    // 快照
    this._snapshot = article.stickers ? JSON.parse(JSON.stringify(article.stickers)) : [];
    this._stickerData = article.stickers ? JSON.parse(JSON.stringify(article.stickers)) : [];

    // 构建 UI（按依赖顺序）
    var dom = Overlay.create();
    this._overlay = dom.overlay;
    this._articleContainer = dom.articleContainer;
    this._stickerLayer = dom.stickerLayer;

    // 空白区点击关闭
    var self = this;
    this._overlay._onBlankClick = function () { self.close(false); };

    Overlay.renderArticle(article, this._articleContainer);
    Overlay.showCursorHighlight(this._articleContainer, cursorY);

    // 构建贴纸交互 ctx
    var stickerCtx = this._buildStickerCtx();
    Stickers.render(stickerCtx);

    // 工具栏
    this._toolbar = Toolbar.create({ close: function (save) { self.close(save); } });

    // 控制台
    this._consoleEl = Console.create(this._buildConsoleCtx());

    // 键盘（注入 removeContextMenu）
    this._escUnbind = Keys.bind({
      close: function (save) { self.close(save); },
      removeContextMenu: function () { Stickers.removeContextMenu(); },
    });

    this._visible = true;
    document.body.style.overflow = 'hidden';

    EventBus.emit(EVENTS.STICKER_EDITOR_OPENED, { articleId: article.id });
  },

  close(save) {
    if (!this._visible) return;

    if (save) {
      Save.save(this._article, this._stickerLayer, this._stickerData);
    } else {
      this._stickerData = this._snapshot ? JSON.parse(JSON.stringify(this._snapshot)) : [];
    }

    this._cleanup();

    EventBus.emit(EVENTS.STICKER_EDITOR_CLOSED, {
      articleId: this._article ? this._article.id : null,
      saved: save,
      stickers: save ? this._stickerData : null,
    });

    this._visible = false;
  },

  isVisible() { return this._visible; },
  getStickerData() { return this._stickerData ? this._stickerData.slice() : []; },

  // =========================================================================
  //  ctx 构建
  // =========================================================================

  _buildStickerCtx() {
    var self = this;
    return {
      stickerLayer: self._stickerLayer,
      stickerData: self._stickerData,
      articleContainer: self._articleContainer,
      onDataChange: function (newData) { self._stickerData = newData; },
      onRefreshConsole: function () { Console.refresh(self._buildConsoleCtx()); },
    };
  },

  _buildConsoleCtx() {
    var self = this;
    return {
      stickerLayer: self._stickerLayer,
      stickerData: self._stickerData,
      articleContainer: self._articleContainer,
      stickersModule: Stickers,
      onDataChange: function (newData) { self._stickerData = newData; },
      onRefreshConsole: function () { Console.refresh(self._buildConsoleCtx()); },
    };
  },

  // =========================================================================
  //  清理
  // =========================================================================

  _cleanup() {
    // 键盘事件
    if (this._escUnbind) {
      this._escUnbind();
      this._escUnbind = null;
    }

    // 工具栏
    Toolbar.destroy(this._toolbar);
    this._toolbar = null;

    // 控制台
    Console.destroy(this._consoleEl);
    this._consoleEl = null;

    // 右键菜单
    Stickers.removeContextMenu();

    // 贴纸元素监听器（在 DOM 移除前显式解绑）
    Stickers.unbindAll(this._stickerLayer);

    // 覆盖层
    Overlay.destroy(this._overlay);
    this._overlay = null;
    this._articleContainer = null;
    this._stickerLayer = null;

    // 恢复滚动
    document.body.style.overflow = '';

    // 重置状态
    this._article = null;
    this._stickerData = [];
    this._snapshot = null;
  },
};

export default StickerEditorMode;
