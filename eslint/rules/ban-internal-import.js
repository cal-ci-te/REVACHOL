/**
 * ESLint 自定义规则：ban-internal-import
 *
 * 禁止业务目录（js/business/**）通过相对路径导入 js/business/sticker 的内部模块
 * （parser/model/renderer/security），只允许通过对外入口 import。
 *
 * 规则在 eslint.config.js 中限定作用域：files 指向 js/business 下所有 JS 文件，
 * 并通过 ignores 排除内部模块、facade 入口及测试目录。
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止业务代码导入 sticker 内部模块，仅允许通过 StickerFacade 入口访问',
    },
    schema: [],
  },
  create(context) {
    const filename =
      context.filename || (typeof context.getFilename === 'function' ? context.getFilename() : '');

    const isInternalModule =
      /\/js\/business\/sticker\/(model|parser|renderer|security)\//.test(filename) ||
      filename.endsWith('/js/business/sticker/index.js') ||
      filename.endsWith('/js/business/sticker/sticker-facade.js');

    if (isInternalModule) return {};

    const report = (node, value) => {
      context.report({
        node,
        message: `禁止导入 sticker 内部模块：${value}。请改为从 'js/business/sticker/index.js' 导入 StickerFacade。`,
      });
    };

    const isInternalPath = (value) =>
      /(^|\/)business\/sticker\/(model|parser|renderer|security)\//.test(value) ||
      /\.\.\/sticker\/(model|parser|renderer|security)\//.test(value);

    return {
      ImportDeclaration(node) {
        const value = node.source.value;
        if (isInternalPath(value)) report(node, value);
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        if (node.callee.name !== 'require' && node.callee.name !== 'import') return;
        const arg = node.arguments && node.arguments[0];
        if (arg && arg.type === 'Literal' && isInternalPath(arg.value)) {
          report(node, String(arg.value));
        }
      },
    };
  },
};
