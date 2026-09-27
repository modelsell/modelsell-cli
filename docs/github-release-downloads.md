# GitHub Release Downloads

Current release: `v0.2.0`. Source code is licensed under MIT.

## Latest URLs

- macOS Apple Silicon: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-arm64
- macOS Intel: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-darwin-x64
- Linux ARM64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-arm64
- Linux x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-linux-x64
- Windows x64: https://github.com/modelsell/modelsell-cli/releases/latest/download/modelsell-win-x64.exe

## Versioned URLs

- macOS Apple Silicon: https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/modelsell-darwin-arm64
- macOS Intel: https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/modelsell-darwin-x64
- Linux ARM64: https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/modelsell-linux-arm64
- Linux x64: https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/modelsell-linux-x64
- Windows x64: https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/modelsell-win-x64.exe
- npm package: https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/modelsell-cli-0.2.0.tgz
- SHA256 checksums: https://github.com/modelsell/modelsell-cli/releases/download/v0.2.0/SHA256SUMS

## Release Command

After GitHub credentials are configured:

```sh
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

The release workflow tests and builds the tagged source, then uploads all five
binaries, the npm-format package, installers, and checksums to a draft Release.
Verify the workflow, download/check the assets, and publish the draft. Mirror the
same verified artifacts to the static download site; retain the versioned files.
The workflow does not publish to the npm registry.

## Installer Script URLs

- macOS/Linux GitHub: https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.sh
- macOS/Linux fallback: https://static.modelsell.com/modelsell-cli/install.sh
- Windows GitHub: https://raw.githubusercontent.com/modelsell/modelsell-cli/main/install.ps1
- Windows fallback: https://static.modelsell.com/modelsell-cli/install.ps1
