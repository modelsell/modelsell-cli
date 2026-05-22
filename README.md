# ModelSell CLI

`modelsell` configures Codex, Claude Code, and Gemini CLI to use ModelSell.

Default base URL: `https://www.modelsell.com`

## Install

macOS one-line install from GitHub Releases:

```sh
curl -fsSL https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.sh | sh
```

GitHub download links:

- macOS Apple Silicon: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-arm64
- macOS Intel: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-x64
- Linux ARM64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-arm64
- Linux x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-x64
- Windows x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-win-x64.exe

After downloading on macOS:

```sh
chmod +x modelsell-darwin-arm64
./modelsell-darwin-arm64
```

After downloading on Windows PowerShell:

```powershell
.\modelsell-win-x64.exe
```

For local development from this directory:

```sh
npm install
npm link
```

Build release binaries locally:

```sh
npm run build
```

## Configure

Interactive mode:

```sh
modelsell
```

Interactive mode opens with a colorful `ModelSell CLI` banner and a numbered
target menu:

```text
1. All
2. Codex
3. Claude Code
4. Gemini CLI
```

Non-interactive mode:

```sh
modelsell configure --api-key sk-xxx --yes
```

Configure one target:

```sh
modelsell configure --target codex --api-key sk-xxx --codex-model gpt-5.5 --yes
```

Configure all targets with a custom base URL and per-tool models:

```sh
modelsell configure \
  --api-key sk-xxx \
  --base-url https://www.modelsell.com \
  --codex-model gpt-5.5 \
  --claude-model claude-sonnet-4-6 \
  --gemini-model gemini-3.1-pro-preview \
  --yes
```

## What It Writes

- Codex: `~/.codex/config.toml` and `~/.codex/auth.json`
- Claude Code: `~/.claude/settings.json`
- Gemini CLI: `~/.gemini/settings.json` and `~/.gemini/.env`

Existing files are backed up before each write with a `.bak.<timestamp>` suffix.
