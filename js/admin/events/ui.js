// ！后台 UI 事件（已废弃）
// 保留空实现以兼容既有调用点：事件绑定与清理均已迁移至 AdminPanel。
// 不直接删除模块，是避免仍在 import 的旧代码因解析失败而报错。
export const AdminUiEvents = {
  bind: function () {
    console.log('[AdminUiEvents] 事件绑定已迁移至 AdminPanel');
  },

  unbind: function () {
    console.log('[AdminUiEvents] 事件清理已迁移至 AdminPanel');
  },
};
