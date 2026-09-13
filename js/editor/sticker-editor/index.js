// ！贴纸编辑器主控
// 贴纸编辑模式的状态驻留与生命周期编排，入口 StickerEditorMode.open(articleData, cursorY)，关闭 close(save)。
// 覆盖层、贴纸交互、控制台、工具栏与快捷键各由子模块承担，本模块只做组装与状态持有。
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

  // 状态

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

  // 入口

  // 打开贴纸编辑器
  // 贴纸库加载失败只提示不中断：库可能已在别处加载过，且空库时编辑器仍可展示已有贴纸
  async open(article, cursorY) {
    if (this._visible) return;

    if (window.innerWidth <= 768) {
      Utils.showToast(UI.stickerEditor.mobileWarning || '贴纸编辑功能仅支持桌面端', true);
      return;
    }

    this._article = article;

    const decos = DecoShelf.getAll();
    if (!decos || !decos.length) {
      try { await DecoShelf.loadLibrary(); } catch (e) { console.warn("[StickerEditorMode] 贴纸库加载失败:", e); Utils.showToast(UI.stickerEditor.emptyLibrary || "贴纸库加载失败，请检查网络连接", true); }
    }

    // 快照与工作副本各持一份深拷贝：取消时用快照还原，避免就地改动污染原始数据
    this._snapshot = article.stickers ? JSON.parse(JSON.stringify(article.stickers)) : [];
    this._stickerData = article.stickers ? JSON.parse(JSON.stringify(article.stickers)) : [];

    // 按依赖顺序构建：先容器，再内容，最后交互层
    const dom = Overlay.create();
    this._overlay = dom.overlay;
    this._articleContainer = dom.articleContainer;
    this._stickerLayer = dom.stickerLayer;

    // 空白区点击关闭的回调由主控注入：Overlay 不持有状态，避免反向依赖
    const self = this;
    this._overlay._onBlankClick = function () { self.close(false); };

    Overlay.renderArticle(article, this._articleContainer);
    Overlay.showCursorHighlight(this._articleContainer, cursorY);

    const stickerCtx = this._buildStickerCtx();
    Stickers.render(stickerCtx);

    this._toolbar = Toolbar.create({ close: function (save) { self.close(save); } });

    this._consoleEl = Console.create(this._buildConsoleCtx());

    this._escUnbind = Keys.bind({
      close: function (save) { self.close(save); },
      removeContextMenu: function () { Stickers.removeContextMenu(); },
    });

    this._visible = true;
    document.body.style.overflow = 'hidden';

    EventBus.emit(EVENTS.STICKER_EDITOR_OPENED, { articleId: article.id });
  },

  // 关闭贴纸编辑器
  // save 为 false 时用快照还原工作副本，再统一走清理
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
      // 未保存时不发布贴纸数据：订阅方据此区分「已确认」与「已放弃」
      stickers: save ? this._stickerData : null,
    });

    this._visible = false;
  },

  isVisible() { return this._visible; },
  // 返回副本而非内部数组：防止调用方改动绕过 onDataChange 而不同步 DOM
  getStickerData() { return this._stickerData ? this._stickerData.slice() : []; },

  // ctx 构建

  // 构建贴纸交互上下文
  // onDataChange 只在贴纸模块改数据时回写，保持主控为唯一数据持有者
  _buildStickerCtx() {
    const self = this;
    return {
      stickerLayer: self._stickerLayer,
      stickerData: self._stickerData,
      articleContainer: self._articleContainer,
      onDataChange: function (newData) { self._stickerData = newData; },
      onRefreshConsole: function () { Console.refresh(self._buildConsoleCtx()); },
    };
  },

  // 构建控制台上下文
  // 比贴纸 ctx 多传 stickersModule：控制台需要调用贴纸模块的 API 做增删
  _buildConsoleCtx() {
    const self = this;
    return {
      stickerLayer: self._stickerLayer,
      stickerData: self._stickerData,
      articleContainer: self._articleContainer,
      stickersModule: Stickers,
      onDataChange: function (newData) { self._stickerData = newData; },
      onRefreshConsole: function () { Console.refresh(self._buildConsoleCtx()); },
    };
  },

  // 清理

  // 拆解编辑会话
  // 顺序有依赖：先摘事件监听再移 DOM，最后清引用；否则回调可能落在已移除的节点上
  _cleanup() {
    if (this._escUnbind) {
      this._escUnbind();
      this._escUnbind = null;
    }

    Toolbar.destroy(this._toolbar);
    this._toolbar = null;

    Console.destroy(this._consoleEl);
    this._consoleEl = null;

    Stickers.removeContextMenu();

    // 在 DOM 移除前显式解绑贴纸事件：节点一旦脱离文档，引用收集会变困难
    Stickers.unbindAll(this._stickerLayer);

    Overlay.destroy(this._overlay);
    this._overlay = null;
    this._articleContainer = null;
    this._stickerLayer = null;

    // 恢复页面滚动：打开时锁定了 body，遗漏此处会导致关闭后无法滚动
    document.body.style.overflow = '';

    this._article = null;
    this._stickerData = [];
    this._snapshot = null;
  },
};

export default StickerEditorMode;
