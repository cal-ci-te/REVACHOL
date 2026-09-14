# 注释规范化工程 · 总报告

> 日期：2026-09-13
> 范围：REVACHOL 全仓（`js/`、`backend/`、`my_first_crew/`、根级配置、`scripts/`、`tests/`、`e2e-tests/`、JSONC）
> 基线：`a059952`（Agent 开关体系落地，注释工程起点） → 随 **v1.30.0** 收尾
> 硬约束：**不改变任何代码行为**；只改注释，其余字节零改动
> 依据规范：`knowledge/docs/development/code-style.md`

---

## 一、结论摘要

| 项 | 结果 |
|---|---|
| 纳入规范化的文件 | 262 个（7 分组）+ 插件工具 5 个 |
| 模块头覆盖率 | JS/TS 家族 222/222（100%）；Python 25/25（100%）；Shell 2/2；YAML 1/1；JSONC 6/6；Dockerfile 3/3 + `.env.example` |
| 注释违规（violation） | 全仓仅 **1** 项，为 0 字节空文件（`backend/storage/migration/migrate.cjs`，既定例外） |
| 提示（warning） | 19 项（JS）+ 35 项（Python）+ 24 项（`.env.example`）+ 6 项（`crew.jsonc`），**全部为规范明确允许的类别**（见 §五） |
| 代码等价 | 全范围复核：JS 210 文件 token 等价、Python 22 文件 AST 等价、其余文本删除行全为注释；3 处差异均为独立 `fix` 提交所致 |
| 测试 | Vitest 32 文件 436 例、Pytest 52 例，全程保持通过 |
| ESLint | 各批次规则级对照基线**零新增零消除** |
| 提交 | 51 个（34 `style` / 9 `docs` / 5 `chore` / 3 `fix`） |

---

## 二、验证方法：机器校验，不靠肉眼

自研零依赖工具链（`scripts/comment-audit/`，已入库）：

| 工具 | 用途 | 依据 |
|---|---|---|
| `codecmp.mjs` | JS/CJS/MJS token 级等价 | acorn 分词，丢弃注释与空白 |
| `codecmp_py.py` | Python AST 级等价 | `ast.dump(include_attributes=False)`，**含 docstring** |
| `audit.mjs` | 注释规范审查 + 导入完整性 | acorn 注释回调 |
| `trailing_check.py` | 行尾注释检测 | `tokenize`（手写状态机必错，见手册 §六.4） |
| `move_trailing.py` | 行尾注释转前置 | 注释文本取自词法单元，不经手写字面量 |

token/AST 等价**查不出**的三项，逐文件手工补检：

1. 末尾换行状态（3 个文件无末尾换行、被原样保留）
2. 行尾空白行数与内容
3. diff 删除行是否只有注释（唯一例外：行尾注释改前置，须核验 `-`/`+` 的代码部分逐字相同）

工具自身也做**反证测试**：故意改一行代码，`codecmp.mjs` 立即 FAIL（2278 → 2283 tokens）；
只加注释则 PASS。工具若"永远 PASS"等于没有校验。

---

## 三、分组覆盖

