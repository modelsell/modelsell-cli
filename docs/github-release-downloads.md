# GitHub Release Downloads

The first GitHub release should be tagged as `v0.1.0`.

## Latest URLs

- macOS Apple Silicon: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-arm64
- macOS Intel: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-x64
- Linux ARM64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-arm64
- Linux x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-x64
- Windows x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-win-x64.exe

## Versioned URLs

- macOS Apple Silicon: https://github.com/modelsell/modelsell-cli/releases/download/v0.1.0/modelsell-darwin-arm64
- macOS Intel: https://github.com/modelsell/modelsell-cli/releases/download/v0.1.0/modelsell-darwin-x64
- Linux ARM64: https://github.com/modelsell/modelsell-cli/releases/download/v0.1.0/modelsell-linux-arm64
- Linux x64: https://github.com/modelsell/modelsell-cli/releases/download/v0.1.0/modelsell-linux-x64
- Windows x64: https://github.com/modelsell/modelsell-cli/releases/download/v0.1.0/modelsell-win-x64.exe

## Release Command

After GitHub credentials are configured:

```sh
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

The release workflow uploads the macOS, Linux, and Windows binaries to GitHub Releases.

## Installer Script URLs

- macOS/Linux GitHub: https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.sh
- macOS/Linux fallback: https://static.modelsell.com/modelsell-cli/install.sh
- Windows GitHub: https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.ps1
- Windows fallback: https://static.modelsell.com/modelsell-cli/install.ps1
