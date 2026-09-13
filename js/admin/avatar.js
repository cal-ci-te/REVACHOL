// ！头像裁剪
// 通用图片裁剪组件：头像（1:1）与拼图自定义（8:3）共用同一套裁剪 UI 与坐标换算。
// 裁剪框支持四角缩放与整体拖动，确认后按指定宽高比与输出宽度导出图片。
import { DOMRefs } from '../core/dom-refs.js';
import { Utils } from '../utils.js';
import { CONFIG } from '../config.js';
import { UI } from '../utils/ui-strings.js';

export const AdminAvatar = {
  originalImage: null,
  // 裁剪确认后的回调 (dataUrl) => void，为空时回落到头像保存流程
  _cropCallback: null,
  _cropCancelCallback: null,
  // 裁剪框宽高比：1 为正方形头像，8/3 为拼图
  _cropAspectRatio: 1,
  // 输出图片宽度，高度按宽高比推算
  _outputWidth: 200,
  // 选区同时记录显示坐标与原始尺寸：绘制用显示坐标，导出需按比例换算回原图
  cropSelection: {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    originalW: 0,
    originalH: 0,
    displayW: 0,
    displayH: 0,
  },
  resizeCorner: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,

  // 写入头像并保存到本地
  // 同时更新登录入口与面板预览两处，避免两个位置显示不一致
  setAvatarImage: function (dataUrl) {
    const avatarImg = DOMRefs.get(DOMRefs.login.avatar);
    if (avatarImg && dataUrl) {
      avatarImg.src = dataUrl;
    }
    this.saveAvatarForUser(dataUrl);
    const adminPreview = DOMRefs.get(DOMRefs.adminControls.adminAvatarPreview);
    if (adminPreview && dataUrl) {
      adminPreview.src = dataUrl;
    }
  },

  // 按用户名读取头像，键名带用户名以便将来支持多用户
  getAvatarForUser: function () {
    const username = CONFIG.ADMIN_USERNAME || 'admin';
    return Utils.storage.get('avatar_' + username);
  },

  saveAvatarForUser: function (dataUrl) {
    const username = CONFIG.ADMIN_USERNAME || 'admin';
    Utils.storage.set('avatar_' + username, dataUrl);
  },

  // 打开文件选择框
  // 用动态创建的 input 而非页面预置元素：选择完成后即可随引用释放，不必在模板中占位
  openUpload: function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = function (e) {
      const file = e.target.files[0];
      if (file) {
        AdminAvatar.initCropModal(file);
      }
    };
    input.click();
  },

  // 通用裁剪入口：复用头像裁剪 UI，可自定义宽高比与回调
  // 置 _lockCropOverlay 使点击遮罩不退出：拼图模式下的误触代价比头像更高
  openCustomCrop: function (file, aspectRatio, outputWidth, onConfirm, onCancel) {
    this._cropAspectRatio = aspectRatio || 1;
    this._outputWidth = outputWidth || 200;
    this._cropCallback = onConfirm || null;
    this._cropCancelCallback = onCancel || null;
    this._lockCropOverlay = true;
    this.initCropModal(file);
  },

  // 读取文件并进入裁剪态
  // 需等 Image.onload 拿到真实尺寸后再搭建画布，否则画布尺寸会按 0 计算
  initCropModal: function (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        AdminAvatar.originalImage = img;
        AdminAvatar.setupCropCanvas(img);
        const overlay = DOMRefs.get(DOMRefs.crop.overlay);
        if (overlay) overlay.classList.add('active');
        AdminAvatar.bindCropEvents();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  // 绑定裁剪弹窗的确认、取消与遮罩点击
  // 处理器先存字段再 remove 旧引用：重复打开时才能摘掉上一次的监听
  bindCropEvents: function () {
    const confirmBtn = DOMRefs.get(DOMRefs.crop.confirmBtn);
    const cancelBtn = DOMRefs.get(DOMRefs.crop.cancelBtn);

    if (confirmBtn) {
      confirmBtn.removeEventListener('click', this._confirmHandler);
      this._confirmHandler = function () {
        AdminAvatar.confirmCrop();
      };
      confirmBtn.addEventListener('click', this._confirmHandler);
    }

    if (cancelBtn) {
      cancelBtn.removeEventListener('click', this._cancelHandler);
      this._cancelHandler = function () {
        AdminAvatar.cancelCrop();
      };
      cancelBtn.addEventListener('click', this._cancelHandler);
    }

    const overlay = DOMRefs.get(DOMRefs.crop.overlay);
    if (overlay) {
      overlay.removeEventListener('click', this._overlayHandler);
      // 只在点击遮罩本体且未锁定时取消，避免点内容区冒泡导致误退出
      this._overlayHandler = function (e) {
        if (e.target === overlay && !AdminAvatar._lockCropOverlay) {
          AdminAvatar.cancelCrop();
        }
      };
      overlay.addEventListener('click', this._overlayHandler);
    }
  },

  // 建立裁剪画布并按宽高比给出初始选区
  // 大图先等比缩到 400px 内展示：画布过大既影响拖动性能，也会溢出弹窗
  // 初始选区取源图与该比例下可容纳的最大矩形，再乘 0.7 留出四周可拖拽空间
  setupCropCanvas: function (img) {
    const canvas = DOMRefs.get(DOMRefs.crop.canvas);
    if (!canvas) {
      console.warn('[AdminAvatar] cropCanvas 元素不存在');
      return;
    }
    const ctx = canvas.getContext('2d');

    const maxSize = 400;
    let displayW = img.width;
    let displayH = img.height;

    if (displayW > maxSize) {
      displayW = maxSize;
      displayH = (img.height * maxSize) / img.width;
    }
    if (displayH > maxSize) {
      displayH = maxSize;
      displayW = (img.width * maxSize) / img.height;
    }

    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    ctx.drawImage(img, 0, 0, displayW, displayH);

    const ratio = AdminAvatar._cropAspectRatio || 1;
    let cropW, cropH;
    // 按比例分两种约束：宽扁比例受宽度限制，高瘦比例受高度限制
    if (ratio >= 1) {
      cropW = Math.min(displayW, displayH * ratio) * 0.7;
      cropH = cropW / ratio;
    } else {
      cropH = Math.min(displayH, displayW / ratio) * 0.7;
      cropW = cropH * ratio;
    }
    AdminAvatar.cropSelection = {
      x: (displayW - cropW) / 2,
      y: (displayH - cropH) / 2,
      w: cropW,
      h: cropH,
      originalW: img.width,
      originalH: img.height,
      displayW: displayW,
      displayH: displayH,
    };

    AdminAvatar.enableCropDrawing(canvas);
    AdminAvatar.updatePreview();
  },

  // 启用裁剪交互：四角缩放、选区拖动与遮罩绘制
  // move/up 挂 window 而非 canvas：拖出画布范围后仍要持续跟随
  enableCropDrawing: function (canvas) {
    let isDragging = false;
    let dragStartX = 0,
      dragStartY = 0;
    const self = this;

    // 重绘：先画底图，再用半透明遮罩压暗选区外区域
    // 遮罩由上下左右四块拼成，而非整块挖洞——canvas 无直接挖洞 API
    const redraw = function () {
      const ctx = canvas.getContext('2d');
      const sel = self.cropSelection;

      ctx.drawImage(self.originalImage, 0, 0, sel.displayW, sel.displayH);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, sel.y);
      ctx.fillRect(0, sel.y + sel.h, canvas.width, canvas.height - sel.y - sel.h);
      ctx.fillRect(0, sel.y, sel.x, sel.h);
      ctx.fillRect(sel.x + sel.w, sel.y, canvas.width - sel.x - sel.w, sel.h);

      ctx.strokeStyle = '#c47a44';
      ctx.lineWidth = 2;
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);

      const handleSize = 8;
      ctx.fillStyle = '#c47a44';
      const corners = [
        [sel.x - handleSize / 2, sel.y - handleSize / 2],
        [sel.x + sel.w - handleSize / 2, sel.y - handleSize / 2],
        [sel.x - handleSize / 2, sel.y + sel.h - handleSize / 2],
        [sel.x + sel.w - handleSize / 2, sel.y + sel.h - handleSize / 2],
      ];
      corners.forEach(function (corner) {
        ctx.fillRect(corner[0], corner[1], handleSize, handleSize);
      });
    };

    // 事件坐标 → 画布内部坐标
    // 画布可能被 CSS 缩放，故按 width/rect.width 换算，不能直接用 clientX
    const getMousePos = function (e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      let clientX, clientY;
      if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    // 按下：优先判定四角把柄，命中则进入缩放，否则落在选区内则整体拖动
    const onMouseDown = function (e) {
      e.preventDefault();
      const pos = getMousePos(e);
      const sel = self.cropSelection;
      const handleSize = 8;

      const corners = [
        { x: sel.x, y: sel.y, type: 'nw' },
        { x: sel.x + sel.w, y: sel.y, type: 'ne' },
        { x: sel.x, y: sel.y + sel.h, type: 'sw' },
        { x: sel.x + sel.w, y: sel.y + sel.h, type: 'se' },
      ];

      for (let i = 0; i < corners.length; i++) {
        const corner = corners[i];
        if (Math.abs(pos.x - corner.x) < handleSize && Math.abs(pos.y - corner.y) < handleSize) {
          self.resizeCorner = corner.type;
          isDragging = true;
          dragStartX = pos.x;
          dragStartY = pos.y;
          return;
        }
      }

      if (pos.x >= sel.x && pos.x <= sel.x + sel.w && pos.y >= sel.y && pos.y <= sel.y + sel.h) {
        self.resizeCorner = 'move';
        isDragging = true;
        // 拖动记的是光标相对选区左上的偏移，使选区跟随光标时保持抓取点不变
        dragStartX = pos.x - sel.x;
        dragStartY = pos.y - sel.y;
      }
    };

    // 移动：拖动时夹在画布内；缩放时按锚点反向推进并维持宽高比
    const onMouseMove = function (e) {
      if (!isDragging) return;
      e.preventDefault();
      const pos = getMousePos(e);
      const sel = self.cropSelection;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      if (self.resizeCorner === 'move') {
        let newX = pos.x - dragStartX;
        let newY = pos.y - dragStartY;
        newX = Math.max(0, Math.min(newX, canvasWidth - sel.w));
        newY = Math.max(0, Math.min(newY, canvasHeight - sel.h));
        sel.x = newX;
        sel.y = newY;
      } else {
        // 各角件的锚点不同：se 固定左上、nw 固定右下，故需分别推导入参
        let newW = sel.w;
        let newH = sel.h;
        let newX2 = sel.x;
        let newY2 = sel.y;

        if (self.resizeCorner === 'se') {
          newW = pos.x - sel.x;
          newH = pos.y - sel.y;
        } else if (self.resizeCorner === 'sw') {
          newW = sel.x + sel.w - pos.x;
          newH = pos.y - sel.y;
          newX2 = pos.x;
        } else if (self.resizeCorner === 'ne') {
          newW = pos.x - sel.x;
          newH = sel.y + sel.h - pos.y;
          newY2 = pos.y;
        } else if (self.resizeCorner === 'nw') {
          newW = sel.x + sel.w - pos.x;
          newH = sel.y + sel.h - pos.y;
          newX2 = pos.x;
          newY2 = pos.y;
        }

        const ratio = self._cropAspectRatio || 1;
        if (ratio !== 1) {
          // 非正方形：先按宽度定尺寸再回算高度，高度越界时反过来以高度为准
          sel.w = Math.max(20, Math.min(newW, canvasWidth - newX2));
          sel.h = Math.max(20, sel.w / ratio);
          if (sel.h > canvasHeight - newY2) {
            sel.h = Math.max(20, canvasHeight - newY2);
            sel.w = sel.h * ratio;
          }
        } else {
          // 正方形：取宽高中较小者作为边长，保证不越界且维持 1:1
          const size = Math.min(newW, newH);
          sel.w = sel.h = Math.max(20, Math.min(size, canvasWidth - newX2));
        }
        sel.x = Math.max(0, Math.min(newX2, canvasWidth - sel.w));
        sel.y = Math.max(0, Math.min(newY2, canvasHeight - sel.h));
      }

      redraw();
      self.updatePreview();
    };

    const onMouseUp = function () {
      isDragging = false;
      self.resizeCorner = null;
    };

    // 先摘旧监听再加新：本函数每次打开裁剪都会被调用，不摘会累积
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('touchstart', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('touchmove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchend', onMouseUp);

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchend', onMouseUp);

    redraw();
  },

  // 刷新右侧预览小图
  // 把显示坐标按 display→original 比例还原为原图坐标，保证预览与最终导出一致
  updatePreview: function () {
    const previewCanvas = DOMRefs.get(DOMRefs.crop.previewCanvas);
    if (!previewCanvas) return;
    const ctx = previewCanvas.getContext('2d');

    const sel = this.cropSelection;
    const scaleX = this.originalImage.width / sel.displayW;
    const scaleY = this.originalImage.height / sel.displayH;

    const sx = sel.x * scaleX;
    const sy = sel.y * scaleY;
    const sw = sel.w * scaleX;
    const sh = sel.h * scaleY;

    const ratio = this._cropAspectRatio || 1;
    const pw = 120;
    const ph = Math.round(pw / ratio);
    previewCanvas.width = pw;
    previewCanvas.height = ph;
    previewCanvas.style.width = pw + 'px';
    previewCanvas.style.height = ph + 'px';
    ctx.drawImage(this.originalImage, sx, sy, sw, sh, 0, 0, pw, ph);
  },

  // 确认裁剪：按输出尺寸导出并交给回调或头像保存流程
  // 统一导出 webp 且质量 0.85：头像体积敏感，webp 在同等观感下明显更小
  confirmCrop: function () {
    const outputW = this._outputWidth || 200;
    const ratio = this._cropAspectRatio || 1;
    const outputH = Math.round(outputW / ratio);
    const cropCanvas = document.createElement('canvas');
    const sel = this.cropSelection;
    const scaleX = this.originalImage.width / sel.displayW;
    const scaleY = this.originalImage.height / sel.displayH;

    const sx = sel.x * scaleX;
    const sy = sel.y * scaleY;
    const sw = sel.w * scaleX;
    const sh = sel.h * scaleY;

    cropCanvas.width = outputW;
    cropCanvas.height = outputH;
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(this.originalImage, sx, sy, sw, sh, 0, 0, outputW, outputH);

    cropCanvas.toBlob(
      (blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target.result;
            // 有自定义回调时交给调用方（拼图自定义），否则按头像流程保存
            if (AdminAvatar._cropCallback) {
              AdminAvatar._cropCallback(dataUrl);
            } else {
              AdminAvatar.setAvatarImage(dataUrl);
              const adminPreview = DOMRefs.get(DOMRefs.adminControls.adminAvatarPreview);
              if (adminPreview) adminPreview.src = dataUrl;
            }
            Utils.showToast(UI.toast.avatarUploadSuccess, false);
          };
          reader.readAsDataURL(blob);
        }
        this._closeCropModal();
      },
      'image/webp',
      0.85
    );
  },

  _closeCropModal: function () {
    const overlay = DOMRefs.get(DOMRefs.crop.overlay);
    if (overlay) overlay.classList.remove('active');
  },

  // 取消裁剪：先取出回调再复位状态
  // 回调在状态复位后调用，避免回调中再次打开裁剪时被本函数的重置覆盖
  cancelCrop: function () {
    const onCancel = this._cropCancelCallback;
    this._cropCallback = null;
    this._cropCancelCallback = null;
    this._cropAspectRatio = 1;
    this._outputWidth = 200;
    this._lockCropOverlay = false;
    this._closeCropModal();
    if (onCancel) onCancel();
  },
};
