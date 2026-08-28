# 贴纸系统重构技术方案（v1.26.0-wip）

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | 贴纸系统重构技术方案 |
| 文档版本 | v1.26.0-wip |
| 文档状态 | 已按计划完善，待 Reviewer 复核 |
| 初稿角色 | 文本处理员（TextProcessor） |
| 本次修订 | Coder（代码开发者） |
| 计划来源 | Planner 贴纸系统重构计划 |
| 关联文档 | sticker-editor.md、module-index.md、roadmap.md、version-manage.md、更新日志、契约映射表 |
| 适用范围 | src/business/sticker 及关联编辑器、阅读页 |

---

## 1. 背景与目标

### 1.1 背景

当前贴纸系统存在以下问题：

1. 解析、序列化、渲染逻辑分散在文章编辑器、全屏贴纸编辑器与阅读页等多处，存在重复实现与行为不一致。
2. 安全校验（MIME 校验）为同步阻塞式设计，部分场景可能引入不必要的网络请求，影响渲染性能。
3. 模块可见性控制不足，内部模型、解析器、渲染器可直接被外部引用，缺少统一门面入口。
4. 安全常量与安全工具混在一起，清洗与转义能力不完整，存在注入风险。
5. 浮动渲染、容器宽度为 0、resize 后未重新 clamp 等边界场景处理不一致。

### 1.2 重构目标

1. **单一数据源**：贴纸标记的解析与序列化只保留一套实现。
2. **单一标记处理**：所有贴纸标记统一经由 `parseMarkers` 处理。
3. **单一渲染核心**：文章编辑器、全屏贴纸编辑器、阅读页共用 `renderSticker`，保证所见即所得。
4. **安全不阻塞**：同步安全校验不产生网络请求；异步校验可选触发。
5. **模块边界清晰**：对外仅暴露 `StickerFacade` 统一入口，内部模块全部私有化。
6. **兼容无损**：保留旧数据格式与 id 生成策略，通过 `backfillContent` / `generateId` 实现无迁移丢失。

---

## 2. 总体架构

### 2.1 架构分层

贴纸系统重构采用**单一数据源、单一标记处理、单一渲染核心**的分层架构。核心模块集中在 `src/business/sticker` 内部私有，对外仅暴露 `StickerFacade` 统一入口。

```
┌─────────────────────────────────────────────────────────┐
│                    外部调用方                            │
│   文章编辑器 / 全屏贴纸编辑器 / 阅读页                    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                StickerFacade（唯一对外入口）              │
│        内部自实例化 parser / model / renderer / security  │
└───────┬───────────────┬────────────────┬─────────────────┘
        │               │                │
        ▼               ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐
│   parser     │ │    model     │ │      renderer         │
│ parseMarkers │ │ 数据模型      │ │      renderSticker    │
│ 序列化/反序列化│ │ id 生成      │ │ 浮动渲染 / clamp 处理  │
└──────────────┘ └──────────────┘ └──────────────────────┘
        │               │                │
        └───────────────┴────────────────┘
                        │
                        ▼
        ┌──────────────────────────────────┐
        │            security              │
        │  security-constants.js（常量）     │
        │  security-utils.js（工具）         │
        │  sanitizeSvg / escapeCssUrl      │
        │  MIME 校验 / SSRF 限制            │
        └──────────────────────────────────┘
```

### 2.2 建议目录结构与模块职责

```text
src/business/sticker/
├── index.js                     # 仅对外导出 StickerFacade
├── sticker-facade.js            # StickerFacade、createStickerFacadeWithMocks
├── model/                       # @internal：数据模型、id、兼容层
│   ├── sticker-model.js
│   ├── id-generator.js
│   └── compat.js                # backfillContent 等兼容逻辑
├── parser/                      # @internal：单一解析/序列化
│   ├── sticker-parser.js        # parseMarkers
│   └── sticker-serializer.js    # serializeOne / serializeAll
├── renderer/                    # @internal：唯一渲染核心
│   └── sticker-renderer.js      # renderSticker
└── security/                    # @internal：安全层
    ├── security-constants.js    # 安全常量单一来源
    └── security-utils.js        # MIME/SVG/CSS URL/SSRF 工具
```

