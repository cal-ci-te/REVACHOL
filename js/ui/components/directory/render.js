import { Utils } from '../../../utils.js';
import { AppState } from '../../../core/app-state.js';
import { Article } from '../../../models/article-model.js';
import { UI } from '../../../utils/ui-strings.js';
import { DirectoryIcon } from '../../../services/directory-icon.js';

/**
 * 检查文章是否匹配关键字（标题或内容）
 */
function articleMatches(article, keyword) {
    if (!keyword) return true;
    const lower = keyword.toLowerCase();
    return (article.title && article.title.toLowerCase().includes(lower)) ||
           (article.content && article.content.toLowerCase().includes(lower));
}

/**
 * 递归构建带过滤的树节点
 * 返回 { node, shouldShow }
 */
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
            // 文件夹名匹配，显示该文件夹（即使子节点为空也显示）
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

/**
 * 渲染目录树
 * @param {Array} nodes - 树节点数组
 * @param {number} level - 缩进层级
 * @param {string|null} filterKeyword - 过滤关键字
 * @param {string} parentPath - 父级路径（用于唯一标识文件夹）
 */
export function renderTree(nodes, level = 0, filterKeyword = null, parentPath = '') {
    if (!nodes || nodes.length === 0) {
        return `<div style="padding: 16px; color: var(--color-text-muted); text-align: center;">${UI.directory.emptyTree}</div>`;
    }

    // 构建文章映射
    const articles = Article.allArticles || [];
    const articleMap = {};
    articles.forEach(a => { articleMap[a.id] = a; });

    // 如果有过滤关键字，先过滤节点
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

    const isAdmin = AppState.get('isLoggedIn');
    let html = '<ul style="list-style: none; padding-left: 0;">';
    for (const node of filteredNodes) {
        // ★★★ 构建唯一路径 ★★★
        const nodePath = parentPath ? parentPath + '/' + node.name : node.name;
        
        const nodeId = node.type === 'folder'
            ? 'folder-' + node.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
            : 'article-' + node.articleId;
        const isFolder = node.type === 'folder';
        const hasChildren = isFolder && node.children && node.children.length > 0;
        
        // ★★★ 使用唯一路径作为存储键 ★★★
        const storageKey = 'folder-collapsed-' + nodePath;
        const stored = Utils.storage.get(storageKey);
        // 默认展开（false）
        const isCollapsed = stored !== null ? stored : false;
        console.log(`[renderTree] ${nodePath} => isCollapsed=${isCollapsed} (stored=${stored})`);

        // 文件夹节点支持自定义图标（DirectoryIcon 单例）；文章节点保持内置 emoji
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

        // ★★★ 为文件夹的 toggle-icon 添加 data-folder 属性 ★★★
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
            // ★★★ 传递 nodePath 给子节点 ★★★
            const childHtml = renderTree(node.children, level + 1, filterKeyword, nodePath);
            const displayStyle = isCollapsed ? 'none' : 'block';
            html += `<div class="children" style="display: ${displayStyle}; padding-left:${level * 8}px;">${childHtml}</div>`;
        } else if (isFolder && !hasChildren) {
            html += `<div class="children" style="opacity:0.6; padding-left:${level * 8}px;"><div style="padding: 8px 16px; font-size:11px; color:#6a5a48;">${UI.directory.emptyFolder}</div></div>`;
        }

        html += '</li>';
    }
    html += '</ul>';

    // 底部空白放置区（仅管理员可见）
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