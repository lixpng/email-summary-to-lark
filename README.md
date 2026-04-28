# Email to Lark

监听邮箱，使用大模型总结邮件内容，将结果推送到飞书群。重要邮件自动 @指定用户。

## 功能

- **IMAP IDLE 实时监听** — 新邮件到达时立即处理，无需轮询
- **大模型总结** — 用中文简洁总结邮件，验证码原样保留，重要链接保留
- **重要邮件识别** — 自动判断邮件重要性，重要邮件飞书卡片标红并 @指定用户
- **多模型降级** — 支持配置多个模型，当前模型失败自动切换下一个
- **指数退避重试** — LLM 请求失败自动重试，带指数退避
- **RPM 限流** — 请求排队，控制每分钟请求数不超过配置上限
- **飞书卡片通知** — 邮件通知/错误通知分别使用不同颜色卡片
- **断线自动重连** — IMAP 连接断开后自动重连，重连后补取断线期间的邮件
- **Docker Compose 部署** — 一键启动

## 工作流程

```
新邮件到达 → IMAP IDLE 通知 → 提取邮件内容 → LLM 总结 → 飞书卡片推送
                                            ↓ 失败
                                      飞书错误通知（红色卡片）
```

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/lixpng/email-to-lark.git
cd email-to-lark
```

### 2. 创建配置文件

```bash
cp config.example.yaml config.yaml
```

编辑 `config.yaml`，填入你的配置：

```yaml
email:
  host: imap.gmail.com
  port: 993
  user: your-email@gmail.com
  password: your-app-password
  mailbox: INBOX
  pollInterval: 30000

llm:
  models:
    - name: gemini-2.5-flash
      baseURL: https://generativelanguage.googleapis.com/v1beta/openai
      apiKey: your-api-key
  maxRetries: 3
  rpm: 5
  prompt: "..."

feishu:
  webhookUrl: https://open.feishu.cn/open-apis/bot/v2/hook/your-hook-id
  mentionUserId: ""
  retry:
    maxRetries: 3
    retryDelay: 5000
```

### 3. 启动服务

**Docker Compose（推荐）：**

```bash
docker compose up -d
```

**本地运行：**

```bash
npm install
npm run build
npm start
```

## 配置说明

### Email

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `host` | IMAP 服务器地址 | - |
| `port` | IMAP 端口 | `993` |
| `user` | 邮箱账号 | - |
| `password` | 邮箱密码或应用专用密码 | - |
| `mailbox` | 监听的邮箱文件夹 | `INBOX` |
| `pollInterval` | 断线重连间隔（毫秒） | `30000` |

> **注意**：Gmail 等邮箱需要生成应用专用密码，不能使用登录密码。

### LLM

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `models` | 模型列表，按顺序尝试 | - |
| `models[].name` | 模型名称 | - |
| `models[].baseURL` | OpenAI 兼容 API 地址 | - |
| `models[].apiKey` | API Key | - |
| `maxRetries` | 最大重试次数 | `3` |
| `rpm` | 每分钟最大请求数 | `5` |
| `prompt` | 总结提示词模板，`{content}` 替换为邮件内容 | - |

支持所有 OpenAI 兼容的 API，包括：

- Google Gemini：`https://generativelanguage.googleapis.com/v1beta/openai`
- OpenAI：`https://api.openai.com/v1`
- DeepSeek：`https://api.deepseek.com/v1`
- 其他兼容服务

### Feishu

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `webhookUrl` | 飞书群机器人 Webhook 地址 | - |
| `mentionUserId` | 重要邮件 @的用户 ID，留空禁用 | `""` |
| `retry.maxRetries` | 发送失败最大重试次数 | `3` |
| `retry.retryDelay` | 重试间隔（毫秒） | `5000` |

## 飞书机器人设置

1. 在飞书群中添加「自定义机器人」
2. 获取 Webhook 地址填入配置
3. 如需 @人功能，需使用飞书应用机器人（自定义机器人不支持 @人）

## 许可证

MIT
