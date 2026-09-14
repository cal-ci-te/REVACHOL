// ！目录树渲染
// 生成目录树的 HTML 字符串（含搜索过滤、折叠态、图标与管理员可见性开关）。
// 每个节点带 data-path 唯一路径：折叠态与图标都以路径为键，避免同名文件夹互相干扰。
import { Utils } from '../../../utils.js';
import { AppState } from '../../../core/app-state.js';
import { Article } from '../../../models/article-model.js';
import { UI } from '../../../utils/ui-strings.js';
import { DirectoryIcon } from '../../../services/directory-icon.js';

// 判断文章是否命中关键词（标题或正文）
function articleMatches(article, keyword) {
    if (!keyword) return true;
    const lower = keyword.toLowerCase();
    return (article.title && article.title.toLowerCase().includes(lower)) ||
           (article.content && article.content.toLowerCase().includes(lower));
}

// 递归构建带过滤的树节点
// 返回 { node, shouldShow }；文件夹名命中时保留全部子节点，只有子节点命中时才裁剪子树
function buildFilteredNode(node, keyword, articleMap) {
    if (!keyword) {
        return { node, shouldShow: true };
    }

    const isFolder = node.type === 'folder';
    const nameMatch = node.name && node.name.toLowerCase().includes(keyword.toLowerCase());

    if (isFolder) {
        const children = node.children || [];
        const filteredChildren = [];
        let hasVisibleChild = false;
        for (const child of children) {
            const result = buildFilteredNode(child, keyword, articleMap);
            if (result.shouldShow) {
                filteredChildren.push(result.node);
                hasVisibleChild = true;
            }
        }
        if (nameMatch) {
            // 文件夹名命中时保留全部子节点：用户搜的是文件夹，期望看到其完整内容
            const allChildren = node.children || [];
            return {
                node: {
                    ...node,
                    children: allChildren
                },
                shouldShow: true
            };
        } else {
            if (hasVisibleChild) {
                return {
                    node: {
                        ...node,
                        children: filteredChildren
                    },
                    shouldShow: true
                };
            } else {
                return { node: null, shouldShow: false };
            }
        }
    } else {
        // 文章节点
        const article = articleMap[node.articleId];
        if (article && articleMatches(article, keyword)) {
            return { node, shouldShow: true };
        } else {
            return { node: null, shouldShow: false };
        }
    }
}

