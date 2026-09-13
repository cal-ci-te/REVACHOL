// ！管理面板主对象
// 仅定义空的 AdminPanel，具体方法由其他模块以副作用导入方式挂载到该对象上。
// 拆开挂载是为让 render / events / palette 各自独立演进，避免单文件膨胀。
// 挂载关系：render.js 提供 renderContent，events.js 提供 bindEvents 与 unbindEvents，
// palette.js 提供 renderPalettes。

export const AdminPanel = {};

console.log('✅ AdminPanel 主对象已定义 (ES Module)');
