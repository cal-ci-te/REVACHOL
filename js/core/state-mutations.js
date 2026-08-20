// 用于规范 AppState 的修改操作，所有状态变更均应通过 AppState.commit 并传入以下类型之一。

export const MUTATIONS = {
  // 登录状态
  SET_LOGGED_IN: 'SET_LOGGED_IN',

  // 面板位置（右/下）
  SET_PANEL_POSITION: 'SET_PANEL_POSITION',

  // 面板折叠状态
  SET_PANEL_COLLAPSED: 'SET_PANEL_COLLAPSED',

  // 侧边栏折叠状态
  SET_SIDEBAR_COLLAPSED: 'SET_SIDEBAR_COLLAPSED',

  // 侧边栏位置（左/上）
  SET_SIDEBAR_POSITION: 'SET_SIDEBAR_POSITION',

  // 贴纸编辑状态
  SET_DECO_EDITING: 'SET_DECO_EDITING',

  // 水印配置
  SET_WATERMARK_TEXT: 'SET_WATERMARK_TEXT',
  SET_WATERMARK_OPACITY: 'SET_WATERMARK_OPACITY',

  // 纹理配置
  SET_TEXTURE_URL: 'SET_TEXTURE_URL',
  SET_TEXTURE_OPACITY: 'SET_TEXTURE_OPACITY',

  // 背景颜色
  SET_BG_COLOR: 'SET_BG_COLOR',

  // 文章数据（全部替换）
  SET_ARTICLES: 'SET_ARTICLES',
  SET_VISIBLE_ARTICLES: 'SET_VISIBLE_ARTICLES',
  SET_ARTICLE_VISIBILITY: 'SET_ARTICLE_VISIBILITY',

  // 管理员对象
  SET_ADMIN: 'SET_ADMIN',

  // UI 控制器引用
  SET_UI: 'SET_UI',

  // 通用：设置任意键（用于过渡，但建议直接用具体 mutation）
  SET_KEY: 'SET_KEY',

  // 拼图组件
  SET_PUZZLE_IMAGE: 'SET_PUZZLE_IMAGE',           // 拼图自定义图片 dataUrl
  SET_PUZZLE_COMPLETED: 'SET_PUZZLE_COMPLETED',   // 拼图是否已对齐完成

  // CrewAI Web Dashboard
  SET_CREW_STATE: 'SET_CREW_STATE',               // 整体替换 crew 运行状态快照
};

/**
 * 为给定键名生成对应的 mutation 类型
 * 用于快速添加新 mutation，但推荐显式使用上面的常量。
 */
export function mutationFor(key) {
  return `SET_${key.toUpperCase()}`;
}