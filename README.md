# ModelSell CLI

在终端调用 ModelSell 的文本、图片、视频、音频和 3D 模型，也可以一键配置
Codex、Claude Code、Gemini CLI 和 OpenClaw。

Run ModelSell text, image, video, audio, and 3D models from your terminal, and
configure your coding agents with the same CLI.

[中文说明](#中文说明) · [English](#english) ·
[模型调用指南](docs/model-api.md) ·
[GitHub Releases](https://github.com/modelsell/modelsell-cli/releases/latest)

**v0.3.0** 新增 `modelsell mcp` 服务和 Codex 插件，Codex、Claude Code、Gemini CLI 等 Agent
可直接调用 ModelSell 全部模型；调用时使用每个模型自带的端点配置和文档链接；`models --compact`
输出适合 Agent 阅读的精简目录。v0.2.0 起提供模型发现与调用、流式输出、异步任务恢复、文件输入与下载、
项目别名和 Agent Skill，原有编程工具配置功能继续保留。

下载独立程序无需安装 Node.js；通过 npm 安装需要 Node.js 18+：

```sh
npm install -g modelsell-cli
```

```sh
modelsell login
modelsell models --type image
modelsell run gpt-image-2 -p '海边的小屋，水彩风格' --json
modelsell skill install
```

Open source under the [MIT License](LICENSE).

Default API base URL: `https://www.modelsell.com`

## 中文说明

### 项目功能

`modelsell` 同时提供模型 API 调用和编程工具配置。主要能力如下：

| 能力 | 命令与用途 |
| --- | --- |
| 登录管理 | `login` 验证并保存 API Key，`status` 查看配置，`logout` 清除已保存的登录信息 |
| 实时模型目录 | `models` 搜索模型，按图片、视频、3D 或协议筛选；登录后默认展示当前 Key 可用的模型 |
| 参数与协议发现 | `schema`、`run MODEL --help` 查看参数，`endpoints` 查看内置适配器和在线端点 |
| 多模态调用 | `run` 调用文本、图片、视频、音频、3D、向量、重排等能力，按模型选择协议 |
| 流式与实时会话 | `--stream` 输出文本流，`realtime` 通过 WebSocket 收发原生 JSONL 事件 |
| 异步任务管理 | `--no-wait` 提交后返回，`show` 查询，`wait` 恢复等待，`history` 查看本机任务记录 |
| 文件与结果 | `--file` 传入本地文件，`--download` 下载媒体，`--output` 保存原始响应或二进制音频 |
| 原生 API 与自动化 | `request` 调用原生路径，支持 JSON、multipart 和协议头；`--json` 便于脚本处理 |
| 项目默认值与别名 | `init` 创建 `modelsell.json`，`aliases` 查看可复用的模型和参数配置 |
| Agent Skill | `skill install` 为当前项目的 Codex / Claude Code 安装模型调用说明 |
| MCP 与 Codex 插件 | `mcp` 为 Agent 提供模型调用工具；Codex 插件内置该服务（v0.3.0） |
| 配额与价格 | `usage` 查询当前 Key 的 quota，`price` 查询公开价格元信息 |

原有配置能力支持 Codex、Claude Code、Gemini CLI、OpenClaw：

- 交互式配置：运行 `modelsell` 后按提示选择要配置的工具。
- 非交互式配置：适合脚本、自动化部署或快速初始化环境。
- 多工具统一配置：可以一次性配置全部支持的工具，也可以只配置其中一个。
- 默认模型写入：Codex、Claude Code、Gemini CLI 会写入对应默认模型。
- OpenClaw 模型配置：会写入 ModelSell 的 OpenAI Responses 与 Anthropic
  Messages 兼容模型配置。
- 安全备份：写入前会自动备份已有配置文件，备份后缀为 `.bak.<timestamp>`。

### 一键安装

macOS 和 Linux 可以使用安装脚本：

```sh
curl -fsSL https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.sh | sh
```

如果无法访问 GitHub，可以使用备用安装地址：

```sh
curl -fsSL https://static.modelsell.com/modelsell-cli/install.sh | sh
```

Windows PowerShell 可以使用安装脚本：

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.ps1 | iex"
```

如果无法访问 GitHub，可以使用备用安装地址：

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://static.modelsell.com/modelsell-cli/install.ps1 | iex"
```

macOS/Linux 安装脚本默认会把 `modelsell` 安装到：

```text
~/.local/bin/modelsell
```

Windows 安装脚本默认会把 `modelsell.exe` 安装到：

```text
%USERPROFILE%\.local\bin\modelsell.exe
```

安装完成后，请在终端输入 `modelsell` 进入配置界面。

如果输入 `modelsell` 后提示“找不到命令”或“无法识别”，可以直接使用安装器显示的完整路径。默认路径如下：

macOS / Linux：

```sh
~/.local/bin/modelsell
```

Windows PowerShell：

```powershell
& "$HOME\.local\bin\modelsell.exe"
```

Windows 安装器也会尝试把安装目录加入用户 `PATH`；重新打开 PowerShell 后即可直接输入 `modelsell`。

### 手动下载

也可以从 GitHub Releases 下载对应平台的二进制文件：

- macOS Apple Silicon: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-arm64
- macOS Intel: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-x64
- Linux ARM64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-arm64
- Linux x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-x64
- Windows x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-win-x64.exe

macOS / Linux 下载后执行：

```sh
chmod +x modelsell-darwin-arm64
./modelsell-darwin-arm64
```

Windows PowerShell 下载后执行：

```powershell
.\modelsell-win-x64.exe
```

### 模型调用快速上手

```sh
# 登录时隐藏密钥输入
modelsell login
modelsell status

# 查找当前 Key 可用的模型，查看调用参数
modelsell models
modelsell models seedance --type video
modelsell schema gpt-image-2 --json
modelsell run gpt-image-2 --help

# 文本流与图片下载
modelsell run gpt-6-sol -p '用中文解释一下什么是向量数据库' --stream
modelsell run gpt-image-2 -p '清晨海边的小屋，水彩风格' --download ./images
```

模型 ID 以 `modelsell models` 的结果和当前 Key 权限为准。未登录或加 `--all`
时展示公开目录；公开可见不代表当前 Key 有调用权限。

登录信息默认保存在 `~/.config/modelsell/credentials.json`。自动化环境可注入
`MODELSELL_API_KEY`，或通过标准输入使用 `modelsell login --key-stdin`。
API 地址默认为 `https://www.modelsell.com`，可用 `MODELSELL_BASE_URL` 或
`--base-url` 指定；已保存的 Key 只用于登录时的 API 地址。

### 视频、音频、3D 与向量

```sh
# 视频：提交任务后返回 task_id
modelsell run grok-imagine-video -p '镜头缓慢越过海面' --no-wait --json

# 将 TASK_ID 替换为返回的 task_id，恢复等待并下载视频
modelsell wait TASK_ID --download ./videos --json

# Seedance：显式选择原生协议，传入原生参数
modelsell run doubao-seedance-2-0-260128 \
  --endpoint seedance2-native-video -p '镜头缓慢越过海面' \
  -i duration=4 -i watermark=false --json

# 音乐、3D、向量
modelsell run suno_music -p '轻快的夏日纯音乐' -i make_instrumental=true --json
modelsell run Tripo/Tripo-H3.1 -p 'a small red robot' --json
modelsell run text-embedding-v4 --endpoint embeddings \
  -i 'input=["第一段文字","第二段文字"]' --json
```

语音识别和语音合成可使用文件输入与二进制输出。将下面的 `AUDIO_MODEL`
替换为支持相应协议的模型 ID：

```sh
modelsell run AUDIO_MODEL --endpoint transcription --file file=./speech.wav --json
modelsell run AUDIO_MODEL --endpoint speech -p '你好，世界' \
  -i voice=alloy --output ./speech.mp3 --json
```

### 原生参数、文件与脚本

`-p` 将提示词放入对应协议的输入字段；`-i key=value` 可重复使用，支持数组、
对象、嵌套字段，并保留显式 `0` 和 `false`。多轮消息、工具调用和多模态内容
可通过 JSON 文件完整传入；已有 `messages` 等输入字段时不要再叠加 `-p`。

```sh
modelsell run gpt-6-sol --input-file request.json --json
cat request.json | modelsell run gpt-6-sol --input-file - --json
modelsell run gpt-image-2 -p '水彩小屋' --dry-run --json

# 图片编辑使用 multipart 文件输入
modelsell run gpt-image-2 --endpoint openai-image-edit \
  --file image=./photo.png -p '替换为蓝色背景' --download ./edited

# 原生 API：示例文件包含该端点要求的完整 JSON 请求
modelsell request /v1/responses/compact --method POST --input-file compact.json --json
modelsell upload --input-file asset.json
```

JSON 参数中的显式 `@./file` 会读取文件并转为 data URI，要求目标模型支持此格式；
普通路径字符串不会自动读取。`upload` 对应平台 `/api/assets/upload`，接受供应商
定义的 JSON 资源参数，不是通用文件托管服务。

`--json` 将结果写入 stdout，进度写入 stderr；原生响应保留在 `response` 字段。
`--stream --json` 输出 JSONL 事件，调用失败返回非零退出码。
`modelsell realtime MODEL_ID` 以 JSONL 收发实时协议事件，音频编码和输入由调用者提供。

### 任务恢复与下载

```sh
modelsell show TASK_ID --json
modelsell wait TASK_ID --timeout 1200 --json
modelsell history --limit 20 --json

# 查询其他机器提交的任务时，指定对应的查询路径
modelsell wait TASK_ID --fetch-path '/v1/videos/{task_id}' --json
```

异步任务默认每 2 秒查询一次，最长等待 600 秒，可通过 `--poll-interval` 和
`--timeout` 调整。客户端超时后使用 `wait` 恢复等待，无需重复提交。
`history` 只包含本机保存的任务；`--no-wait` 返回表示提交成功，不代表生成完成。

`--download DIR` 保存生成的媒体文件，`download URL --output FILE` 下载指定结果。
下载失败会返回错误，默认不覆盖已有文件；确认替换时使用 `--force`。

### 项目别名与 Agent Skill

运行 `modelsell init` 创建当前目录的 `modelsell.json`，然后设置默认模型或别名：

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
modelsell run hero -p '适合官网的水彩插画' --download ./images
modelsell aliases --json
modelsell skill install
```

Skill 默认安装到当前项目的 `.agents/skills/modelsell/SKILL.md` 和
`.claude/skills/modelsell/SKILL.md`；可通过 `--target codex` 或 `--target claude`
选择目标。项目配置用于共享模型和参数，不存放 API Key。

### Codex 插件

本仓库同时是一个 Codex 插件市场，`plugins/modelsell` 提供 `modelsell`（模型调用）
和 `modelsell-setup`（安装与登录）两个技能，在所有项目中可用，无需逐个项目运行
`skill install`：

```sh
codex plugin marketplace add modelsell/modelsell-cli
codex plugin add modelsell@modelsell
```

插件自带 `modelsell mcp` 服务，需要先安装 CLI 并登录（`modelsell login` 或设置
`MODELSELL_API_KEY`）。MCP 服务不受 Codex 沙箱断网限制；只读工具直接可用，
`modelsell_run_model` 等可能计费的调用会请求你确认。

### 在 Agent 中使用（MCP）

`modelsell mcp` 是一个 stdio MCP 服务，让 Codex、Claude Code、Gemini CLI 等 Agent
直接调用 ModelSell 全部模型：

| 工具 | 用途 |
| --- | --- |
| `modelsell_list_models` | 按关键词、类型搜索当前 Key 可用的模型（精简输出，含文档链接） |
| `modelsell_describe_model` | 查看模型的协议、路径、参数和 `docs_url` |
| `modelsell_run_model` | 调用模型，支持 prompt、原生参数、文件上传、下载和 dry-run |
| `modelsell_get_task` | 查询或继续等待异步任务，不会重复提交 |
| `modelsell_list_tasks` | 查看本机记录的任务 |
| `modelsell_api_request` | 调用原生 API 路径 |
| `modelsell_status` | 查看登录状态（不返回 Key） |

```sh
claude mcp add modelsell -- modelsell mcp
codex mcp add modelsell -- modelsell mcp
gemini mcp add modelsell modelsell mcp
```

视频等长任务可能超过客户端的工具超时：可以调大超时（Codex 插件已设为 900 秒），
或用 `wait: false` 提交后再用 `modelsell_get_task` 继续等待。命令行里也可以用
`modelsell models --compact --json` 获取适合 Agent 阅读的精简目录。

### 配额、价格与能力范围

```sh
modelsell usage --json
modelsell price gpt-image-2 --json
modelsell endpoints --json
```

`usage` 返回当前 Key 的服务器 quota，不是账户现金余额；`price` 返回公开元信息，
不是当前用户分组的精确报价。参数帮助来自在线端点元信息和协议默认值，可能不完整；
供应商专有参数可用 `-i` 或 `--input-file` 传入。

CLI 提供 Modelsell 已接入能力的协议入口，具体可用性取决于服务端支持和 Key 权限。
目录和协议覆盖不代表每个模型均已完成真实生成验证。完整行为、协议列表及边界见
[模型调用指南](docs/model-api.md)；设计参考见 [WaveSpeed CLI 调研记录](docs/wavespeed-cli-research.md)。

### 编程工具配置

交互式配置：

```sh
modelsell
```

配置全部支持的工具：

```sh
modelsell configure --api-key sk-xxx --yes
```

只配置一个工具：

```sh
modelsell configure --target codex --api-key sk-xxx --yes
```

支持的 `--target` 值：

```text
all, codex, claude, gemini, openclaw
```

也可以通过环境变量传入 API Key：

```sh
MODELSELL_API_KEY=sk-xxx modelsell configure --yes
```

### 写入的配置文件

- Codex: `~/.codex/config.toml`、`~/.codex/auth.json`
- Claude Code: `~/.claude/settings.json`
- Gemini CLI: `~/.gemini/settings.json`、`~/.gemini/.env`
- OpenClaw: `~/.openclaw/openclaw.json`、`~/.openclaw/.env`

## English

### What It Does

`modelsell` provides direct model API access alongside coding agent setup.
Main features:

| Feature | Commands and behavior |
| --- | --- |
| Authentication | `login` validates and stores a key; `status` inspects settings; `logout` clears stored credentials |
| Live model discovery | `models` searches and filters the catalog; authenticated listings default to models available to your key |
| Parameter discovery | `schema`, `run MODEL --help`, and `endpoints` expose model metadata and protocol information |
| Multimodal requests | `run` supports text, images, video, audio, 3D, embeddings, reranking, and model-specific protocols |
| Streaming and realtime | `--stream` streams text; `realtime` exchanges native JSONL events over WebSocket |
| Async tasks | `--no-wait` returns after submission; `show`, `wait`, and `history` retrieve and resume locally recorded tasks |
| Files and outputs | `--file` supplies local files; `--download` saves media; `--output` saves raw responses or binary audio |
| Native APIs and scripting | `request` supports native paths, JSON, multipart, and protocol headers; `--json` provides structured output |
| Project aliases | `init` creates `modelsell.json`; `aliases` lists reusable model and parameter settings |
| Agent skills | `skill install` adds model invocation guidance for Codex and Claude Code in the current project |
| MCP and Codex plugin | `mcp` gives agents model invocation tools; the Codex plugin bundles it (v0.3.0) |
| Quota and pricing | `usage` retrieves key quota; `price` retrieves public pricing metadata |

Existing setup features support Codex, Claude Code, Gemini CLI, and OpenClaw:

- Interactive setup: run `modelsell` and follow the prompts.
- Non-interactive setup: useful for scripts, automation, and environment
  bootstrap.
- Multi-tool configuration: configure every supported tool at once, or choose a
  single target.
- Default model setup: Codex, Claude Code, and Gemini CLI receive their default
  model settings.
- OpenClaw model setup: writes ModelSell-compatible OpenAI Responses and
  Anthropic Messages provider configuration.
- Safe backups: existing config files are backed up before writes with a
  `.bak.<timestamp>` suffix.

### One-Line Install

On macOS and Linux, install with:

```sh
curl -fsSL https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.sh | sh
```

If GitHub is not accessible, use the fallback installer:

```sh
curl -fsSL https://static.modelsell.com/modelsell-cli/install.sh | sh
```

On Windows PowerShell, install with:

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.ps1 | iex"
```

If GitHub is not accessible, use the fallback installer:

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://static.modelsell.com/modelsell-cli/install.ps1 | iex"
```

The macOS/Linux installer writes the binary to:

```text
~/.local/bin/modelsell
```

The Windows installer writes the binary to:

```text
%USERPROFILE%\.local\bin\modelsell.exe
```

After installation, type `modelsell` in your terminal to open the setup UI.

If `modelsell` is not found or recognized, use the full path printed by the
installer. The default paths are:

macOS / Linux:

```sh
~/.local/bin/modelsell
```

Windows PowerShell:

```powershell
& "$HOME\.local\bin\modelsell.exe"
```

The Windows installer also attempts to add the install directory to your user
`PATH`. Open a new PowerShell window before trying `modelsell` again.

### Manual Download

You can also download a binary from GitHub Releases:

- macOS Apple Silicon: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-arm64
- macOS Intel: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-x64
- Linux ARM64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-arm64
- Linux x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-x64
- Windows x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-win-x64.exe

After downloading on macOS / Linux:

```sh
chmod +x modelsell-darwin-arm64
./modelsell-darwin-arm64
```

After downloading on Windows PowerShell:

```powershell
.\modelsell-win-x64.exe
```

### Model Quick Start

```sh
# Enter your key without displaying it
modelsell login
modelsell status

# Discover available models and inspect parameters
modelsell models
modelsell models seedance --type video
modelsell schema gpt-image-2 --json
modelsell run gpt-image-2 --help

# Stream text and download an image
modelsell run gpt-6-sol -p 'Explain vector databases' --stream
modelsell run gpt-image-2 -p 'A seaside cottage in watercolor' --download ./images
```

Choose model IDs from `modelsell models` according to your key's permissions.
Without a key, or with `--all`, the command shows the public catalog; visibility
does not grant access.

Credentials default to `~/.config/modelsell/credentials.json`. For automation,
inject `MODELSELL_API_KEY` or use `modelsell login --key-stdin`.
The API defaults to `https://www.modelsell.com`; override it with
`MODELSELL_BASE_URL` or `--base-url`. Stored keys are only used with the API
address they were saved for.

### Video, Audio, 3D, and Embeddings

```sh
# Submit a video task, then replace TASK_ID with the returned task_id
modelsell run grok-imagine-video -p 'A slow flight over the ocean' --no-wait --json
modelsell wait TASK_ID --download ./videos --json

# Select a native protocol and supply native parameters
modelsell run doubao-seedance-2-0-260128 \
  --endpoint seedance2-native-video -p 'A slow flight over the ocean' \
  -i duration=4 -i watermark=false --json

modelsell run suno_music -p 'An upbeat summer instrumental' -i make_instrumental=true --json
modelsell run Tripo/Tripo-H3.1 -p 'a small red robot' --json
modelsell run text-embedding-v4 --endpoint embeddings \
  -i 'input=["First passage","Second passage"]' --json
```

For transcription or speech synthesis, replace `AUDIO_MODEL` with a model that
supports the corresponding protocol:

```sh
modelsell run AUDIO_MODEL --endpoint transcription --file file=./speech.wav --json
modelsell run AUDIO_MODEL --endpoint speech -p 'Hello, world' \
  -i voice=alloy --output ./speech.mp3 --json
```

### Native Parameters, Files, and Automation

`-p` places a prompt in the selected protocol's input field. Repeatable
`-i key=value` parameters support arrays, objects, nested fields, and explicit
`0` and `false` values. Use a JSON file for conversations, tool calls, or
multimodal inputs. Do not combine `-p` with existing input fields such as `messages`.

```sh
modelsell run gpt-6-sol --input-file request.json --json
cat request.json | modelsell run gpt-6-sol --input-file - --json
modelsell run gpt-image-2 -p 'A watercolor cottage' --dry-run --json

modelsell run gpt-image-2 --endpoint openai-image-edit \
  --file image=./photo.png -p 'Replace the background with blue' --download ./edited

# Supply complete, endpoint-specific JSON request files
modelsell request /v1/responses/compact --method POST --input-file compact.json --json
modelsell upload --input-file asset.json
```

An explicit `@./file` in JSON parameters reads a local file as a data URI when
the model supports that format. Plain path strings are passed unchanged.
`upload` calls `/api/assets/upload` with provider-specific JSON resource fields;
it is not a general file hosting service.

`--json` writes results to stdout and progress to stderr, preserving the native
response in `response`. `--stream --json` emits JSONL events. Failures return
nonzero exit codes. `modelsell realtime MODEL_ID` exchanges JSONL realtime
events; callers supply encoded audio and input events.

### Resume Tasks and Save Results

```sh
modelsell show TASK_ID --json
modelsell wait TASK_ID --timeout 1200 --json
modelsell history --limit 20 --json

# Supply a polling path for tasks created on another machine
modelsell wait TASK_ID --fetch-path '/v1/videos/{task_id}' --json
```

Async tasks are polled every 2 seconds for up to 600 seconds by default; adjust
with `--poll-interval` and `--timeout`. After a client timeout, use `wait` to
resume without resubmitting. `history` only covers local records. A successful
`--no-wait` submission does not mean generation has finished.

Use `--download DIR` to save generated media or `download URL --output FILE`
to download a specific result. Download failures return errors. Existing files
are preserved unless `--force` is supplied.

### Project Aliases and Agent Skills

Run `modelsell init`, then edit `modelsell.json` in your current directory:

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
modelsell run hero -p 'A watercolor illustration for a website' --download ./images
modelsell aliases --json
modelsell skill install
```

Skills are installed into `.agents/skills/modelsell/SKILL.md` and
`.claude/skills/modelsell/SKILL.md` in the current project. Use `--target codex`
or `--target claude` to select one. Project configuration shares models and
parameters, not API keys.

### Codex Plugin

This repository is also a Codex plugin marketplace. `plugins/modelsell` ships
the `modelsell` (model invocation) and `modelsell-setup` (install and sign-in)
skills for every project, without running `skill install` per project:

```sh
codex plugin marketplace add modelsell/modelsell-cli
codex plugin add modelsell@modelsell
```

The plugin bundles the `modelsell mcp` server, so install the CLI and log in
first (`modelsell login` or `MODELSELL_API_KEY`). The MCP server is not affected
by the Codex sandbox's network block; read-only tools run directly and
potentially billable calls such as `modelsell_run_model` ask for approval.

### Use From Agents (MCP)

`modelsell mcp` is a stdio MCP server that lets Codex, Claude Code, Gemini CLI
and other agents call every ModelSell model:

| Tool | Purpose |
| --- | --- |
| `modelsell_list_models` | Search models available to your key (compact, with docs links) |
| `modelsell_describe_model` | Protocol, path, parameters and `docs_url` for a model |
| `modelsell_run_model` | Run a model with a prompt, native input, uploads, downloads or dry-run |
| `modelsell_get_task` | Check or resume an async task without resubmitting |
| `modelsell_list_tasks` | Tasks recorded on this machine |
| `modelsell_api_request` | Native API paths |
| `modelsell_status` | Login state (never returns the key) |

```sh
claude mcp add modelsell -- modelsell mcp
codex mcp add modelsell -- modelsell mcp
gemini mcp add modelsell modelsell mcp
```

Video and other long jobs can exceed a client's tool timeout. Raise it (the
Codex plugin uses 900 seconds) or submit with `wait: false` and resume with
`modelsell_get_task`. On the command line, `modelsell models --compact --json`
returns a token-light catalog for agents.

### Quota, Pricing, and Coverage

```sh
modelsell usage --json
modelsell price gpt-image-2 --json
modelsell endpoints --json
```

`usage` returns the current key's quota in server units, not an account cash
balance. `price` returns public metadata, not an exact quote for your pricing
group. Parameter help combines live endpoint metadata with protocol defaults
and may be incomplete; pass provider-specific fields with `-i` or `--input-file`.

The CLI exposes capabilities implemented by Modelsell; availability depends on
server support and key permissions. Catalog and protocol coverage does not mean
every model has been verified with a real generation request. See the
[model invocation guide](docs/model-api.md) and
[WaveSpeed CLI research notes](docs/wavespeed-cli-research.md) for details (Chinese).

### Coding Agent Setup

Interactive setup:

```sh
modelsell
```

Configure all supported tools:

```sh
modelsell configure --api-key sk-xxx --yes
```

Configure one target:

```sh
modelsell configure --target codex --api-key sk-xxx --yes
```

Supported `--target` values:

```text
all, codex, claude, gemini, openclaw
```

You can also pass the API key through an environment variable:

```sh
MODELSELL_API_KEY=sk-xxx modelsell configure --yes
```

### Written Files

- Codex: `~/.codex/config.toml`, `~/.codex/auth.json`
- Claude Code: `~/.claude/settings.json`
- Gemini CLI: `~/.gemini/settings.json`, `~/.gemini/.env`
- OpenClaw: `~/.openclaw/openclaw.json`, `~/.openclaw/.env`

## Local Development

```sh
npm install
npm link
```

Build release binaries locally:

```sh
npm run build
```
