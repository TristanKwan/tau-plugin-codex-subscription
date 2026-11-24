# Codex 订阅

项目名及插件 ID 为 `tau.codex-subscription`。

在 Tau 的笔记聊天中使用 ChatGPT 订阅。登录后可以从当前账号的 Codex 模型中选择，用它们讨论笔记、分析图片，或在对话中调用 Tau 工具。

- **模型选择**　将账号返回的模型添加到 Tau 的大语言模型服务商，在聊天的模型选择器中切换。
- **订阅额度**　在插件设置中查看每个额度窗口的剩余百分比、进度条和重置时间，点击「刷新」可更新数据。
- **本机连接**　插件通过本机回环地址连接 Tau，订阅令牌保存在当前电脑。

## 使用

1. 启用插件后打开「设置」。已获 Tau 授权的后台会随应用自动启动。第一次使用要在本机后台页点击“允许此版本自动运行”。
2. 点击「浏览器登录」，在 OpenAI 页面完成授权。浏览器显示「登录成功」后回到 Tau。也可以使用设备码登录。
3. 点击「添加到 Tau 模型选择器」。如果选择器尚未刷新，请重启 Tau，再在模型分配或聊天中选择 Codex 订阅下的模型。
4. 账号新增模型后，再点一次添加按钮即可。

手动配置时，服务商类型选择 OpenAI Chat Completions，Base URL 填 `http://127.0.0.1:17653/v1`，API Key 使用插件设置中复制的本机密钥。


## 从源码安装

运行 `npm ci --legacy-peer-deps`、`npm run build` 和 `npm run install:local`。构建与安装脚本来自 [Tau 插件模板](https://github.com/LastKnightCoder/tau-plugin-template)。订阅接入参考 [dsh-codex-subscription](https://github.com/WSL043/dsh-codex-subscription)。