| 批次 | 范围 | 文件 | 力度 | 模块头 |
|---|--:|--:|---|--:|
| 1~4c | `js/`（core、services、models、stores、ui、components、pages、business、mobile、puzzle、bootstrap、editor、admin） | 146 | 完整三层 | 146/146 |
| 5 | `backend/`（Node CJS） | 28 | 完整三层 | 27/28（1 个 0 字节） |
| 6 | `my_first_crew/`（Python，不含 tests） | 17 | 完整三层（`#`，docstring 保留） | 17/17 |
| 7a | 根级 JS 配置（vite / vitest / playwright / eslint / .eslintrc） | 5 | 完整三层 + BOM 处置 | 5/5 |
| 7b | 编排与镜像（compose + 3 Dockerfile + .env.example） | 5 | 完整三层（`#`） | 5/5 |
| 7c | JSONC（crew.jsonc + agents/*.jsonc） | 6 | 完整三层（`//`） | 6/6 |
| 7d | `scripts/`（2 个 `.sh` + 5 个自研工具） | 7 | 完整三层 + dogfooding | 7/7 |
| 7e | `tests/`（Vitest） | 32 | 轻量：减 + 模块头 | 32/32 |
| 7f | `e2e-tests/`（Playwright） | 9 | 轻量：减 + 模块头 | 9/9 |
| 7g | `my_first_crew/tests/`（pytest） | 5 | 轻量：减 + 模块头 | 5/5 |
| 四 | 阶段四自检发现的残留 | 9 | 修复提交 | — |

**排除项（语法不支持，非"暂缓"）**：`package.json`、`jsconfig.json`、`tsconfig.json`、`.prettierrc`、`package-lock.json`（生成物）。

**测试文件采用轻量力度的理由**：断言本身即文档，套用完整三层会产生大量"复述断言"的噪声，
违反「只写为什么」。故测试只做减法 + 每文件 1 处模块头（说明测什么 + 前置依赖）。

---

## 四、阶段四全量自检结果

### 4.1 JS / CJS / MJS（222 文件，`audit.mjs`）

- **违规 1 项**：`backend/storage/migration/migrate.cjs` 缺模块头 —— 该文件为 0 字节，无内容可改。
- **提示 19 项**，均属允许类别：英文代码片段 14（composition 示例、角色矩阵示例、被注释掉的示例配置）、
  命令示例 2、`@vitest-environment` pragma 2、注释内算式 1。
- 分隔线 0、块注释 0（唯一 1 处空 catch 块注释已在 7f 改为行注释）、emoji 0、过程标记 0、行尾注释 0。

### 4.2 Python（25 文件，tokenize 提取真实 COMMENT）

- 模块头 `# ！` 25/25；分隔线 0（阶段四清除 19 处 `# ---- 标题 ----`）；
  emoji 0（清除 1 处）；过程标记/版本记录 0。
- 行尾注释 25 处，**全部是 `# noqa: BLE001` / `# noqa: F401`**——lint 工具指令必须同行才生效，属规范例外。
- 纯英文 35 处：lint 指令 21、shebang 3、代码/JSON/命令示例 11（规范允许保留英文）。

### 4.3 Shell / YAML / Dockerfile / JSONC

| 分组 | 文件 | 模块头 | 分隔线 | emoji | 行尾注释 |
|---|--:|--:|--:|--:|--:|
| `scripts/*.sh` | 2 | 2/2 | 0 | 0 | 0 |
| `docker-compose.yml` | 1 | 1/1 | 0 | 0 | 0 |
| Dockerfile ×3 + `.env.example` + `.gitignore` | 5 | 4/5（`.gitignore` 未纳入范围） | 0 | 0 | 0 |
| JSONC | 6 | 6/6 | 0 | 0 | 0 |

JSONC 另做**语法校验**：剥离 `//` 注释并去掉尾逗号后 `json.loads` 全部通过（6/6）。

### 4.4 全范围代码等价复核（基线 `a059952` → HEAD）

| 类别 | 结果 |
|---|---|
| JS 家族 213 文件 | 210 token 等价；3 差异 = `js/admin/index.js`、`js/mobile/touch-context.js`、`js/services/article-service.js`，各 +7 tokens，正是 `3dfb66d` 的 E3~E5 补导入（`fix` 提交，非注释改动） |
| Python 22 文件 | AST 全等价（含 docstring） |
| 其他文本 14 文件 | 11 文件删除行全为注释；3 文件为已核验的改造（`crew.jsonc` 的 `/* */` → `//`；2 个 `.sh` 的 3 处行尾注释改前置——代码部分逐字相同） |
| 新增文件（基线中不存在） | 6 个（`scripts/comment-audit/` 工具与 `.pyc` 忽略规则等） |

---

## 五、残余例外登记（均为规范允许项，非缺陷）

| # | 项 | 数量 | 依据 |
|:--:|---|--:|---|
| 1 | `backend/storage/migration/migrate.cjs` 缺模块头 | 1 | 0 字节空文件，无内容可改 |
| 2 | `// @vitest-environment node` | 2 | Vitest 工具指令，必须原样且须在 import 之前；等同 `# noqa` 类例外。已用探针实测：位于 3 行模块头之后仍被识别 |
| 3 | `# noqa: BLE001` / `# noqa: F401` | 25 | lint 指令必须与代码同行；部分另附中文理由 |
| 4 | 注释内算式 `containerWidth=800, maxXPercent = (800-120)/800*100 = 85` | 1 | 代码片段，规范允许英文 |
| 5 | 英文代码片段 / 命令示例 / 被注释掉的示例配置 | 59 | 规范明确「命令示例、代码片段的英文可保留」 |
| 6 | `.gitignore` 无模块头 | 1 | 未纳入本工程范围（仅因 chore 提交被改动） |
| 7 | `js/core/component-manager.js` 句末半角逗号 | 1 | 审查器误报：该行是描述符契约列表的换行处（`… mountTimeout,`），非句末标点 |

---

## 六、发现的既有缺陷（非本工程引入，均另开 `fix` 或登记）

