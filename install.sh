#!/usr/bin/env sh
set -eu

REPO_URL="${MODELSELL_CLI_REPO:-https://github.com/modelsell/modelsell-cli.git}"
INSTALL_DIR="${MODELSELL_CLI_HOME:-$HOME/.modelsell/modelsell-cli}"
BIN_DIR="${MODELSELL_BIN_DIR:-$HOME/.local/bin}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required. Please install Node.js first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18 or newer is required. Current: $(node -v)" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR"

if [ -d "$REPO_URL" ]; then
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  tar -C "$REPO_URL" \
    --exclude .git \
    --exclude node_modules \
    -cf - . | tar -C "$INSTALL_DIR" -xf -
elif command -v git >/dev/null 2>&1; then
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull --ff-only
  else
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
else
  echo "git is required for installation from $REPO_URL." >&2
  exit 1
fi

cd "$INSTALL_DIR"
npm install --omit=dev
chmod +x "$INSTALL_DIR/bin/modelsell.js"
ln -sf "$INSTALL_DIR/bin/modelsell.js" "$BIN_DIR/modelsell"

echo "ModelSell CLI installed at $BIN_DIR/modelsell"
echo "Run: modelsell configure"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to PATH if the modelsell command is not found." ;;
esac
