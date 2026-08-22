我需要为当前的代码变更生成一条 Git commit message，请按照 Conventional Commits 规范撰写，阅读docs\architecture\version-manage中规范以同步更新版本。同步撰写readme的更新日志，同步更新两个readme文档的现版本号，阅读roadmap和docs下规划的在这次已经实现的内容并标记为已完成

## 项目背景
- 项目名称：[项目名称]
- 当前分支：[分支名称]
- 本次变更的性质：[新功能 / Bug修复 / 重构 / 文档 / 配置 / 测试]

## 变更内容

请根据我提供的变更描述，生成一条规范的 commit message。

### 变更描述
[请在这里描述你做了什么改动]

### 改动文件清单
[请列出本次变更涉及的文件]

### 影响范围
[请说明本次变更影响了哪些功能/模块]

## 输出要求
1. 使用 Conventional Commits 格式
2. 格式：`<type>(<scope>): <subject>`
3. subject 使用中文，简洁明了（不超过 50 字）
4. body 部分说明变更的动机和实现细节（可选）
5. footer 部分注明 Breaking Changes（如有）或关闭的 Issue（如有）

## 可用的 type 类型
| type | 说明 |
|------|------|
| feat | 新增功能 |
| fix | Bug 修复 |
| docs | 文档变更 |
| style | 代码格式（不影响功能） |
| refactor | 重构 |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具链/依赖变更 |
| ci | CI 配置变更 |

## 示例

feat(article): 新增文章全文搜索功能

- 支持在文章标题和内容中搜索关键词
- 搜索结果显示匹配片段高亮
- 搜索框添加防抖优化

Closes #123

---

请根据以上要求生成 commit message。