| 模块 | 职责 | 可见性 |
|---|---|---|
| `StickerFacade` | 统一入口、依赖装配、对外 API | 对外导出 |
| `model` | 贴纸数据模型、id 唯一性、状态同步、旧数据兼容 | `@internal`，不对外导出 |
| `parser` | `parseMarkers` 单一解析/序列化 | `@internal`，不对外导出 |
| `renderer` | `renderSticker` 渲染核心 | `@internal`，不对外导出 |
| `security-constants.js` | 安全常量单一来源 | `@internal`，不对外导出 |
| `security-utils.js` | 安全工具（MIME 校验、SVG 清洗、CSS URL 转义、SSRF 限制） | `@internal`，不对外导出 |

> 约定：模型、解析器、渲染器、安全工具均标记 `@internal`，且不得在 `index.js` 或包入口中导出。任何外部代码只能通过 `StickerFacade` 访问贴纸能力。

### 2.3 依赖注入与测试工厂

- `StickerFacade` 内部自行实例化 `model`、`renderer`、`parser`、`security` 依赖，外部无需关心装配细节。
- 同时提供测试工厂：

```js
createStickerFacadeWithMocks({ parser, model, renderer, security })
```

- 测试工厂支持对全部依赖进行 mock 注入，确保单元测试可完全隔离，不依赖真实 DOM 或网络。
- 默认实现中，`security` 指向 `security-utils.js`；`security-utils.js` 的所有常量均来自 `security-constants.js`。

### 2.4 数据流

```
外部调用 StickerFacade
        │
        ▼
parseMarkers（单一解析/序列化）
        │
        ▼
sanitizeSvg / escapeCssUrl（安全清洗）
        │
        ▼
renderSticker（渲染核心）
```

- 文章编辑器、全屏贴纸编辑器、阅读页共用同一 `renderSticker`，保证三端渲染行为一致（所见即所得）。
- 任何贴纸内容进入渲染前必须经过安全清洗层。

---

## 3. 安全设计

### 3.1 安全常量模块（security-constants.js）

- `security-constants.js` 作为**安全常量的单一来源**。
- 所有安全相关的白名单/黑名单、协议白名单、IP 黑名单、超时时间等常量集中定义，禁止在其他模块中硬编码安全常量。
- 建议集中管理以下常量：
  - data URL 允许的 MIME 类型白名单；
  - SVG 禁止标签、禁止属性前缀、禁止协议；
  - CSS URL token 中需要转义的特殊字符集合；
  - SSRF 私有 IP/保留 IP/云元数据地址列表；
  - 异步请求默认超时时间；
  - 最大重定向次数（固定为 0）。
- 安全工具模块 `security-utils.js` 从 `security-constants.js` 读取常量，`StickerFacade` 默认注入 `security-utils`。

### 3.2 MIME 校验拆分

将原 `validateMimeType` 拆分为两个职责清晰的 API：

| API | 类型 | 说明 |
|---|---|---|
| `validateDataUrlMimeType(src)` | 同步 | 仅校验 data URL 的 MIME 类型，无任何网络请求 |
| `fetchAndValidateMimeType(src)` | 异步（可选） | 对 http/https 资源按需发起请求并校验 MIME 类型，需遵守 SSRF 限制 |

建议接口签名（最终以代码实现为准）：

```js
/**
 * 同步校验 data URL 的 MIME 类型。
 * @param {string} src - 贴纸资源地址
 * @returns {boolean}
 */
function validateDataUrlMimeType(src) {}

/**
 * 异步校验 http/https 资源的 MIME 类型。
 * @param {string} src - 贴纸资源地址
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<boolean>}
 */
async function fetchAndValidateMimeType(src, options) {}

/**
 * 同步安全断言；不发起任何网络请求。
 * @param {unknown} data - 待校验的贴纸数据
 * @throws {Error} 数据不安全时抛出异常
 */
function assertSafeStickerData(data) {}
```

