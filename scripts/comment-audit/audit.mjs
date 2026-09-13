// 注释工程自检工具：注释规范审查 + 导入完整性审查。
//
// 用法：
//   node scripts/comment-audit/audit.mjs <文件...>        # 注释规范审查（指定文件）
//   node scripts/comment-audit/audit.mjs --changed        # 注释规范审查（git 改动的 .js）
//   node scripts/comment-audit/audit.mjs --imports        # 导入完整性审查（扫描 js/）
//   node scripts/comment-audit/audit.mjs --all            # 两项都跑
//
// 退出码：0 无违规；1 存在违规（便于接入 CI 或提交前自检）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));

// 解析 acorn：先在工作目录找，找不到再回落到本脚本所在仓库
// 这样工具可被拷到任意 worktree 中运行（回验历史版本即依赖此点）
function loadAcorn(baseDir) {
  for (const base of [baseDir, SELF_DIR]) {
    try {
      return createRequire(resolve(base, 'package.json'))('acorn');
    } catch {
      // 试下一个候选位置
    }
  }
  throw new Error('无法解析 acorn：请在仓库根目录下运行，或用 --root 指定仓库根');
}

const args = process.argv.slice(2);
const rootFlag = args.indexOf('--root');
const CWD = rootFlag !== -1 ? resolve(args[rootFlag + 1]) : process.cwd();
const acorn = loadAcorn(CWD);

const SOURCE_TYPES = ['module', 'script', 'commonjs'];

// ===== 通用：AST 解析 =====

