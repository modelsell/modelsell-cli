# ModelSell CLI

`modelsell` configures Codex, Claude Code, and Gemini CLI to use ModelSell.

Default base URL: `https://www.modelsell.com`

## Install

After this repository is pushed to GitHub:

```sh
curl -fsSL https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.sh | sh
```

Install from another Git URL:

```sh
MODELSELL_CLI_REPO=https://github.com/your-org/modelsell-cli.git sh install.sh
```

For local development from this directory:

```sh
npm install
npm link
```

Install from this local directory without publishing first:

```sh
MODELSELL_CLI_REPO=$PWD sh install.sh
```

## Configure

Interactive mode:

```sh
modelsell configure
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
