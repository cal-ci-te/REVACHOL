// ！目录树（兼容层）
// 保留旧导入路径 ./directory.js，实际实现已拆分到 directory/ 子目录。
// 只做重新导出，不再承载逻辑，为既有调用点提供过渡期。
export { UIDirectory } from './directory/index.js';