function parseComments(src) {
  let lastErr;
  for (const st of SOURCE_TYPES) {
    const comments = [];
    try {
      acorn.parse(src, {
        ecmaVersion: 'latest',
        sourceType: st,
        allowHashBang: true,
        allowReturnOutsideFunction: true,
        onComment: (block, text, start, end) => comments.push({ block, text, start, end }),
      });
      return comments;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function parse(src) {
  let lastErr;
  for (const st of ['module', 'script']) {
    try {
      return acorn.parse(src, {
        ecmaVersion: 'latest',
        sourceType: st,
        allowHashBang: true,
        allowReturnOutsideFunction: true,
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// 手写简版 AST walker，避免引入额外依赖
function walkNodes(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walkNodes(c, visit));
    else if (v && typeof v.type === 'string') walkNodes(v, visit);
  }
}

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// ===== 检查一：注释规范 =====

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
const CJK_ONLY = /[\u4e00-\u9fff]/;
const TAGS = [/@author/i, /@param/i, /@returns?/i, /@typedef/i, /@internal/i, /@type\b/i, /\bMODIFIED\b/, /\[MODIFIED\]/, /v\d+\.\d+\.\d+/];

function checkComments(files) {
  let violations = 0;
  let warnings = 0;
  const skipped = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // 解析失败的文件不计为违规：可能是编码异常（如 UTF-16 无 BOM）或非 JS 内容。
    // 单独列出而非抛出，避免一个坏文件中断整批检查。
    let comments;
    try {
      comments = parseComments(src);
    } catch (err) {
      skipped.push(f);
      console.log(`  - ${relative(CWD, f)} 跳过（无法解析：${err.message.split('\n')[0]}）`);
      continue;
    }
    const issues = [];
    const warns = [];

    // 二分查找行首，用于判定是否行尾注释
    const lineStarts = [0];
    for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
    const isLineStart = (pos) => {
      let lo = 0;
      let hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= pos) lo = mid;
        else hi = mid - 1;
      }
      return src.slice(lineStarts[lo], pos).trim() === '';
    };

    // 模块头：首个注释须位于文件开头且以 ！ 起
    const first = comments[0];
    if (!first || first.block || first.start > 4 || !first.text.trimStart().startsWith('！')) {
      issues.push('缺少模块头（首行应为 `// ！<模块定位>`）');
    }

    for (const c of comments) {
      const t = c.text;
      const label = `L${src.slice(0, c.start).split('\n').length}`;
      if (c.block) issues.push(`${label} 块注释`);
      if (/^\s*[=\-*_~#]{3,}/.test(t)) issues.push(`${label} 分隔线`);
      if (EMOJI.test(t)) issues.push(`${label} emoji`);
      for (const re of TAGS) if (re.test(t)) issues.push(`${label} 过程标记/版本记录 ${re}`);
      if (!c.block && !isLineStart(c.start)) issues.push(`${label} 行尾注释`);
      if (CJK_ONLY.test(t) && /[,.;:!?]\s*$/.test(t.replace(/`[^`]*`/g, ''))) warns.push(`${label} 中文注释疑似半角句末标点`);
      if (!CJK.test(t) && t.replace(/[^A-Za-z]/g, '').length > 3) warns.push(`${label} 纯英文/无中文注释`);
    }

    if (issues.length) {
      violations += issues.length;
      console.log(`\u2717 ${relative(CWD, f)}`);
      issues.forEach((m) => console.log(`    ${m}`));
    }
    if (warns.length) {
      warnings += warns.length;
      console.log(`  ~ ${relative(CWD, f)}`);
      warns.forEach((m) => console.log(`    ${m}`));
    }
    if (!issues.length && !warns.length) console.log(`\u2713 ${relative(CWD, f)}`);
  }
  const tail = skipped.length ? `，跳过 ${skipped.length} 个不可解析文件` : '';
  console.log(`\n[注释规范] 违规 ${violations} 项，提示 ${warnings} 项${tail}`);
  return violations;
}

// ===== 检查二：导入完整性（未导入即引用）=====
//
// 背景：此类缺陷已在本项目出现 5 次，且形态完全一致——
//   D1  directory-pending-moves.js  引用 UI.*    未导入
//   D2  directory-drop-handler.js   引用 UI.*    未导入
//   D3  position-manager.js         引用 UI.*    未导入
//   E3  admin/index.js              引用 UI.*    未导入（7 处）
//   E4  touch-context.js            引用 Utils.* 未导入
//   E5  article-service.js          引用 Utils.* 未导入
// 均在运行时抛 ReferenceError，且可长期潜伏（D1~D3 潜伏了多个版本）。
//
// 判定口径（宁可漏报也不误报，避免工具自身制造噪音）：
//   1. 候选符号 = 全项目 `import ... from './相对路径'` 出现过的具名符号
//   2. 某文件「已声明」= 该文件内任意层级声明过的名字（含 export 包装内的声明）
//   3. 某文件「被引用」= 以候选符号为根的成员访问（Sym.x / Sym[x]）或 new/call
//   4. 报告条件 = 被引用 且 未声明
//
// 已验证：在 d5f17f2（D1~D3 修复前）上运行，确实报出 D1/D2/D3 三个文件。

function checkImports() {
  const dir = join(CWD, 'js');
  const files = walkFiles(dir);

  // 读取并解析；解析失败的返回 null，由调用方跳过（与注释审查保持同一容错口径）
  const readAst = (f) => {
    try {
      return parse(readFileSync(f, 'utf8'));
    } catch {
      return null;
    }
  };

  // 第一遍：收集全项目被导入的具名符号
  const candidates = new Set();
  for (const f of files) {
    const ast = readAst(f);
    if (!ast) continue;
    for (const n of ast.body || []) {
      if (n.type !== 'ImportDeclaration') continue;
      // 仅统计项目内相对路径导入，外部依赖不参与
      if (!String(n.source.value).startsWith('.')) continue;
      for (const s of n.specifiers) {
        if (s.type === 'ImportSpecifier') candidates.add(s.imported.name);
        else if (s.local && s.local.name) candidates.add(s.local.name);
      }
    }
  }

  // 第二遍：逐文件比对「被引用」与「已声明」
  const findings = [];
  const skipped = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const ast = readAst(f);
    if (!ast) {
      skipped.push(f);
      continue;
    }

    // 已声明：必须全树遍历。`export const X = {}` 是 ExportNamedDeclaration 包着
    // VariableDeclaration，只看顶层节点会漏掉所有导出符号，把模块自身的导出对象
    // 误报成未导入（初版因此产生 88 处假阳性）
    const declared = new Set();
    walkNodes(ast, (n) => {
      if (n.type === 'ImportDeclaration') {
        for (const s of n.specifiers) if (s.local && s.local.name) declared.add(s.local.name);
      }
      if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ClassDeclaration') && n.id) {
        declared.add(n.id.name);
      }
      if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier') declared.add(n.id.name);
    });

    const used = new Map();
    walkNodes(ast, (n) => {
      let name = null;
      if (n.type === 'MemberExpression' && n.object && n.object.type === 'Identifier') {
        name = n.object.name;
      } else if (n.type === 'NewExpression' && n.callee && n.callee.type === 'Identifier') {
        name = n.callee.name;
      } else if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier') {
        name = n.callee.name;
      }
      if (name && candidates.has(name) && !declared.has(name)) {
        const line = src.slice(0, n.start).split('\n').length;
        if (!used.has(name)) used.set(name, []);
        used.get(name).push(line);
      }
    });

    if (used.size) findings.push({ file: f, used: [...used.entries()] });
  }

  if (!findings.length) {
    console.log(`\u2713 js/ 下 ${files.length} 个文件均无「未导入即引用」问题`);
    const skipTail = skipped.length ? `（跳过 ${skipped.length} 个不可解析文件）` : '';
    console.log(`\n[导入完整性] 违规 0 项${skipTail}`);
    return 0;
  }

  let total = 0;
  for (const { file, used } of findings) {
    console.log(`\u2717 ${relative(CWD, file)}`);
    for (const [name, lines] of used) {
      total += lines.length;
      const shown = lines.slice(0, 8).join(', ');
      const more = lines.length > 8 ? ` …共 ${lines.length} 处` : '';
      console.log(`    '${name}' 未导入却被引用（L${shown}${more}）`);
    }
  }
  console.log(`\n[导入完整性] ${findings.length} 个文件、${total} 处「未导入即引用」`);
  return total;
}

// ===== 入口 =====

const wantAll = args.includes('--all');
const wantImports = args.includes('--imports') || wantAll;
const wantChanged = args.includes('--changed');

// 注释审查的目标文件：显式文件参数 > --changed 的 git 改动 > 无
// 注意 rootValue 仅在 --root 存在时非空，否则 args[rootFlag+1] 会因 rootFlag=-1
// 退化为 args[0]，把首个文件名误当作 --root 的值而过滤掉
const rootValue = rootFlag !== -1 ? args[rootFlag + 1] : null;
const explicit = args.filter((a) => !a.startsWith('--') && a !== rootValue);
let commentTargets = explicit;
if (!commentTargets.length && wantChanged) {
  const out = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: CWD, encoding: 'utf8' });
  commentTargets = out.trim().split('\n').filter((f) => f.endsWith('.js'));
}

const runComments = !wantImports || wantAll || (explicit.length > 0 && !wantImports);

let violations = 0;
if (runComments && commentTargets.length) {
  violations += checkComments(commentTargets);
  if (wantImports) console.log('');
}
if (wantImports) {
  violations += checkImports();
}

if (!runComments && !wantImports) {
  console.log('未指定检查项。用法见文件头注释（--imports / --all / --changed / <文件...>）');
}

process.exit(violations ? 1 : 0);
