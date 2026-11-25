# Codex 订阅

项目名及插件 ID 为 `tau.codex-subscription`。

在 Tau 的笔记聊天中使用 ChatGPT 订阅。登录后可以从当前账号的 Codex 模型中选择，用它们讨论笔记、分析图片，或在对话中调用 Tau 工具。

- **模型选择**　在 Tau 的大语言模型设置中手动配置服务商，获取或添加账号模型后，在聊天的模型选择器中切换。
- **订阅额度**　在插件设置中查看每个额度窗口的剩余百分比、进度条和重置时间，点击「刷新」可更新数据。
- **本机连接**　插件通过本机回环地址连接 Tau，订阅令牌保存在当前电脑。

## 使用

1. 启用插件后打开「设置」。已获 Tau 授权的后台会随应用自动启动。第一次使用要在本机后台页点击“允许此版本自动运行”。
2. 点击「浏览器登录」，在 OpenAI 页面完成授权。浏览器显示「登录成功」后回到 Tau。也可以使用设备码登录。
3. 在插件设置的「手动配置服务商」中复制本机 API Key。
4. 打开 Tau「设置 → 大语言模型 → 服务商与模型」，点击「添加服务商 → 其他服务商」，名称可填「Codex 订阅」，接口类型选择 **OpenAI 兼容（最常见）**（即 OpenAI Chat Completions）。
5. Base URL 填 `http://127.0.0.1:17653/v1`，API Key 粘贴刚复制的本机密钥。
6. 在 Tau 中获取模型列表，或手动添加当前账号支持的模型 ID，保存后在模型分配或聊天中选择对应模型。插件的模型目录接口为 `GET http://127.0.0.1:17653/v1/models`，需使用本机 API Key 验证。
7. 账号新增模型后，在 Tau 的服务商设置中重新获取模型列表或手动添加。

服务商和模型配置由 Tau 自身保存；插件不直接读取或改写 Tau 的全局设置文件。

## 从源码安装

运行 `npm ci --legacy-peer-deps`、`npm run build` 和 `npm run install:local`。构建与安装脚本来自 [Tau 插件模板](https://github.com/LastKnightCoder/tau-plugin-template)。订阅接入参考 [dsh-codex-subscription](https://github.com/WSL043/dsh-codex-subscription)。
