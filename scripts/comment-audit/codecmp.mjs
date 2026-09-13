// ！JS 代码等价校验
// 对比 HEAD 与工作区的「注释外 token 流」是否完全一致，用于证明「只改了注释」。
// 用 acorn 真实分词，而非正则，避免 `/"`、`'/api/*'` 一类取反/字符串误报。
//
// 用法：
//   node scripts/comment-audit/codecmp.mjs <文件...>     # 指定文件
//   node scripts/comment-audit/codecmp.mjs --staged      # 对比 HEAD 与工作区全部改动
//   node scripts/comment-audit/codecmp.mjs               # 同上（默认）
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// 从仓库根解析 acorn：工具可在任意工作目录下调用
const require = createRequire(resolve(process.cwd(), 'package.json'));
const acorn = require('acorn');

const SOURCE_TYPES = ['module', 'script', 'commonjs'];

function tokenize(src, sourceType) {
  const out = [];
  const tk = acorn.tokenizer(src, {
    ecmaVersion: 'latest',
    sourceType,
    allowHashBang: true,
    allowReturnOutsideFunction: true,
  });
  for (;;) {
    const t = tk.getToken();
    if (t.type.label === 'eof') break;
    out.push(t.type.label + '\u0001' + String(t.value ?? ''));
  }
  return out;
}

function tokensOf(src) {
  let lastErr;
  for (const st of SOURCE_TYPES) {
    try {
      return tokenize(src, st);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function headFile(path) {
  return execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// 默认取 HEAD 与工作区之间所有改动的 .js，避免漏检新增文件
function changedJsFiles() {
  const out = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  return out.trim().split('\n').filter((f) => f.endsWith('.js'));
}

const args = process.argv.slice(2);
const files = args.length && args[0] !== '--staged' ? args : changedJsFiles();

if (!files.length) {
  console.log('没有需要校验的 .js 文件');
  process.exit(0);
}

let fail = 0;
let pass = 0;
let skip = 0;
for (const f of files) {
  let head;
  try {
    head = headFile(f);
  } catch {
    skip++;
    console.log(`SKIP  ${f}  (HEAD 中不存在，属新增文件)`);
    continue;
  }
  const work = readFileSync(f, 'utf8');
  const a = tokensOf(head);
  const b = tokensOf(work);
  if (a.length === b.length && a.every((v, i) => v === b[i])) {
    pass++;
    console.log(`PASS  ${f}  (${a.length} tokens)`);
    continue;
  }
  fail++;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ctx = (arr) => arr.slice(Math.max(0, i - 4), i + 5).join(' | ');
  console.log(`FAIL  ${f}  HEAD:${a.length} WORK:${b.length} 首个差异 @${i}`);
  console.log(`      HEAD: ${ctx(a)}`);
  console.log(`      WORK: ${ctx(b)}`);
}
console.log(`\n等价 ${pass}，差异 ${fail}，跳过 ${skip}`);
process.exit(fail ? 1 : 0);
