/**
 * ESLint 自定义规则：no-inline-sticker-regexp
 *
 * 禁止在业务代码中内联编写匹配贴纸标记/贴纸 DOM 的正则表达式，
 * 统一收敛到 sticker-parser.js 的 MARKER_REGEX。
 *
 * 检测三种形态：
 *   1. 正则字面量（RegExpLiteral，以及 Literal 携带 regex 的形态）
 *   2. new RegExp("...")
 *   3. RegExp("...") 调用
 *
 * 允许 sticker-parser.js 自身与测试文件中合法的正则。
 * 普通字符串字面量（import 路径、错误信息等）不在此规则范围。
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: '禁止内联贴纸标记正则，统一使用 sticker-parser.js 的 MARKER_REGEX',
    },
    schema: [],
  },
  create(context) {
    const filename =
      context.filename || (typeof context.getFilename === 'function' ? context.getFilename() : '');
    const isAllowedFile =
      filename.includes('sticker-parser.js') ||
      filename.includes('sticker-serializer.js') ||
      /\\.(test|spec)\\.(js|mjs|cjs)$/.test(filename);

    if (isAllowedFile) return {};

    const hasStickerPattern = (value) =>
      typeof value === 'string' && /sticker/i.test(value);

    // 检测动态拼接参数中是否含有贴纸相关片段（P1-6：拦截 new RegExp('...' + cls + '...')）
    const containsStickerFragment = (node) => {
      if (!node) return false;
      if (node.type === 'Literal') {
        return typeof node.value === 'string' && /sticker|article-sticker|<!--/i.test(node.value);
      }
      if (node.type === 'BinaryExpression') {
        return containsStickerFragment(node.left) || containsStickerFragment(node.right);
      }
      if (node.type === 'TemplateLiteral') {
        if (node.expressions.length > 0) return true; // 动态模板字面量
        return node.quasis.some((q) => /sticker|article-sticker|<!--/i.test(q.value.raw));
      }
      return false;
    };

    const report = (node, source) => {
      context.report({
        node,
        message: `禁止内联贴纸标记正则：${source}。请统一使用 sticker-parser.js 导出的 MARKER_REGEX。`,
      });
    };

    const checkRegExpSource = (node, pattern) => {
      if (hasStickerPattern(pattern)) report(node, pattern);
    };

    const checkRegExpArg = (node, arg) => {
      if (containsStickerFragment(arg)) report(node, '动态拼接正则');
    };

    return {
      RegExpLiteral(node) {
        if (node.regex) checkRegExpSource(node, node.regex.pattern);
      },
      Literal(node) {
        if (node.regex) checkRegExpSource(node, node.regex.pattern);
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') return;
        const arg = node.arguments && node.arguments[0];
        if (arg) {
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            checkRegExpSource(node, arg.value);
          } else if (arg.type === 'BinaryExpression' || arg.type === 'TemplateLiteral') {
            checkRegExpArg(node, arg);
          }
        }
      },
      NewExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'RegExp') return;
        const arg = node.arguments && node.arguments[0];
        if (arg) {
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            checkRegExpSource(node, arg.value);
          } else if (arg.type === 'BinaryExpression' || arg.type === 'TemplateLiteral') {
            checkRegExpArg(node, arg);
          }
        }
      },
    };
  },
};
