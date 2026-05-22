#!/usr/bin/env sh
set -eu

VERSION="${MODELSELL_VERSION:-latest}"
BIN_DIR="${MODELSELL_BIN_DIR:-$HOME/.local/bin}"
BASE_URL="${MODELSELL_DOWNLOAD_BASE_URL:-https://static.modelsell.com/modelsell-cli}"
CACHE_BUST="${MODELSELL_CACHE_BUST:-202605221720}"

detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) platform="darwin" ;;
    Linux) platform="linux" ;;
    *) echo "Unsupported operating system: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    arm64|aarch64) cpu="arm64" ;;
    x86_64|amd64) cpu="x64" ;;
    *) echo "Unsupported CPU architecture: $arch" >&2; exit 1 ;;
  esac

  echo "$platform-$cpu"
}

platform="$(detect_platform)"
asset="modelsell-$platform"
url="$BASE_URL/$asset"

if [ "$VERSION" != "latest" ]; then
  url="$BASE_URL/$VERSION/$asset"
elif [ -n "$CACHE_BUST" ]; then
  url="$url?v=$CACHE_BUST"
fi

mkdir -p "$BIN_DIR"
tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

echo "Downloading ModelSell CLI from $url"
if command -v curl >/dev/null 2>&1; then
  curl -fL "$url" -o "$tmp_file"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$tmp_file" "$url"
else
  echo "curl or wget is required to download ModelSell CLI." >&2
  exit 1
fi

chmod +x "$tmp_file"
mv "$tmp_file" "$BIN_DIR/modelsell"
trap - EXIT

echo "ModelSell CLI installed at $BIN_DIR/modelsell"
echo "Run: modelsell"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to PATH if the modelsell command is not found." ;;
esac