约束：

- `assertSafeStickerData` **仅同步**，不阻塞渲染链路。
- 普通 `http/https` URL **默认不触发 fetch**，仅做同步白名单与语法格式检查。
- data URL 走同步 MIME 校验；http/https URL 仅在显式开启异步校验的场景（如全屏贴纸编辑器的用户主动校验）才会调用 `fetchAndValidateMimeType`。

### 3.3 SSRF 限制

异步 fetch 校验必须遵循以下限制：

| 约束 | 实现要求 |
|---|---|
| 禁止自动重定向 | 不允许跟随任何 3xx 重定向；`maxRedirects = 0` |
| 拒绝私有 IP 与元地址 | 拒绝环回地址、RFC1918 私网、链路本地地址、`::1`、`fc00::/7`、`fe80::/10`，以及 `169.254.169.254` 等云元数据地址 |
| 设置超时 | 所有异步请求必须配置超时；超时即失败 |
| DNS rebinding | 仅作最佳努力防护，需在文档与代码注释中明确说明其局限性，不承诺绝对安全 |

### 3.4 SVG 清洗与 CSS URL 转义

#### sanitizeSvg

按黑名单清洗，至少覆盖：

- `script` 元素；
- `foreignObject` 元素；
- 指向外部资源的 `use`（`href` / `xlink:href` 为外部 URL）；
- `on*` 事件属性；
- `href` / `xlink:href` 指向 `javascript:` 等危险协议；
- 其他危险协议：`javascript:`、`vbscript:`、`data:text/html` 等。

实现策略：

- 使用自研黑名单过滤器作为默认实现；
- 可选引入 DOMPurify 作为清洗后端；
- 提供“清洗后再检测”的回归测试，确保清洗结果不残留恶意内容。

#### escapeCssUrl

- 转义 CSS `url(...)` token 中的特殊字符，防止 CSS 注入；
- 覆盖空串、特殊字符、Unicode、百分号编码等边界场景；
- 对已有合法百分号编码应避免二次转义，防止破坏合法资源地址。

---

## 4. 渲染核心与编辑器收敛

### 4.1 统一渲染核心

- 文章编辑器、全屏贴纸编辑器、阅读页共用 `renderSticker` 渲染核心，不再各自维护渲染实现。
- 统一后三端贴纸的视觉表现、浮动行为、对齐逻辑完全一致。
- `StickerFacade` 对外暴露的渲染方法内部委托给 `renderer` 模块的 `renderSticker`。

### 4.2 边界处理

渲染核心必须处理以下边界场景：

| 场景 | 处理策略 |
|---|---|
| 浮动渲染 | 修复浮动模式下的尺寸与定位计算，与文档流一致 |
| `containerWidth === 0` | 降级处理：容器不可见时不进行无效计算，避免产生异常布局 |
| resize 后重新 clamp | 容器尺寸变化后重新执行右对齐 clamp 计算，保证贴纸不越界 |

### 4.3 序列化术语与 options schema

- 统一使用 `serializeOne` / `serializeAll` 术语；
- 统一 options schema，避免三端传参不一致；
- 计划、本文档、代码中的术语和参数结构必须保持一致。

---

## 5. 兼容层设计

- 保留旧数据格式的读写能力，存量贴纸数据无需迁移即可正常渲染。
- 保留旧 id 生成策略，保证新旧数据 id 语义一致、全局唯一。
- `backfillContent`：负责旧数据缺失字段的回填补齐。
- `generateId`：负责 id 生成与唯一性保证。
- 删除 `releaseIds` 模型引用重载，相关调用统一收敛到模型暴露的唯一方法；补全模型方法签名与 JSDoc。
- 兼容层统一收敛在 `model` 模块内，由 `StickerFacade` 统一暴露。

---

## 6. 技术栈

保持项目现有技术栈不变，**不引入新框架**。

