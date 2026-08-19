# 📚 REVACHOL

> 原创角色档案馆 —— 一个带内容管理、贴纸装饰、水印保护、多主题切换的 Web 应用。

> 当前版本：`v1.19.0` ⚠️ WIP（开发中）

## ✨ 预览
<!-- ===== 预览 ===== -->
<h2>预览</h2>

<h3>主题</h3>
<table>
  <tr>
    <th align="center">主题</th>
    <th align="center">截图</th>
  </tr>
  <tr>
    <td align="center">暗色</td>
    <td align="center"><img src="images/screenshots/dark.png" width="500" style="max-width:100%; height:auto;" alt="暗色主题"></td>
  </tr>
  <tr>
    <td align="center">亮色</td>
    <td align="center"><img src="images/screenshots/light.png" width="500" style="max-width:100%; height:auto;" alt="亮色主题"></td>
  </tr>
  <tr>
    <td align="center">低保真</td>
    <td align="center"><img src="images/screenshots/lofi.png" width="500" style="max-width:100%; height:auto;" alt="低保真主题"></td>
  </tr>
</table>

<h3>功能</h3>
<table>
  <tr>
    <th align="center">功能</th>
    <th align="center">截图</th>
  </tr>
  <tr>
    <td align="center">目录树</td>
    <td align="center"><img src="images/screenshots/tree.png" width="300" style="max-width:100%; height:auto;" alt="目录树"></td>
  </tr>
  <tr>
    <td align="center">贴纸系统</td>
    <td align="center"><img src="images/screenshots/deco.png" width="300" style="max-width:100%; height:auto;" alt="贴纸系统"></td>
  </tr>
  <tr>
    <td align="center">移动端</td>
    <td align="center"><img src="images/screenshots/mobile.png" width="300" style="max-width:100%; height:auto;" alt="移动端"></td>
  </tr>
</table>

## ✨ 核心功能

- **文章系统**：增删改查、分类管理、可见性控制、无限滚动
- **目录树**：折叠展开、拖拽排序、右键菜单、位置管理
- **贴纸装饰**：上传自动压缩为 WebP、移动/缩放统一编辑、文章内锚点定位
- **多主题**：暗色 / 亮色 / 低保真三套，CSS 变量驱动，零网络切换
- **详情页**：标签页模式、全屏、最小化
- **管理面板**：登录、头像、背景、纹理、水印、色卡
- **滑动拼图**：可配置交互组件（尺寸/图片/位置可自定义）
- **多 Agent 协作**：CrewAI 四角色流水线（规划 → 编码 → 审查 → 文档），Git MCP 集成

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动后端（http://localhost:9999）
node backend/server.cjs

# 3. 启动前端（http://localhost:3000，另开终端）
npm run dev
```

Docker 一键部署：

```bash
docker compose up -d --build
```

## 📦 技术栈

- 前端：原生 ES Module + Vite，自研状态管理（AppState + EventBus）
- 后端：Node.js 22 + 原生 http + sql.js（SQLite）+ WebSocket
- 存储：本地文件系统 / S3 兼容对象存储（适配器模式切换）
- AI：CrewAI 多 Agent 协作（`my_first_crew/`）
- 测试：Vitest + jsdom（单元）、Playwright（端到端）

## 📚 完整文档

- [项目总览与架构](my_first_crew/knowledge/README.md)
- [更新日志](my_first_crew/knowledge/README.md#更新日志)
- [路线图](my_first_crew/knowledge/docs/roadmap.md)
- [架构文档](my_first_crew/knowledge/docs/architecture/README.md)
- [开发指南](my_first_crew/knowledge/docs/development/)
- [部署指南](my_first_crew/knowledge/docs/development/tools/docker/README.md)
- [CrewAI 多 Agent 指南](my_first_crew/knowledge/docs/development/tools/crewai/)
- [AI 协作审计](my_first_crew/knowledge/docs/ai-collaboration/)

---

> 💡 完整的架构设计、API 文档、版本历史与开发规范请查阅 `my_first_crew/knowledge/` 目录。
