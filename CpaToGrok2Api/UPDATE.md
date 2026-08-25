# 更新日志 (Changelog)

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 语义化版本规范。

---

## [0.1.0] - 2026-08-25

### 🎉 初始版本发布
- **登录状态感知与 UI 注入**：
  - 自动检测 CPA 登录状态并在右下角注入「OAuth列表」悬浮按钮；
  - 采用模块化 CSS 样式注入，构建深色质感弹出面板。
- **OAuth 文件拉取与额度健康度检测**：
  - 调用 `/v0/management/auth-files` 获取全部 OAuth 文件，过滤并展示 `xai` 类型凭据；
  - 并发调用额度查询接口，动态展示「正常」/「异常」状态徽章。
- **无依赖 JWT Payload 解码**：
  - 基于原生 `atob` 与 `TextDecoder` 实现纯前端 JWT 解析，提取关键身份字段。
- **灵活的数据导出**：
  - 支持单条账号导出为独立 JSON；
  - 支持多选与全选批量聚合导出为符合 Grok2Api 规范的 `{ accounts: [...] }` 文件。
