<div align="center">
  <h1>ScriptCat Agent 悬浮聊天窗</h1>
  <p><strong>AiAgent - Floating AI Chat Assistant</strong></p>
  <p>一款专为 <strong>ScriptCat（脚本猫）Beta 版</strong> 打造的现代化、高可定制悬浮球式 AI 聊天助手，支持多会话管理、流式对话响应、历史记录本地持久化与智能白名单机制。</p>
  <p>⚠️ <strong>运行环境提示</strong>：Agent 系列 API（<code>CAT.agent.*</code>）为 ScriptCat 前沿特性，<strong>目前仅在 ScriptCat Beta（测试版）中可用</strong>，稳定版及 Tampermonkey 暂不支持。</p>
</div>

---

## 📌 环境依赖与安装

使用本脚本前，必须安装 **ScriptCat Beta 版本**：

- **Chrome 商店**：[脚本猫 Beta (Chrome Web Store)](https://chromewebstore.google.com/detail/%E8%84%9A%E6%9C%AC%E7%8C%AB-beta/jaehimmlecjmebpekkipmpmbpfhdacom?authuser=0&hl=zh-CN)
- **Edge 商店**：[ScriptCat-Beta (Edge Addons)](https://microsoftedge.microsoft.com/addons/detail/scriptcat-beta/nimmbghgpcjmeniofmpdfkofcedcjpfi)
- **Firefox 商店**：[ScriptCat-pre (Firefox Add-ons)](https://addons.mozilla.org/zh-CN/firefox/addon/scriptcat-pre/)
- **离线安装 / GitHub Releases**：[ScriptCat Releases](https://github.com/scriptscat/scriptcat/releases)
- **官方安装文档**：[ScriptCat 快速开始](https://docs.scriptcat.org/docs/use/use/)

---

## 🌟 核心特性

### 1. 🤖 深度集成 ScriptCat Agent API
- **流式对话响应**：调用 `CAT.agent.conversation` 实现打字机式实时流式对话，大幅提升交互流畅度。
- **多模型无缝切换**：动态调用 `CAT.agent.model` 获取并切换可用模型，满足不同任务需求。
- **网页 DOM 感知**：通过 `CAT.agent.dom` 具备页面元素与上下文感知交互潜力。

### 2. 🗂️ 完善的多会话与持久化存储
- **独立多会话管理**：支持创建新会话、切换历史会话、重命名会话标题及删除会话。
- **站点级会话隔离**：按网站域名（Host）独立存储和管理会话记录，不同网站互不干扰。
- **本地安全缓存**：基于 `GM_getValue` / `GM_setValue` 将聊天历史、当前模型偏好与窗口位置保存在本地。

### 3. 🎨 极致的交互与悬浮体验
- **悬浮球智能拖拽与边缘吸附**：支持全屏幕任意拖动，松手后自动记忆位置，空闲状态具备呼吸透明度（`0.65`）。
- **Markdown 精致排版与代码高亮**：完整支持 Markdown 标题、有序/无序列表、粗体、链接及代码块解析排版。
- **消息便捷交互**：单条消息支持一键复制到剪贴板、快捷重发以及问题确认交互。
- **样式隔离防护**：弹窗与组件采用高隔离 CSS 与内联安全机制，防止被目标网站样式覆盖或穿透。

### 4. 🛡️ 域名白名单与扩展菜单联动
- **白名单精准拦截**：支持配置 `Config.show_host`，未加入白名单的网站默认不加载、不打扰。
- **Tampermonkey / ScriptCat 菜单命令集成**：
  - 未激活站点：一键弹出「临时显示（仅本次）」或「永久开启（加入显示列表）」。
  - 已激活站点：提供「打开聊天窗」、「临时关闭」或「永久关闭」选项，实时写入配置生效。

---

## ⚙️ 脚本配置项 (Script Settings)

在 ScriptCat 脚本设置或配置面板中可配置以下项：

| 配置参数名 | 中文标签 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `Config.show_host` | 显示的主机 (多个用换行区分) | 多行文本 (`textarea`) | `""` (空) | 悬浮聊天窗允许运行的主机列表。留空表示**默认所有网站不显示**。支持完整 URL、域名或带 `*` 的通配符（如 `https://*.example.org*`）。每行一条。 |

---

## 🚀 界面与交互指南

### 1. 悬浮球 (Floating Ball)
- **点击**：快速展开/折叠 AI 聊天主窗口。
- **拖动**：按住悬浮球拖拽至屏幕任意位置，松开后自动记忆当前网站的位置。
- **状态显示**：空闲时半透明无干扰，鼠标悬浮时恢复清晰。

### 2. 聊天窗口操作
- **顶部操作栏**：
  - **模型选择器**：下拉切换当前会话所用的 AI 模型。
  - **新建会话**：点击快速开启全新对话流。
  - **会话历史抽屉**：点击查看、切换、重命名或删除历史会话。
  - **折叠/最小化**：收起窗口并返回悬浮球状态。
- **输入区域**：
  - 支持快捷键 `Enter` 发送消息，`Shift + Enter` 换行。
  - 生成中可随时点击「停止生成」。

### 3. 消息气泡交互
- **复制内容**：点击消息底部的复制图标快速将回答拷贝至系统剪贴板。
- **重试/重新生成**：对满意的提示词支持一键重发。

### 4. 扩展菜单集成 (GM Menu)
点击扩展栏 ScriptCat 图标中的 **「🤖 AI 助手（悬浮聊天窗）」** 菜单：
- **当前站点未加入白名单**：可选择「临时显示（仅本次）」或「永久开启（加入显示列表）」。
- **当前站点已启用**：可选择「打开聊天窗」、「临时关闭（刷新后恢复）」或「永久关闭（从显示列表移除）」。

---

## 📋 脚本权限说明 (UserScript Metadata)

```javascript
// @grant        CAT.agent.conversation // ScriptCat Agent 对话流核心 API
// @grant        CAT.agent.model        // ScriptCat Agent 模型获取与切换
// @grant        CAT.agent.dom          // ScriptCat Agent 页面 DOM 交互
// @grant        GM_getValue            // 读取会话与配置缓存
// @grant        GM_setValue            // 持久化保存会话历史与配置
// @grant        GM_registerMenuCommand // 注册浏览器扩展菜单命令
// @run-at       document-idle          // 页面空闲时加载执行
// @noframes                            // 禁止在 iframe 子框架中重复加载
```

---

## 📄 开源协议 (License)

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 开源。