| 类别 | 技术选型 | 说明 |
|---|---|---|
| 语言 | JavaScript (ES2022+) / Node.js | 现有项目技术栈 |
| 测试 | Vitest + jsdom/happy-dom | 单元测试与 DOM 环境模拟 |
| Lint | ESLint 自定义规则 | `ban-internal-import`、`no-inline-sticker-regexp` |
| 安全清洗 | DOMPurify（可选引入） | 作为 `sanitizeSvg` 清洗后端，或使用自研黑名单过滤器 |
| 安全模块 | `security-constants.js` + `security-utils.js` | 常量与工具分离 |
| 构建 | `node --check`、`eslint`、`npm run build` | 现有构建链路 |
| 版本管理 | `version-manage.md` / 更新日志 | 统一版本追踪 |

---

## 7. 里程碑计划

### M1：安全与 MIME 校验拆分

**目标**：完成安全层拆分，MIME 校验同步/异步分离，渲染链路不再被网络请求阻塞。

**任务清单**：

1. 实现 `security-constants.js`，作为安全常量单一来源。
2. 将 `validateMimeType` 拆分为：
   - 同步 `validateDataUrlMimeType(src)`；
   - 异步 `fetchAndValidateMimeType(src)`。
3. 异步校验实现 SSRF 限制：
   - 禁止自动重定向；
   - 拒绝私有 IP 与元地址；
   - 设置超时。
4. 确保 `assertSafeStickerData` 仅同步、不阻塞渲染。
5. 普通 `http/https` URL 默认不触发 fetch，仅做同步白名单/语法检查。
6. 完成安全相关单元测试。

**验收标准**：

- `security-constants.js` 为唯一常量来源，其他模块无硬编码安全常量。
- `validateDataUrlMimeType` 为纯同步函数；`fetchAndValidateMimeType` 返回 Promise。
- 异步 fetch 场景下 SSRF 拦截全部生效（重定向、私有 IP/元地址、超时）。
- `assertSafeStickerData` 执行过程中不产生任何网络请求。
- 普通 http/https 校验默认无 fetch 调用。
- 安全相关单元测试全部通过。

---

### M2：StickerFacade DI 与模块可见性

**目标**：建立统一门面入口与依赖注入能力，收紧模块可见性边界。

**任务清单**：

1. `StickerFacade` 内部自行实例化 `model` / `renderer` / `parser` / `security`。
2. 提供测试工厂 `createStickerFacadeWithMocks({ parser, model, renderer, security })`，支持依赖注入。
3. 删除 `releaseIds` 模型引用重载，并补全相关模型方法签名。
4. 子模块标记 `@internal` 且不对外导出。
5. 配置 ESLint `ban-internal-import`，限定业务目录作用域。

**验收标准**：

- 业务目录下执行 `ban-internal-import` 扫描，结果为 **0 命中**。
- 包对外入口仅暴露 `StickerFacade`，无任何内部模块泄漏。
- 测试工厂可注入全部四类依赖 mock，单元测试可完全隔离运行。
- `releaseIds` 重载已删除，模型方法签名完整、引用一致。

---

### M3：sanitizeSvg 与 escapeCssUrl 安全增强

**目标**：补齐 SVG 清洗与 CSS URL 转义能力，增强注入防护。

**任务清单**：

1. 实现 `sanitizeSvg` 黑名单过滤：
   - `script` 元素；
   - `foreignObject` 元素；
   - `use` 指向外部资源；
   - `on*` 事件属性；
   - `href` / `xlink:href` 指向 `javascript:`；
   - 其他危险协议。
2. 可选引入 DOMPurify 作为清洗后端，或使用自研黑名单过滤器。
3. 提供“清洗后再检测”的回归测试，确保清洗结果不残留恶意内容。
4. 实现 `escapeCssUrl`：转义 CSS URL token 特殊字符，并覆盖边界测试。
5. 配置 ESLint `no-inline-sticker-regexp`：
   - 覆盖 `Literal`、`RegExpLiteral`、`new RegExp`、`RegExp` call 四种形态；
   - 允许 `sticker-parser.js` 及测试中的合法正则。

**验收标准**：