// 渲染目录树
// parentPath 逐层累积为唯一路径，是折叠态与图标查询的键
export function renderTree(nodes, level = 0, filterKeyword = null, parentPath = '') {
    if (!nodes || nodes.length === 0) {
        return `<div style="padding: 16px; color: var(--color-text-muted); text-align: center;">${UI.directory.emptyTree}</div>`;
    }

    // 构建文章映射
    const articles = Article.allArticles || [];
    const articleMap = {};
    articles.forEach(a => { articleMap[a.id] = a; });

    // 过滤时先递归裁剪树，整棵树都无命中则直接返回空态
    let filteredNodes = nodes;
    if (filterKeyword) {
        const result = nodes.map(node => buildFilteredNode(node, filterKeyword, articleMap))
                            .filter(r => r.shouldShow)
                            .map(r => r.node);
        filteredNodes = result;
        if (filteredNodes.length === 0) {
            return `<div style="padding: 16px; color: var(--color-text-muted); text-align: center;">没有匹配的结果</div>`;
        }
    }

    // 管理员才渲染可见性开关与拖放区
    const isAdmin = AppState.get('isLoggedIn');
    let html = '<ul style="list-style: none; padding-left: 0;">';
    for (const node of filteredNodes) {
        // 唯一路径（父路径 + 自身名）：同名文件夹分散在不同层级时不会共用折叠态
        const nodePath = parentPath ? parentPath + '/' + node.name : node.name;
        
        const nodeId = node.type === 'folder'
            ? 'folder-' + node.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
            : 'article-' + node.articleId;
        const isFolder = node.type === 'folder';
        const hasChildren = isFolder && node.children && node.children.length > 0;
        
        const storageKey = 'folder-collapsed-' + nodePath;
        const stored = Utils.storage.get(storageKey);
        // 未存过时默认展开：收起状态比展开更容易让用户以为「目录是空的」
        const isCollapsed = stored !== null ? stored : false;
        console.log(`[renderTree] ${nodePath} => isCollapsed=${isCollapsed} (stored=${stored})`);

        // 文件夹走 DirectoryIcon 单例（支持自定义图标），文章节点固定用内置 emoji
        const iconHtml = isFolder
            ? DirectoryIcon.renderIconHtml(isCollapsed)
            : `<span class="node-icon">${UI.directory.articleIcon}</span>`;

        // 可见性按钮（管理员）
        let visibilityBtn = '';
        let visible = true;
        if (!isFolder) {
            const article = articleMap[node.articleId];
            visible = article ? !!article.visible : true;
            if (isAdmin) {
                visibilityBtn = `<button class="visibility-toggle" data-id="${node.articleId}" data-visible="${visible}" style="background:none;border:none;color:${visible ? 'var(--color-success)' : 'var(--color-border)'};cursor:pointer;font-size:14px;margin-left:8px;" title="${UI.common.toggleVisible}"><span class="icon-pack-visibility">${visible ? '👁️' : '🚫'}</span></button>`;
            }
        }

        const indent = level * 16;
        // draggable 恒为 false：拖拽由 drag-drop.js 手动接管，用原生 HTML5 拖拽会与自定义实现冲突
        html += `<li class="tree-node ${isFolder ? 'folder' : 'article'}" 
                    data-node-id="${nodeId}" 
                    data-type="${node.type}" 
                    data-name="${node.name || ''}" 
                    data-path="${nodePath}"
                    data-article-id="${node.articleId || ''}" 
                    data-folder-first-id="${node.firstArticleId || ''}" 
                    ${isFolder ? 'draggable="false"' : 'draggable="false"'} 
                    style="padding-left:${indent}px;">`;
        html += `<div class="tree-node-content" data-node-id="${nodeId}">`;

        // 目录箭头：有子节点才给可点箭头；空文件夹只显示空邮箱图标且不可点，避免误导用户
        if (isFolder && hasChildren) {
            const toggleIconHTML = isCollapsed
                ? '<span class="icon-pack-arrow arrow-r0">▶</span>'
                : '<span class="icon-pack-arrow arrow-r90">▼</span>';
            html += `<span class="toggle-icon" data-toggle="toggle" data-folder="${node.name}" style="cursor:pointer;">${toggleIconHTML}</span>`;
        } else if (isFolder && !hasChildren) {
            html += `<span class="toggle-icon" style="opacity:0.3;">📭</span>`;
        } else {
            html += `<span class="toggle-icon"></span>`;
        }

        html += iconHtml;
        html += `<span class="node-title">${Utils.escapeHtml(node.name)}</span>`;

        if (isAdmin && !isFolder && !visible) {
            html += `<span style="font-size:9px;color:var(--color-text-muted);margin-left:6px;">(访客不可见)</span>`;
        }
        if (isAdmin && !isFolder) {
            html += visibilityBtn;
        }

        html += '</div>';

        if (isFolder && hasChildren) {
            // 子层沿用 nodePath 继续累积，保证深层节点路径全局唯一
            const childHtml = renderTree(node.children, level + 1, filterKeyword, nodePath);
            const displayStyle = isCollapsed ? 'none' : 'block';
            html += `<div class="children" style="display: ${displayStyle}; padding-left:${level * 8}px;">${childHtml}</div>`;
        } else if (isFolder && !hasChildren) {
            html += `<div class="children" style="opacity:0.6; padding-left:${level * 8}px;"><div style="padding: 8px 16px; font-size:11px; color:#6a5a48;">${UI.directory.emptyFolder}</div></div>`;
        }

        html += '</li>';
    }
    html += '</ul>';

    // 底部空白放置区（管理员可拖到此处移出分类）
    let dropzoneHtml = '';
    if (AppState.get('isLoggedIn')) {
        dropzoneHtml = `
            <div class="dropzone-background" data-dropzone="background">
                ${UI.directory.dragDropHint}
            </div>
        `;
    }

    return html + dropzoneHtml;
}