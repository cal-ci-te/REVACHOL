// ！贴纸系统入口
// 只对外导出 StickerFacade 与测试工厂 createStickerFacadeWithMocks。
// parser/model/renderer/security 视为内部实现，不从此处导出，避免外部绕过门面直接依赖内部结构。
export { StickerFacade, createStickerFacadeWithMocks } from './sticker-facade.js';