// ！目录交互装配
// 把目录树的各类交互（可见性切换、单击/双击、右键、折叠）集中绑定，并返回一个统一解绑函数。
// 返回清理函数而非暴露内部监听器：调用方无需知道具体绑了哪些事件，避免漏解绑。
import { bindInteractions, handleNodeClick, setActiveNode } from './events.js';
import { showContextMenu } from './context-menu.js';
import { handleFolderToggle } from './folder-state.js';
import { handleVisibilityToggle } from './directory-visibility.js';
import { AppState } from '../../../core/app-state.js';

// 绑定目录树全部交互
export function bindDirectoryInteractions(container, callbacks) {
    const {
        onUpdateTree,
        onSetActiveNode,
        onVisibilityToggleSuccess,
    } = callbacks;

    let unbindEventsFn = null;
    let visibilityHandler = null;

    // 可见性切换：成功后重绘目录树，因为列表内容也随之变化
    visibilityHandler = async function(e) {
        const success = await handleVisibilityToggle(e, onVisibilityToggleSuccess);
        if (success && onUpdateTree) {
            onUpdateTree();
        }
    };
    container.addEventListener('directory-toggle-visibility', visibilityHandler);

    // 右键菜单
    const contextMenuHandler = (x, y, type, name, articleId, nodeLi) => {
        showContextMenu(x, y, type, name, articleId, nodeLi, () => {
            if (onUpdateTree) onUpdateTree();
        });
    };

    const handleNodeClickFn = (nodeElement, nodeData, isDouble) => {
        handleNodeClick(nodeElement, nodeData, isDouble, (nodeId) => {
            if (onSetActiveNode) onSetActiveNode(nodeId);
        });
    };

    const setActiveNodeFn = (nodeId) => {
        if (onSetActiveNode) onSetActiveNode(nodeId);
    };

    const unbind = bindInteractions(
        container,
        contextMenuHandler,
        handleNodeClickFn,
        setActiveNodeFn
    );
    unbindEventsFn = unbind;

    // 折叠切换：监听器需保留引用，否则无法在解绑时精确移除
    const folderToggleHandler = (e) => {
        handleFolderToggle(e, container);
    };
    container.addEventListener('click', folderToggleHandler);

    // 统一解绑
    return function unbindAll() {
        if (unbindEventsFn) {
            unbindEventsFn();
            unbindEventsFn = null;
        }
        if (visibilityHandler) {
            container.removeEventListener('directory-toggle-visibility', visibilityHandler);
            visibilityHandler = null;
        }
        container.removeEventListener('click', folderToggleHandler);
    };
}