- 黑名单中的元素/属性/协议全部被清洗或拒绝。
- DOMPurify 可选后端注入可用，未引入时自研过滤器正常工作。
- `escapeCssUrl` 边界测试（空串、特殊字符、Unicode、百分号编码）全部通过。
- ESLint 自定义规则扫描 0 命中，且白名单正则不受影响。

---

### M4：渲染与编辑器统一收敛

**目标**：完成单一渲染核心收敛，统一序列化术语与 options schema，关闭 WIP 实现。

**任务清单**：

1. 单一渲染核心 `renderSticker` 供文章编辑器、全屏贴纸编辑器、阅读页共用。
2. 修复浮动渲染问题。
3. 处理 `containerWidth === 0` 降级，以及 resize 后重新 clamp。
4. 统一 `serializeOne` / `serializeAll` 术语与 options schema。
5. 旧数据兼容接入，关闭并移除 WIP 临时实现。
6. Vitest 覆盖以下场景：
   - 解析；
   - 序列化；
   - 状态同步；
   - 新旧数据兼容；
   - 安全注入；
   - `StickerSerializeError`；
   - SVG 清洗/拒绝；
   - id 唯一性；
   - 右对齐 clamp；
   - `escapeCssUrl`；
   - SSRF 拦截。

**验收标准**：

- 三端（文章编辑器、全屏贴纸编辑器、阅读页）渲染结果一致。
- 浮动渲染、零宽度降级、resize 重新 clamp 测试全部通过。
- `serializeOne` / `serializeAll` 术语与 options schema 在计划、文档、代码中保持一致。
- WIP 开关已关闭，旧数据兼容路径测试通过。
- 上述 Vitest 场景全部通过。

---

### M5：文档与版本里程碑对齐

**目标**：统一版本号，同步全部关联文档，确保计划、文档、代码三对齐。

**任务清单**：

1. 统一版本为 **v1.26.0-wip**。
2. 更新以下文档：
   - `sticker-editor.md`；
   - `module-index.md`；
   - `roadmap.md`；
   - 更新日志；
   - 契约映射表。
3. 确保计划文档、本文档 §9（里程碑/契约映射表）的 M 列完全一致，章节编号引用准确。
4. 运行以下命令并确保全部通过：
   - `node --check`；
   - `eslint`；
   - `npm run build`；
   - `npm run test`。

**验收标准**：

- 版本号在代码、文档、更新日志中均为 `v1.26.0-wip`。
- 所有关联文档内容与实际实现一致。
- §9 契约映射表 M 列与计划一致，章节引用编号准确可跳转。
- 构建、Lint、测试全部通过。

---

## 8. 测试策略

### 8.1 测试环境

- 使用 Vitest + jsdom/happy-dom。
- 单元测试通过 `createStickerFacadeWithMocks` 注入 mock，隔离真实 DOM 与网络。
- ESLint 自定义规则纳入 CI 扫描，0 命中为硬性标准。

### 8.2 覆盖清单

| 编号 | 测试场景 | 关联里程碑 |
|---|---|---|
| T1 | 贴纸标记解析 | M4 |
| T2 | 序列化（serializeOne / serializeAll） | M4 |
| T3 | 状态同步 | M4 |
| T4 | 新旧数据兼容（backfillContent） | M4 |
| T5 | 安全注入防护 | M4 |
| T6 | StickerSerializeError 异常路径 | M4 |
| T7 | SVG 清洗/拒绝 | M3/M4 |
| T8 | id 唯一性（generateId） | M4 |
| T9 | 右对齐 clamp（含 resize 后重新 clamp） | M4 |
| T10 | escapeCssUrl 转义 | M3/M4 |
| T11 | SSRF 拦截 | M1 |
| T12 | 同步/异步 MIME 校验分离 | M1 |
| T13 | 模块可见性与 ban-internal-import | M2 |
| T14 | SVG 清洗后再检测回归 | M3 |
| T15 | no-inline-sticker-regexp 规则生效 | M3 |

---

## 9. 里程碑 / 契约映射表

