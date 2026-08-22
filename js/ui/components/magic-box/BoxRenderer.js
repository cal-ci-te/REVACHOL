// 超现实箱子渲染层 — DOM 创建、3D 动画序列控制、计数器更新、双部件自定义贴图。
// 箱盖和箱体各自拥有独立的贴图层，贴图层嵌入对应父元素内，随 3D 变换联动。
import { UI } from '../../../utils/ui-strings.js';
const DELAY = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TIMING = {
  OPEN: 400,
  ITEM_POP: 600,
  SHOW: 1500,
  ITEM_RETRACT: 400,
  CLOSE: 400,
};

export class BoxRenderer {
  constructor(state, options = {}) {
    this._state = state;
    this._defaultRight = options.defaultRight || 30;
    this._defaultBottom = options.defaultBottom || 30;

    this._container = null;
    this._boxEl = null;
    this._lidEl = null;
    this._bodyEl = null;
    this._itemEl = null;
    this._itemEmojiEl = null;
    this._itemImgEl = null;
    this._itemLabelEl = null;
    this._itemMessageEl = null;
    this._countEl = null;
    this._customLidImgEl = null;
    this._customBodyImgEl = null;
    this._lidTopEl = null;
    this._hingeEl = null;
    this._lockEl = null;

    this._isAnimating = false;
    this._flyTimer = null;
  }

  get isAnimating() { return this._isAnimating; }

  // ======================
  //  DOM 创建
  // ======================

