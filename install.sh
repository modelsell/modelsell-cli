#!/usr/bin/env sh
set -eu

VERSION="${MODELSELL_VERSION:-latest}"
BIN_DIR="${MODELSELL_BIN_DIR:-$HOME/.local/bin}"
BASE_URL="${MODELSELL_DOWNLOAD_BASE_URL:-https://static.modelsell.com/modelsell-cli}"
CACHE_BUST="${MODELSELL_CACHE_BUST:-0.3.0}"

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
BIN_DIR="$(CDPATH= cd -P "$BIN_DIR" && pwd)"
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

install_path="$BIN_DIR/modelsell"
locale="${LC_ALL:-} ${LC_MESSAGES:-} ${LANG:-} ${LANGUAGE:-}"

case ":$PATH:" in
  *":$BIN_DIR:"*) path_ready=true ;;
  *) path_ready=false ;;
esac

echo
echo "============================================================"
case "$locale" in
  *zh*|*ZH*)
    echo "ModelSell CLI 安装成功"
    echo "安装位置: $install_path"
    echo
    echo "下一步：请在终端输入以下命令，进入 ModelSell："
    echo
    echo "  modelsell"
    if [ "$path_ready" = false ]; then
      echo
      echo "当前终端的 PATH 中尚未包含安装目录。"
      echo "如果输入 modelsell 后提示“找不到命令”，请使用完整路径："
      echo
      printf '  "%s"\n' "$install_path"
    fi
    ;;
  *)
    echo "ModelSell CLI installed successfully"
    echo "Installed at: $install_path"
    echo
    echo "Next: type this command in your terminal to open ModelSell:"
    echo
    echo "  modelsell"
    if [ "$path_ready" = false ]; then
      echo
      echo "The install directory is not available in this terminal's PATH yet."
      echo "If modelsell reports 'command not found', run the full path:"
      echo
      printf '  "%s"\n' "$install_path"
    fi
    ;;
esac
echo "============================================================"
