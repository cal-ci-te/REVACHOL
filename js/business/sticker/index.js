/**
 * 贴纸系统重构 — 对外入口。
 *
 * 本模块只导出一个门面类 StickerFacade 与测试工厂 createStickerFacadeWithMocks。
 * 所有内部模块（parser/model/renderer/security）均为 @internal，不得从外部访问。
 */
export { StickerFacade, createStickerFacadeWithMocks } from './sticker-facade.js';