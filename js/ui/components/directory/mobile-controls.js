// ！移动端位置控件
// 移动端位置模式下悬浮在目录树顶部的「保存 / 取消」条。
// 控件按单例持有：目录树重绘会丢失节点，故需 destroy 后按需 recreate。
let _controlsInstance = null;

// 创建控件
// 已存在则直接复用：重绘时重复创建会在页面上叠出多条控件
export function createMobileControls(container, callbacks) {
    if (document.getElementById('mobilePositionControls')) {
        return document.getElementById('mobilePositionControls');
    }

    const controls = document.createElement('div');
    controls.id = 'mobilePositionControls';
    controls.className = 'mobile-position-controls';
    controls.style.display = 'none';
    controls.innerHTML = `
        <div class="mobile-pos-hint">📌 拖拽节点调整顺序</div>
        <div class="mobile-pos-actions">
            <button class="mobile-pos-save" data-action="mobile-pos-save">💾 保存</button>
            <button class="mobile-pos-cancel" data-action="mobile-pos-cancel">❌ 取消</button>
        </div>
    `;

    // 插到目录树之前：定位依赖 CSS 的兄弟关系，插入到内部会被滚动区裁掉
    container.parentNode.insertBefore(controls, container);

    controls.querySelector('.mobile-pos-save').addEventListener('click', () => {
        if (callbacks.onSave) callbacks.onSave();
    });
    controls.querySelector('.mobile-pos-cancel').addEventListener('click', () => {
        if (callbacks.onCancel) callbacks.onCancel();
    });

    _controlsInstance = controls;
    return controls;
}

// 显示控件
export function showMobileControls() {
    if (_controlsInstance) {
        _controlsInstance.style.display = 'block';
    }
}

// 隐藏控件（保留 DOM，仅收起）
export function hideMobileControls() {
    if (_controlsInstance) {
        _controlsInstance.style.display = 'none';
    }
}

// 销毁控件并清空单例
export function destroyMobileControls() {
    if (_controlsInstance) {
        _controlsInstance.remove();
        _controlsInstance = null;
    }
}

// 重建控件（目录树重绘后调用）
export function recreateMobileControls(container, callbacks) {
    destroyMobileControls();
    return createMobileControls(container, callbacks);
}
