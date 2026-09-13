// ！色卡列表渲染
// 把已保存的色卡（纯色或渐变）渲染为可应用、可删除的列表项。
// 以副作用方式为 AdminPanel 挂载 renderPalettes，避免与 panel/index.js 形成循环依赖。
import { AdminPanel } from './index.js';
import { Texture } from '../../services/texture.js';
import { NotificationService } from '../../services/notification-service.js';
import { Utils } from '../../utils.js';
import { UI } from '../../utils/ui-strings.js';

AdminPanel.renderPalettes = function () {
  const container = document.getElementById('paletteList');
  if (!container) return;

  const palettes = Texture && Texture.palettes ? Texture.palettes : [];
  if (palettes.length === 0) {
    container.innerHTML =
      `<div style="color: var(--color-text-muted); text-align: center; padding: 6px;">${UI.admin.paletteEmpty}</div>`;
    return;
  }

  let html = '';
  palettes.forEach((p) => {
    // 按模式生成不同预览：纯色直接填色，渐变按方向与色标生成 linear-gradient
    const colorPreview =
      p.mode === 'solid'
        ? `<span style="display:inline-block;width:20px;height:20px;background:${p.colors[0]};border:1px solid var(--color-border);border-radius:4px;vertical-align:middle;"></span>`
        : `<span style="display:inline-block;width:20px;height:20px;background:linear-gradient(${p.direction}, ${p.colors.join(', ')});border:1px solid var(--color-border);border-radius:4px;vertical-align:middle;"></span>`;

    // 色卡名可能由用户输入，故转义后再拼入 HTML
    html += `
            <div style="display:flex; align-items:center; padding:4px 0; border-bottom:1px solid var(--color-danger);">
                ${colorPreview}
                <span style="flex:1; margin-left:8px; font-size:11px; color:var(--color-text-accent); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Utils.escapeHtml(p.name)}</span>
                <button class="apply-palette" data-id="${p.id}" style="background:none; border:none; color:var(--color-text-secondary); cursor:pointer; font-size:12px;" title="${UI.admin.paletteApply}">✅</button>
                <button class="delete-palette" data-id="${p.id}" style="background:none; border:none; color:var(--color-error); cursor:pointer; font-size:12px;" title="${UI.admin.paletteDelete}">🗑️</button>
            </div>
        `;
  });
  container.innerHTML = html;

  // 事件在渲染后逐个绑定：列表用 innerHTML 整体重建，旧节点上的监听随节点一并丢弃
  container.querySelectorAll('.apply-palette').forEach((btn) => {
    btn.addEventListener('click', function () {
      const id = this.dataset.id;
      if (Texture && Texture.applyPalette) {
        Texture.applyPalette(id);

        // 应用色卡后把面板控件同步到该色卡的实际配置
        // 否则界面仍显示上一次的选择，用户无法据界面判断当前背景从何而来
        const palette = Texture.palettes.find((p) => p.id === id);
        if (palette) {
          const solidRadio = document.querySelector('input[name="bgMode"][value="solid"]');
          const gradientRadio = document.querySelector('input[name="bgMode"][value="gradient"]');
          const gradControls = document.getElementById('gradientControls');

          if (palette.mode === 'solid') {
            if (solidRadio) solidRadio.checked = true;
            if (gradientRadio) gradientRadio.checked = false;
            if (gradControls) gradControls.style.display = 'none';
            const bgPicker = document.getElementById('bgColorPicker');
            if (bgPicker) bgPicker.value = palette.colors[0];
          } else {
            if (gradientRadio) gradientRadio.checked = true;
            if (solidRadio) solidRadio.checked = false;
            if (gradControls) gradControls.style.display = 'block';

            const c1 = document.getElementById('gradColor1');
            const c2 = document.getElementById('gradColor2');
            const c3 = document.getElementById('gradColor3');

            if (c1 && palette.colors[0]) c1.value = palette.colors[0];
            if (c2 && palette.colors[1]) c2.value = palette.colors[1];
            // 第三个取色器按色卡是否含第三色决定显隐：隐藏时它不参与渐变计算
            if (c3) {
              if (palette.colors[2]) {
                c3.value = palette.colors[2];
                c3.style.display = '';
              } else {
                c3.style.display = 'none';
              }
            }

            const dir = document.getElementById('gradDirection');
            if (dir) dir.value = palette.direction || 'to bottom';

            const feather = document.getElementById('gradFeatherSlider');
            const featherValue = document.getElementById('gradFeatherValue');
            if (feather) {
              const val = palette.feather || 50;
              feather.value = val;
              if (featherValue) featherValue.textContent = val;
            }
          }
        }
        NotificationService.showToast(
          NotificationService.messages.paletteApplied(palette ? palette.name : '')
        );
      } else {
        NotificationService.showToast(NotificationService.messages.moduleNotLoaded, true);
      }
    });
  });

  container.querySelectorAll('.delete-palette').forEach((btn) => {
    btn.addEventListener('click', function () {
      const id = this.dataset.id;
      // 删除不可撤销，故二次确认；确认后重新渲染列表以反映最新状态
      if (confirm(NotificationService.messages.paletteDeleteConfirm)) {
        if (Texture && Texture.deletePalette) {
          Texture.deletePalette(id);
          if (AdminPanel.renderPalettes) {
            AdminPanel.renderPalettes();
          }
        } else {
          NotificationService.showToast(NotificationService.messages.moduleNotLoaded, true);
        }
      }
    });
  });
};
