# WaveSpeed CLI 调研与 ModelSell 实现

调研日期：2026-09-27。

资料：

- [WaveSpeed CLI 产品页](https://wavespeed.ai/zh-CN/cli)
- [官方开源仓库](https://github.com/WaveSpeedAI/wavespeed-cli)
- [run 命令实现](https://github.com/WaveSpeedAI/wavespeed-cli/blob/main/src/commands/run.ts)
- [目录与异步 API 实现](https://github.com/WaveSpeedAI/wavespeed-cli/blob/main/src/lib/api.ts)
- [ModelSell 原有 CLI 文档](https://docs.modelsell.com/zh/docs/apps/modelsell-cli)

WaveSpeed 以统一预测 API 为基础，模型目录内含输入 Schema，CLI 围绕模型发现、
参数检查、提交和查询提供一致体验。其开源项目使用 TypeScript、Commander 及官方 SDK，
同时提供项目别名、文件上传、结果下载、JSON 输出和 Agent Skill。

ModelSell 的服务端同时暴露 OpenAI、Anthropic、Gemini 和多种异步任务协议，
因此使用原有 JavaScript CLI 增量扩展。新增代码独立实现，没有复制 WaveSpeed 源代码。

| 能力 | ModelSell 0.2.0 实现 |
| --- | --- |
| 目录 | 实时公开元信息，加 API Key 可用模型列表；不硬编码模型白名单 |
| 参数帮助 | 实时端点参数与通用协议提示，明确标注 Schema 可能不完整 |
| 统一入口 | `run` 自动选择协议；`--endpoint`、`request` 保留原生能力 |
| 异步生成 | 按实际任务形状轮询，记录 ID，超时后可以恢复 |
| 脚本输出 | 非流式单个 JSON；SSE/Realtime 使用 JSONL；stderr 输出进度 |
| 本地文件 | 显式 data URI 与 multipart；资源 API 使用原生 JSON |
| Agent | 分发项目 Skill；保留既有 Agent 配置命令 |
| 价格与配额 | 展示真实公开元信息与 Key quota；不臆造精确报价或现金余额 |

在线公开目录中，部分视频、向量、Suno、Midjourney 的端点仍标为 `openai`。
CLI 用模型类别、已确认的协议族和必要的名称规则修正路由；显式 `--endpoint`
优先级最高。可灵目录的 `/kling` 只是协议族路径，通用调用使用后端已注册的
`/v1/video/generations`。MiMo 音频保留 Chat Completions 请求结构。

实现依据为 new-api 当前路由与 DTO：`router/relay-router.go`、
`router/video-router.go`、`controller/model.go`、`controller/token.go`、
`common/endpoint_defaults.go`、`dto/task.go`、`dto/suno.go`、
`dto/midjourney.go` 及 configurable 原生视频/资源配置。

CLI 的完整协议入口不等于服务端的每个上游都支持全部参数。此版本没有修改生产路由、
计费或元数据；没有将未实现的 `/v1/files`、fine-tuning 等接口宣称为可用能力。
接口合约测试和公开目录核对的具体边界见 [使用指南](model-api.md)。
