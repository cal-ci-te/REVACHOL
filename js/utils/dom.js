// ！DOM 文本处理
// 提供 HTML 转义、标签剥离与富文本截断，供卡片渲染与预览统一调用。

// 转义 HTML 特殊字符
// 防止用户输入被当作标签注入（XSS）
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 去除全部 HTML 标签
export function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

// 截断 HTML 到指定长度
// 未超长时返回原始 HTML 保留富文本样式，仅超长才降级为纯文本
export function truncateHtml(html, maxLength) {
  if (!html) return '';
  if (typeof maxLength !== 'number' || maxLength <= 0) maxLength = 150;
  const plain = stripHtml(html);
  if (plain.length <= maxLength) return html;
  // 长文截断为纯文本：避免在卡片中拆散 HTML 标签结构；卡片预览丢失格式是可接受的
  const truncated = plain.substring(0, maxLength).replace(/\s+\S*$/, '');
  return truncated + '…';
}