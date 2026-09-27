# ModelSell CLI

Version 0.2.0 adds direct model invocation: live model discovery, text/image/video/audio/3D
requests, streaming, resumable tasks, file inputs, downloads, and Agent skills.
The existing configuration workflow is preserved.

**模型调用新功能：** 请看 [模型调用指南](docs/model-api.md) 与
[WaveSpeed CLI 调研记录](docs/wavespeed-cli-research.md)。
通过 [GitHub Releases](https://github.com/modelsell/modelsell-cli/releases/latest)
下载独立程序，或直接安装 Release 中的 npm 格式包：

```sh
npm install -g https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/modelsell-cli-0.2.0.tgz
```

```sh
modelsell login
modelsell models --type image
modelsell run gpt-image-2 -p '海边的小屋，水彩风格' --json
modelsell skill install
```

ModelSell CLI helps you quickly configure Codex, Claude Code, Gemini CLI, and
OpenClaw to use the ModelSell API service.

Open source under the [MIT License](LICENSE).

Default API base URL: `https://www.modelsell.com`

## 中文说明

### 项目功能

`modelsell` 是一个本地命令行配置工具，用于把 ModelSell 的 API Key、API
地址和默认模型写入常用 AI 编程工具的配置文件。

当前支持：

- Codex
- Claude Code
- Gemini CLI
- OpenClaw

主要能力：

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

### 使用方式

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

`modelsell` is a local CLI tool that writes your ModelSell API key, API base
URL, and default model settings into popular AI coding tools.

It currently supports:

- Codex
- Claude Code
- Gemini CLI
- OpenClaw

Key features:

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

### Usage

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
