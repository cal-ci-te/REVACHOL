# 版本规范管理

> 适用于 v1.18.4 及以后版本 | 本文件不单独设版本号

---

## 一、版本号定义

项目版本号唯一来源：`package.json` 中的 `version` 字段。

所有版本信息从该字段读取，**禁止**在组件/模块中定义独立版本号变量。

```javascript
// ✅ 正确 — 前端从 Vite 环境变量读取
const version = import.meta.env.npm_package_version || '0.0.0';

// ✅ 正确 — 后端从 package.json 读取
const { version } = require('../package.json');

// ❌ 错误 — 硬编码版本号
const VERSION = '1.18.4';
```

---

## 二、分支策略

个人项目采用**单分支策略**（默认 `main` ）。

所有开发、修复、功能迭代均在主分支上完成，不创建长期特性分支。

> 注：短期临时分支可出于实验目的使用，验证完成后应删除。

---

## 三、WIP 版本管理

当功能未完成但需要提交代码时，采用以下标记方式：

| 位置 | 标记方式 | 示例 |
| :--- | :--- | :--- |
| **README.md** | 版本号旁标注 `⚠️ WIP` | `当前版本：v1.19.0 ⚠️ WIP（开发中）` |
| **Commit Subject** | 行首或末尾标注 `WIP` | `feat(sticker): 数据驱动架构重构 WIP` |
| **Commit Body** | 说明未完成内容 | `WIP: 多贴纸排序逻辑待完善` |

**版本号更新**：`package.json` 版本号随 WIP 提交同步递增（如 `1.18.4` → `1.19.0`），确保版本号连续性。版本号本身不标注 WIP，WIP 状态仅通过 README 和 Commit 消息表达。

---

## 四、正式发布

功能完成、测试通过后，执行以下操作完成正式发布：

1. 对于功能完整版本不使用`⚠️ WIP` 标记
2. 确认 `README.md`，`package.json` 版本号已更新
3. 更新 `README.md` 中更新日志部分记录本次变更
4. 如果有对应更新，更新 `docs/roadmap.md` 标记已完成项，并在更新 `docs/roadmap.md` 时同步修改 `docs/roadmap.md` 版本

---

## 五、变更追踪

所有变更通过项目整体 CHANGELOG 追踪，不在组件/模块中独立记录版本号。

组件级别的变更在 CHANGELOG 中按子标题分类记录。