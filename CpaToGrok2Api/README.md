<div align="center">
  <h1>Grok CPA 转 Grok2Api Json</h1>
  <p><strong>CpaToGrok2Api - Account Converter & Exporter</strong></p>
  <p>一款专为 CPA 管理平台打造的用户脚本，支持一键读取 xAI 凭据列表、实时额度检测、原生 JWT 解析与批量转换为 Grok2Api 标准 JSON 格式。</p>
</div>

---

## 🌟 核心特性

### 1. 🔍 智能感知与一键列表管理
- **登录状态智能检测**：自动监听当前页面 URL 与登录状态，登录成功后在页面右下角动态注入悬浮按钮。
- **现代化深色控制面板**：内置独立深色科技质感弹窗，清晰呈现邮箱列表、状态标签及操作按钮。
- **xAI 凭据自动过滤**：自动请求后台 `/v0/management/auth-files` 接口并精准筛选 `type === 'xai'` 的认证文件。

### 2. ⚡ 实时状态与额度健康度检测
- **并发额度健康度检查**：通过后端 API 调用（`https://cli-chat-proxy.grok.com/v1/billing`）实时测试各账号额度。
- **直观状态徽章**：检测中显示「检测中...」，正常显示翠绿「正常」徽章，失效或欠费显示鲜红「异常」徽章。

### 3. 🧩 原生纯 JS JWT 解码与格式转换
- **零依赖 JWT 解码**：基于原生 `atob` 与 `TextDecoder` 解析 `access_token` Payload，无需引入庞大的外部第三方库。
- **精准映射 Grok2Api 字段**：完整提取 `client_id`、`sub`、`principal_id`、`team_id`、`refresh_token` 等关键参数。
- **标准输出结构**：严格按照 Grok2Api 要求输出 `{ accounts: [...] }` 格式。

### 4. 📦 灵活高效的导出流转
- **单项即时导出**：单行记录点击「导出」即可下载该账号对应的独立 `.json` 文件。
- **多选与批量导出**：支持全选、反选与多选，多项一键聚合为单个 JSON 文件下载。
- **操作状态反馈**：异步操作期间自动显示「处理中...」并防重复点击。

---

## ⚙️ 脚本配置项 (Script Settings)

在脚本配置面板中可配置以下项：

| 配置参数名 | 中文标签 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `Config.password` | 密码 | 文本输入 (`text`) | `12345678` | CPA 后台接口请求鉴权 Token（Bearer 鉴权）。 |

---

## 🚀 界面与使用指南

### 1. 悬浮入口
- 访问 CPA 管理页面（`*cpa.local/moyefu*`）并完成登录。
- 页面右下角自动出现 **「OAuth列表」** 悬浮按钮，点击即可展开/折叠主面板。

### 2. 管理面板工具栏
- **全选勾选框**：一键全选或取消全选当前所有 xAI 账号。
- **刷新状态**：重新拉取最新 OAuth 列表并并发检测额度状态。
- **导出选中**：将当前勾选的账号导出合并为单个 JSON 文件。
- **导出全部**：将列表内所有账号一次性打包导出。

### 3. 导出 JSON 数据格式示例

```json
{
  "accounts": [
    {
      "provider": "grok_build",
      "name": "example@email.com",
      "client_id": "oauth2_client_xxxx",
      "access_token": "eyJhbGciOi...",
      "refresh_token": "rt_xxxx",
      "id_token": "eyJhbGciOi...",
      "token_type": "Bearer",
      "scope": "",
      "expires_at": "2029-12-30T15:15:55.189784106Z",
      "expires_in": 0,
      "email": "example@email.com",
      "sub": "user_xxxx",
      "user_id": "principal_xxxx",
      "principal_id": "principal_xxxx",
      "team_id": "team_xxxx"
    }
  ]
}
```

---

## 📋 脚本权限说明 (UserScript Metadata)

```javascript
// @match        *cpa.local/moyefu*   // 脚本匹配的目标站点
// @grant        GM_getValue          // 读取后台鉴权密码配置
// @grant        GM_setValue          // 保存配置
// @noframes                          // 禁止在子框架内运行
```

---

## 📄 开源协议 (License)

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 开源。