| 编号 | 位置 | 问题 | 处置 |
|:--:|---|---|---|
| D1~D3 | `directory-*` / `position-manager.js` | 引用 `UI.*` 未导入 → 运行时 `ReferenceError`，提示静默失效、目录树不刷新 | ✅ `1fdb48e` 修复 |
| D4/D5 | `directory-drop-handler.js` ×2、`drag-drop.js` | 恒等三元 `isSibling ? X : X` | ✅ 已简化 |
| D6 | `shape-generator.js` | 疑似除零产生 `NaN` | ⛔ 误报：循环守卫与除数是同一表达式，`NaN` 不可达，不改 |
| E3~E5 | `admin/index.js`、`touch-context.js`、`article-service.js` | 漏导入 `UI` / `Utils` | ✅ `3dfb66d` 修复（各 +1 行 import） |
| E1/E2 | `js/core/app-state.js`、`js/ui/components/detail.js` | 注释残留的 `admin`/`ui` 键从未定义；早返回后的死分支 | ⏸ 待评估可达性后另行处理 |
| B1~B5 | Agent 开关体系 | 写测试/实测才暴露：`fsyncSync` EPERM、env 覆盖被误持久化、toggle 与 GET 结构不一致、Node/Python 布尔语义不一致、入参校验形态不统一 | ✅ 全部修复 |
| P1 | `scripts/test-health.sh` | `--wait` 模式在函数外用 `local`，bash 报错并以非 0 退出，该模式实际不可用（预先存在，已实测复现） | ⏸ 仅登记不改（超出注释范畴），注释中已标注 |
| P2 | `backend/check.cjs` | UTF-16LE + BOM，Node 无法加载、ESLint 解析报错 | ✅ `9f523bb` 转码为 UTF-8（115 tokens 逐 token 一致） |

---

## 七、工程纪律（本次坚持的口径）

1. **发现代码缺陷另开 `fix`**，绝不混入 `style` 提交——3 个 `fix` 与 34 个 `style` 严格分离。
2. **不删除文件**：死配置（`.eslintrc.js`）、孤儿调试脚本（`check.cjs` / `check-tables.cjs` / `test.cjs`）、
   已弃用模块（`shape-generator.js`）一律在模块头**标注身份与处置建议**。
3. **docstring 是代码不是注释**：Python 全部保留，三层结构用 `#` 实现，`# ！` 置于 docstring 与编码声明之后。
4. **逐行定位替换，慎用整体重写**：重写会静默抹掉末尾换行、行尾空白与 BOM。
   - 4 个 BOM 文件按二进制方式保留 BOM；
   - 4 个 CRLF、3 个无末尾换行的文件按文件探测后原样保留。
5. **数字要对得上**：每次提交前用 `git show --name-only` 核对文件数；统计时区分「覆盖率」与「改动数」两个口径。

---

## 八、提交清单（`a059952` → 收尾，51 个）

### fix（3）
`1fdb48e` 目录树三缺陷 · `3dfb66d` 补齐 3 处漏导入 · `9f523bb` check.cjs 转码

### chore（5）
`6aaa8f2` 工具入库 + 导入完整性检查 · `7436185` 容错不可解析文件 · `412bc8b` Python AST 校验工具 ·
`964a167` 行尾检测改用 tokenize · `55f9617` 行尾转前置工具 · `fd424a4` 忽略 `__pycache__`

### docs（9）
`a925332` 规范统一 · `0d95fc1` / `1d89524` / `4e68c4b` / `efd103c` / `d423acb` / `311d209` 计划进度 ·
`e49a65e` 作业手册 · 本总报告

### style（34）
批次 1~4c 按架构层 7 个提交（core / services / ui / business / editor / admin）；
批次 5 按子批 8 个提交；批次 6 按模块 8 个提交；批次 7a~7g 共 7 个提交；阶段四残留修复 1 个；
另 `a215af3` 恢复 19 个文件的「无末尾换行」状态、`323ae1a` 标注孤儿脚本、`939943b` 去装饰。

---

## 九、经验与后续

方法论已提炼为可复用手册：`knowledge/docs/ai-collaboration/comment-standardization-playbook.md`
（三条底线、SOP、工具链、16 个实战坑、决策点清单、快速上手清单）。

**本次最值得记住的三条**：

1. 真正的风险不在"写注释"，而在**"只改注释"这个承诺本身**——整体重写会悄悄改动末尾换行、
   行尾空白、文件编码，而 token 等价校验对此完全无感。
2. **工具必须能报错**，且**单一工具不作为唯一依据**：JS 用 token、Python 用 AST，两者互证；
   行尾注释必须用编译器自带的 `tokenize`，手写词法规则一定会错。
3. **自检要覆盖"未被检查过的口径"**：阶段四发现的 24 处残留，全部落在前序批次未覆盖的检查项上
   （JS 侧 emoji、Python 侧分隔线——此前根本没有 Python 注释审查器）。

**待办（超出本工程范围）**：`scripts/test-health.sh` 的 `--wait` 缺陷修复；E1/E2 可达性评估；
`tests/` 中 4 组同名测试文件（`event-bus` / `app-state` / `article-service` / `auth`）的冗余清理。
