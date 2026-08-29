/**
 * 贴纸 ESLint 自定义规则插件。
 */
import noInlineStickerRegexp from '../rules/no-inline-sticker-regexp.js';
import banInternalImport from '../rules/ban-internal-import.js';

export default {
  rules: {
    'no-inline-sticker-regexp': noInlineStickerRegexp,
    'ban-internal-import': banInternalImport,
  },
};