| M 列 | 里程碑 | 关联章节 | 核心契约 |
|---|---|---|---|
| M1 | 安全与 MIME 校验拆分 | §3.1、§3.2、§3.3 | 常量单一来源；`validateDataUrlMimeType` 同步；`fetchAndValidateMimeType` 异步；SSRF 限制；`assertSafeStickerData` 同步不阻塞 |
| M2 | StickerFacade DI 与模块可见性 | §2.2、§2.3 | 仅暴露 `StickerFacade`；`createStickerFacadeWithMocks` 测试工厂；内部模块 `@internal`；`ban-internal-import` 0 命中 |
| M3 | sanitizeSvg 与 escapeCssUrl 安全增强 | §3.4 | SVG 黑名单清洗；DOMPurify 可选；CSS URL 转义；`no-inline-sticker-regexp` 规则 |
| M4 | 渲染与编辑器统一收敛 | §4、§5 | 单一 `renderSticker`；浮动渲染修复；零宽度降级；resize 重新 clamp；术语与 options schema 统一；旧数据兼容；WIP 关闭 |
| M5 | 文档与版本里程碑对齐 | §7、§9 | 版本统一 `v1.26.0-wip`；全部关联文档更新；构建/Lint/测试通过 |

> 说明：本表 M 列与 Planner 计划保持一致；后续任何里程碑调整必须同步更新本表。

---

## 10. 风险与注意事项

| 风险 | 等级 | 应对措施 |
|---|---|---|
| 旧数据格式兼容遗漏 | 中 | M4 中强制接入 backfillContent 兼容测试，存量数据样本全覆盖 |
| SSRF 防护绕过（DNS rebinding） | 中 | 文档明示仅最佳努力；禁止重定向、拒绝私有 IP/元地址、超时兜底 |
| 三端渲染收敛导致行为回退 | 中 | 统一 `renderSticker` 后建立三端一致性对比测试 |
| 安全清洗误伤合法贴纸 | 低 | 清洗后再检测回归测试；白名单合法正则保留 |
| 模块可见性破坏（内部模块被外部引用） | 低 | ESLint `ban-internal-import` 扫描纳入 CI，0 命中为硬性标准 |
| 异步校验引入性能问题 | 低 | 默认不 fetch；异步校验仅在显式场景触发 |

---

## 11. 交付物清单

1. 本文档（贴纸系统重构技术方案）。
2. 代码实现：`StickerFacade`、`parser`、`model`、`renderer`、`security-constants.js`、`security-utils.js`。
3. ESLint 自定义规则：`ban-internal-import`、`no-inline-sticker-regexp`。
4. Vitest 测试套件（覆盖 §8.2 全部场景）。
5. 文档更新：`sticker-editor.md`、`module-index.md`、`roadmap.md`、更新日志、契约映射表。
6. 版本对齐：统一为 `v1.26.0-wip`。

---

## 附录 A：关键接口草案（Coder 补充）

以下代码仅为接口约定草案，最终实现以里程碑落地为准。

```js
// src/business/sticker/index.js
export { StickerFacade } from './sticker-facade.js';
// 禁止导出任何 @internal 模块
```

```js
// src/business/sticker/sticker-facade.js
export class StickerFacade {
  constructor() {
    // 默认装配真实依赖：
    // parser、model、renderer、security(security-utils)
  }

  parseMarkers(content, options) {}
  serializeOne(sticker, options) {}
  serializeAll(stickers, options) {}
  renderSticker(sticker, options) {}
  backfillContent(oldData) {}
  generateId() {}
}

export function createStickerFacadeWithMocks({ parser, model, renderer, security }) {
  return new StickerFacade({ parser, model, renderer, security });
}
```

```js
// src/business/sticker/security/security-utils.js
export function validateDataUrlMimeType(src) {}
export async function fetchAndValidateMimeType(src, options) {}
export function assertSafeStickerData(data) {}
export function sanitizeSvg(svg, options) {}
export function escapeCssUrl(url) {}
```

---

*本文档由 Coder 依据 Planner 计划完善，后续实现与文档如有偏差，以契约映射表为基准同步修正。*