---
name: modelsell-setup
description: Install the modelsell CLI and sign in when a ModelSell task fails because the command is missing or no API key is configured. Use before running ModelSell models on a machine where modelsell status does not succeed.
---

# Modelsell CLI setup

Check the CLI first with modelsell status --json. If it succeeds, use the modelsell skill and skip this one.

If the command is missing, ask the user before installing anything. Installers:

- macOS / Linux: curl -fsSL https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.sh | sh (mirror: https://static.modelsell.com/modelsell-cli/install.sh)
- Windows PowerShell: irm https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.ps1 | iex
- Node.js 18+: npm install -g https://github.com/modelsell/modelsell-cli/releases/download/v0.3.0/modelsell-cli-0.3.0.tgz

The installers put the binary in ~/.local/bin; if modelsell is not on PATH, call ~/.local/bin/modelsell directly.

If no key is configured, ask the user to run modelsell login in their own terminal (input is hidden), or to export MODELSELL_API_KEY. Never ask the user to paste the key into the conversation, and never print, log, or write keys to project files. modelsell login --key-stdin is for automation that already holds the key.

Confirm with modelsell status --json, then continue with the modelsell skill.
