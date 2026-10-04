# ModelSell CLI 模型调用指南

0.2.0 在原有 Agent 配置功能上增加模型调用命令。直接运行 `modelsell`、
`modelsell configure` 或 `modelsell config` 仍然使用原来的配置流程。
新命令不会修改 Claude Code、Codex、Gemini CLI 或 OpenClaw 的配置。

## 安装

独立程序和安装脚本见 [GitHub Releases](https://github.com/modelsell/modelsell-cli/releases/latest)。
也可用 npm 安装：

```sh
npm install -g modelsell-cli
modelsell --version
```

这是 GitHub 托管的 npm 格式包；不要使用尚未发布到 npm 注册中心的包名安装命令。

### 从源码安装

需要 Node.js 18+。从本仓库安装：

```sh
npm install
npm link
modelsell --version
```

也可直接运行 `node bin/modelsell.js`，或使用 `npm run build` 生成的独立程序。
打包文件可以通过 `npm install -g ./dist/modelsell-cli-0.3.0.tgz` 安装。
发布文件同时提供 `SHA256SUMS`，可用于核对下载完整性。

## 登录与发现模型

```sh
modelsell login
modelsell models
modelsell models seedance --type video
modelsell run gpt-image-2 --help
modelsell schema gpt-image-2 --json
```

`login` 隐藏输入密钥，先用 `/v1/models` 验证，再存储到
`~/.config/modelsell/credentials.json`。文件权限为 0600。
自动化环境使用 `MODELSELL_API_KEY`，也可把密钥通过标准输入传给
`modelsell login --key-stdin`。不要把真实密钥写进项目文件。

API 地址默认 `https://www.modelsell.com`，可以通过 `MODELSELL_BASE_URL` 或
`--base-url` 指定；结尾的 `/v1` 会自动去掉。存储的密钥只用于登录时的地址。
显式设置环境变量密钥时，它用于本次指定的地址。

`models` 实时合并 `/api/pricing` 的元信息和 `/v1/models` 的 Key 可用列表。
登录后默认展示该 Key 的模型；未登录或加 `--all` 时展示公开目录。
公开目录可见不等于 Key 有权限，实际调用仍由网关执行权限与计费检查。
`--type` 支持类别、输出模态或端点类型，例如 `video`、`image`、`3d`、`anthropic`。

## 运行模型

```sh
# 文本与流式文本
modelsell run gpt-6-sol -p '用中文解释一下什么是向量数据库'
modelsell run gpt-6-sol -p '写一首短诗' --stream

# 图片：返回结果链接，或保存实际文件
modelsell run gpt-image-2 -p '清晨海边的小屋，水彩风格' --json
modelsell run gpt-image-2 -p '清晨海边的小屋，水彩风格' --download ./images

# 视频：默认等待任务完成，也可以只提交
modelsell run grok-imagine-video -p '镜头缓慢越过海面' --no-wait --json
modelsell wait <返回的任务ID> --download ./videos --json

# Seedance 原生协议与复杂参数
modelsell run doubao-seedance-2-0-260128 \
  --endpoint seedance2-native-video -p '镜头缓慢越过海面' \
  --duration 4 --watermark false --json

# 3D：保留 Tripo 的原生 input / parameters 结构
modelsell run Tripo/Tripo-H3.1 -p 'a small red robot' --json

# 向量
modelsell run text-embedding-v4 --endpoint embeddings \
  -i 'input=["第一段文字","第二段文字"]' --json

# Suno / Midjourney
modelsell run suno_music -p '轻快的夏日纯音乐' -i make_instrumental=true --json
modelsell run mj_imagine -p 'a watercolor village' --json
```

示例模型以当前 Key 的 `models` 结果为准。Modelsell 模型 ID 可以包含 `/`，
也可以不包含 `/`；不存在的别名会作为模型 ID 解析。

### 原生参数与不同协议

`--endpoint` 可选 `openai`、`openai-response`、`anthropic`、`gemini`、
`image-generation`、`openai-image-edit`、`openai-video`、`videos`、
`seedance2-native-video`、`speech`、`transcription`、`translation`、
`embeddings`、`gemini-embedding`、`jina-rerank`、`moderations` 等。
`modelsell endpoints --json` 同时展示内置适配器和服务器声明的端点。
服务器新增有路径配置的端点时，CLI 可直接使用，无需先加入静态模型名单。

参数合并优先级为：别名默认输入 → JSON 文件 → `-i` → 动态参数 → `-p`。
`-i` 的值按 JSON 解析，无法解析时保留为字符串；需要字符串 `0` 时使用
`-i 'field="0"'`。显式 `0`、`false`、空字符串、数组和对象均保留。
支持 `-i metadata.example=false` 形式的嵌套字段。

```sh
# tools / 多轮消息 / 多模态内容可以完整透传
modelsell run <模型ID> --endpoint anthropic --input-file request.json --json

# 标准输入 JSON
cat request.json | modelsell run <模型ID> --input-file - --json

# 不提交，查看实际请求形状
modelsell run <模型ID> -p '原样保留的提示词' --dry-run --json
```

`-p` 只按协议放入 `messages`、`input`、`contents` 或 `content` 等字段；
不会改写提示词。已经传入这些字段时，不要再使用 `-p`。
Anthropic 缺省 `max_tokens` 为 4096，可显式覆盖。

`schema_source=live-endpoint-metadata` 表示参数来自在线端点元信息；
`protocol-defaults` 表示协议通用提示。当前平台并没有每个模型的完整 JSON Schema，
这些帮助可能不完整，也不保证同一协议的每个模型都支持每个可选参数。
未知 `--flag` 会报错；已核实的供应商专有字段可以用 `-i` 或 JSON 文件透传。

### 文件、音频和资源上传

JSON 参数中的显式 `@./file` 会转换成 data URI；普通路径字符串不会自动读取。
`@@text` 表示字面量 `@text`。这种方式要求模型支持 data URI，单个本地文件最多 100 MiB。
它不会自动上传到公共 CDN。

```sh
modelsell run <图片模型> -p '保留人物，替换背景' -i image=@./photo.png --json

# 图片编辑和语音识别使用 multipart 文件字段
modelsell run <图片编辑模型> --endpoint openai-image-edit \
  --file image=./photo.png -p '替换为蓝色背景' --download ./edited
modelsell run <语音识别模型> --endpoint transcription --file file=./speech.wav --json

# 语音合成返回二进制，提交前必须指定输出文件
modelsell run <语音合成模型> --endpoint speech -p '你好，世界' \
  -i voice=alloy --output ./speech.mp3 --json
```

MiMo 音频模型使用 Chat Completions；请根据其文档通过 JSON 文件提供音频输入、
`audio` 和 `modalities`，不要强制改成 OpenAI `/audio/speech`。

`modelsell upload --input-file asset.json` 是平台 `/api/assets/upload` 的原生入口。
当前 Seedance 资源接口使用 `url`、`asset_type` 等 JSON 字段；具体路由选择字段与
返回格式以对应模型文档为准。它不是任意文件都能上传的通用存储服务。
其他资源协议使用 `modelsell request /原生路径`。

### 特殊操作的完整入口

```sh
modelsell request /v1/responses/compact --method POST --input-file compact.json --json
modelsell request /v1/videos/<视频ID>/remix --method POST --input-file remix.json --json
modelsell request /mj/submit/action --method POST --input-file mj-action.json --json
modelsell request /api/assets/<资源ID> --json
```

`request` 默认 GET，不依赖模型目录，支持 GET/POST/PUT/PATCH/DELETE/HEAD、JSON、
multipart、自定义协议头、SSE 和二进制输出。`--path` 也可以覆盖 `run` 的提交路径。
只接受配置地址上的相对路径，不向模型元数据提供的外部主机转发 Key。
未在 Modelsell 服务端实现的能力不会由 CLI 自动补齐。

`modelsell realtime <模型ID>` 连接 `/v1/realtime?model=...`，标准输入每行一个
原生 JSON 事件，标准输出每行一个服务器事件。支持会话配置、音频追加与工具事件，
不会启动麦克风采集。输入 EOF 后继续接收，直到服务器关闭、超时或 Ctrl+C；
音频编码与结束事件由调用者按协议提供。

## 异步任务与结果

CLI 适配通用视频、OpenAI Video、Seedance、Tripo、Suno、Midjourney 及异步图片的
任务形状，默认每 2 秒轮询，最长等待 600 秒。可用 `--poll-interval` / `--timeout` 调整。

```sh
modelsell show <任务ID> --json
modelsell wait <任务ID> --timeout 1200 --json
modelsell history --limit 20 --json

# 其他机器创建的任务，或自定义原生任务
modelsell wait <任务ID> --fetch-path '/v1/videos/{task_id}' --json
```

任务记录保存在配置目录的 `tasks/`，按 API 地址和任务 ID 隔离，权限为 0600；
记录包含服务器响应，可能包含生成内容。`history` 仅为本机记录，不是账户全部历史。
`logout` 清除持久登录信息，不删除任务记录；环境变量密钥仍由当前 shell 管理。

提交 POST 不自动重试。GET 轮询遇到 429/502/503/504 会在等待窗口内重试。
超时返回非零退出码和任务 ID，使用 `wait` 恢复；不要因客户端超时重复提交。
`--no-wait` 表示已提交，不能当作生成成功。

`--json` 非流式输出包含 `model`、`outputs`、`response`、`elapsed_ms`，
异步任务另有 `task_id`、`status`、`fetch_path`。`response` 保留原生响应。
`--stream --json` 和 `realtime` 输出 JSONL 事件；错误也会输出错误对象并返回非零状态。
进度信息写到 stderr，可以安全管道处理 stdout。

`--download DIR` 下载返回的媒体链接和嵌入图片。下载成功才记录本地文件；
远程 404、下载中断等会返回失败，不会把任务成功误报为文件已交付。
默认不覆盖文件，可用 `--force` 明确替换。视频等二进制采用流式写盘。
直接下载使用 `modelsell download URL --output FILE`。
外部下载地址不会收到 API Key；带认证请求不自动跟随重定向。

## 团队别名与 Agent

`modelsell init` 创建当前目录的 `modelsell.json`，已有文件默认不覆盖。

```json
{
  "defaultModel": "hero",
  "aliases": {
    "hero": {
      "model": "gpt-image-2",
      "endpoint": "image-generation",
      "input": { "size": "1024x1024" }
    }
  }
}
```

```sh
modelsell run hero -p '适合官网的水彩插画' --json
modelsell aliases --json
modelsell skill install
```

Skill 默认写入当前项目的 `.agents/skills/modelsell/SKILL.md` 和
`.claude/skills/modelsell/SKILL.md`，可用 `--target codex|claude` 限定目标。
已编辑的 Skill 默认不覆盖；相同内容重复安装是幂等的。
项目配置不能提供密钥或改变 API 地址，避免把 Key 发往项目指定的外部主机。

## 配额与价格

`modelsell usage --json` 查询当前 API Key 的额度，单位为服务器 quota，
不是账户现金余额。`modelsell price <模型ID> --json` 返回公开价格元信息，
不会自行执行计费表达式，也不会把公开价格当作当前用户所属分组的精确报价。
实际结算以平台记录为准。

## 验证边界

本地测试覆盖协议请求、显式零值、权限目录、SSE、WebSocket、文件上传和下载、
任务轮询/恢复、失败/超时、凭据保存与原有 Agent 配置。
2026-09-27 通过线上只读接口取得 198 个公开模型，全部能解析到 CLI 协议入口；
其中实时模型使用 `realtime`，其余使用 `run` 或原生请求。
这不表示已经对 198 个模型逐个完成付费生成。供应商实际参数支持、Key 分组权限和
生成结果质量仍需使用目标账户做真实调用验证。