  mount() {
    if (this._container) return;

    // 容器
    const container = document.createElement('div');
    container.className = 'magic-box-container';
    container.id = 'magicBox';

    const box = document.createElement('div');
    box.className = 'magic-box';

    // ---- 箱盖（内嵌自定义贴图层 + CSS 外观层）----
    const lid = document.createElement('div');
    lid.className = 'magic-box-lid';

    const lidImg = document.createElement('div');
    lidImg.className = 'magic-box-lid-custom-img';
    lid.appendChild(lidImg);

    const lidTop = document.createElement('div');
    lidTop.className = 'magic-box-lid-top';
    lid.appendChild(lidTop);

    const hinge = document.createElement('div');
    hinge.className = 'magic-box-hinge';
    lid.appendChild(hinge);

    box.appendChild(lid);

    // ---- 箱体（内嵌自定义贴图层 + CSS 外观层）----
    const body = document.createElement('div');
    body.className = 'magic-box-body';

    const bodyImg = document.createElement('div');
    bodyImg.className = 'magic-box-body-custom-img';
    body.appendChild(bodyImg);

    const lock = document.createElement('div');
    lock.className = 'magic-box-lock';
    body.appendChild(lock);

    box.appendChild(body);

    // ---- 物品展示区 ----
    const item = document.createElement('div');
    item.className = 'magic-box-item';
    const emojiEl = document.createElement('span');
    emojiEl.className = 'magic-box-item-emoji';
    const imgEl = document.createElement('img');
    imgEl.className = 'magic-box-item-img';
    imgEl.style.display = 'none';
    const labelEl = document.createElement('span');
    labelEl.className = 'magic-box-item-label';
    const msgEl = document.createElement('span');
    msgEl.className = 'magic-box-item-message';
    item.appendChild(emojiEl);
    item.appendChild(imgEl);
    item.appendChild(labelEl);
    item.appendChild(msgEl);
    box.appendChild(item);

    // ---- 计数器 ----
    const count = document.createElement('div');
    count.className = 'magic-box-count';
    box.appendChild(count);

    container.appendChild(box);

    if (document.body) {
      document.body.appendChild(container);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.body.appendChild(container);
      });
    }

    this._container = container;
    this._boxEl = box;
    this._lidEl = lid;
    this._bodyEl = body;
    this._itemEl = item;
    this._itemEmojiEl = emojiEl;
    this._itemImgEl = imgEl;
    this._itemLabelEl = labelEl;
    this._itemMessageEl = msgEl;
    this._countEl = count;
    this._customLidImgEl = lidImg;
    this._customBodyImgEl = bodyImg;
    this._lidTopEl = lidTop;
    this._hingeEl = hinge;
    this._lockEl = lock;

    this._applyInitialPosition();
    this._applyCustomImages();
    this._updateCountDisplay();
  }

  getElement() {
    return this._container;
  }

  // ======================
  //  位置管理
  // ======================

  _applyInitialPosition() {
    if (!this._container) return;
    const x = this._state.getDefaultX();
    const y = this._state.getDefaultY();
    if (x !== null && y !== null) {
      this._container.style.left = x + 'px';
      this._container.style.top = y + 'px';
      this._container.style.right = 'auto';
      this._container.style.bottom = 'auto';
    }
  }

  moveTo(left, top) {
    if (!this._container) return;
    this._container.style.transition = 'none';
    this._container.style.left = left + 'px';
    this._container.style.top = top + 'px';
    this._container.style.right = 'auto';
    this._container.style.bottom = 'auto';
  }

  getCurrentPosition() {
    if (!this._container) return { left: 0, top: 0 };
    const rect = this._container.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }

  _getDefaultLeftTop() {
    if (!this._container) return { left: 0, top: 0 };
    const w = this._container.offsetWidth || 120;
    const h = this._container.offsetHeight || 100;
    return {
      left: window.innerWidth - w - this._defaultRight,
      top: window.innerHeight - h - this._defaultBottom,
    };
  }

  flyToDefault(duration = 500) {
    if (!this._container) return;
    const self = this;

    let targetLeft, targetTop;
    if (this._state.hasCustomPosition()) {
      targetLeft = this._state.getDefaultX();
      targetTop = this._state.getDefaultY();
    } else {
      const def = this._getDefaultLeftTop();
      targetLeft = def.left;
      targetTop = def.top;
    }

    this._isAnimating = true;
    this._container.style.transition = `left ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1), top ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
    this._container.style.left = targetLeft + 'px';
    this._container.style.top = targetTop + 'px';
    this._container.style.right = 'auto';
    this._container.style.bottom = 'auto';

    if (this._flyTimer) clearTimeout(this._flyTimer);
    this._flyTimer = setTimeout(function () {
      self._container.style.transition = '';
      self._isAnimating = false;
      self._flyTimer = null;
    }, duration);
  }

  // ======================
  //  开箱动画序列
  // ======================

  async playOpenSequence(item) {
    if (!this._boxEl || this._isAnimating) return;
    this._isAnimating = true;

    const customItemImg = this._state.getItemImage(item.id);

    if (customItemImg && this._itemImgEl) {
      this._itemImgEl.src = customItemImg;
      this._itemImgEl.style.display = '';
      this._itemEmojiEl.style.display = 'none';
    } else {
      this._itemEmojiEl.textContent = item.emoji;
      this._itemEmojiEl.style.display = '';
      if (this._itemImgEl) this._itemImgEl.style.display = 'none';
    }
    this._itemLabelEl.textContent = item.label;
    this._itemMessageEl.textContent = item.message;

    this._boxEl.classList.add('opening');
    await DELAY(TIMING.OPEN);

    this._itemEl.classList.add('popping');
    await DELAY(TIMING.ITEM_POP);

    this._itemEl.classList.remove('popping');
    this._itemEl.classList.add('showing');
    await DELAY(TIMING.SHOW);

    this._itemEl.classList.remove('showing');
    this._itemEl.classList.add('retracting');
    await DELAY(TIMING.ITEM_RETRACT);

    this._itemEl.classList.remove('retracting');
    this._boxEl.classList.remove('opening');
    this._boxEl.classList.add('closing');
    await DELAY(TIMING.CLOSE);
    this._boxEl.classList.remove('closing');

    this._itemEmojiEl.textContent = '';
    this._itemEmojiEl.style.display = '';
    if (this._itemImgEl) {
      this._itemImgEl.src = '';
      this._itemImgEl.style.display = 'none';
    }
    this._itemLabelEl.textContent = '';
    this._itemMessageEl.textContent = '';

    this._isAnimating = false;
  }

  // ======================
  //  计数器
  // ======================

  _updateCountDisplay() {
    if (!this._countEl) return;
    this._countEl.textContent = UI.magicBox.countFormat(this._state.getCount());
  }

  refreshCount() {
    this._updateCountDisplay();
  }

  // ======================
  //  自定义贴图（箱盖+箱体双部件）
  // ======================

  /** 应用箱盖和箱体的自定义贴图：有贴图则显示贴图层并隐藏对应 CSS 装饰，无则恢复 */
  _applyCustomImages() {
    const lidImg = this._state.getCustomLidImage();
    if (lidImg && this._customLidImgEl) {
      this._customLidImgEl.style.backgroundImage = 'url(' + lidImg + ')';
      this._customLidImgEl.style.display = '';
      if (this._lidTopEl) this._lidTopEl.style.opacity = '0';
      if (this._hingeEl) this._hingeEl.style.opacity = '0';
    } else if (this._customLidImgEl) {
      this._customLidImgEl.style.backgroundImage = '';
      this._customLidImgEl.style.display = 'none';
      if (this._lidTopEl) this._lidTopEl.style.opacity = '';
      if (this._hingeEl) this._hingeEl.style.opacity = '';
    }

    // 箱体贴图
    const bodyImg = this._state.getCustomBodyImage();
    if (bodyImg && this._customBodyImgEl) {
      this._customBodyImgEl.style.backgroundImage = 'url(' + bodyImg + ')';
      this._customBodyImgEl.style.display = '';
      if (this._lockEl) this._lockEl.style.opacity = '0';
    } else if (this._customBodyImgEl) {
      this._customBodyImgEl.style.backgroundImage = '';
      this._customBodyImgEl.style.display = 'none';
      if (this._lockEl) this._lockEl.style.opacity = '';
    }
  }

  /** 公共包装：刷新箱盖/箱体自定义贴图（供 BoxManager 外部覆盖调用） */
  applyCustomImages() {
    this._applyCustomImages();
  }

  /** 若物品当前正在展示，则即时更新其图片源（供图标包外部覆盖调用） */
  refreshItemImage(itemId) {
    if (!this._itemImgEl || !this._itemEl || !itemId) return;
    // 仅在动画进行中（popping/showing/retracting）才更新 DOM，避免无谓开销
    if (!this._boxEl || !(this._boxEl.classList.contains('opening') || this._boxEl.classList.contains('closing'))) return;
    const img = this._state.getItemImage(itemId);
    if (img) {
      this._itemImgEl.src = img;
      this._itemImgEl.style.display = '';
      this._itemEmojiEl.style.display = 'none';
    } else {
      this._itemImgEl.src = '';
      this._itemImgEl.style.display = 'none';
      this._itemEmojiEl.style.display = '';
    }
  }

  setCustomLidImage(dataUrl) {
    this._state.setCustomLidImage(dataUrl);
    this._applyCustomImages();
  }

  setCustomBodyImage(dataUrl) {
    this._state.setCustomBodyImage(dataUrl);
    this._applyCustomImages();
  }

  // ======================
  //  拖拽状态
  // ======================

  setGrabbing(active) {
    if (!this._boxEl) return;
    if (active) {
      this._boxEl.classList.add('grabbing');
    } else {
      this._boxEl.classList.remove('grabbing');
    }
  }

  setAdminHint(active) {
    if (!this._boxEl) return;
    if (active) {
      this._boxEl.classList.add('admin-drag');
    } else {
      this._boxEl.classList.remove('admin-drag');
    }
  }

  destroy() {
    if (this._flyTimer) {
      clearTimeout(this._flyTimer);
      this._flyTimer = null;
    }
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this._boxEl = null;
    this._lidEl = null;
    this._bodyEl = null;
    this._itemEl = null;
    this._itemEmojiEl = null;
    this._itemImgEl = null;
    this._itemLabelEl = null;
    this._itemMessageEl = null;
    this._countEl = null;
    this._customLidImgEl = null;
    this._customBodyImgEl = null;
    this._lidTopEl = null;
    this._hingeEl = null;
    this._lockEl = null;
  }
}
