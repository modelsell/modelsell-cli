$ErrorActionPreference = "Stop"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Version = if ($env:MODELSELL_VERSION) { $env:MODELSELL_VERSION } else { "latest" }
$BinDir = if ($env:MODELSELL_BIN_DIR) { $env:MODELSELL_BIN_DIR } else { Join-Path $HOME ".local\bin" }
$BaseUrl = if ($env:MODELSELL_DOWNLOAD_BASE_URL) { $env:MODELSELL_DOWNLOAD_BASE_URL } else { "https://static.modelsell.com/modelsell-cli" }
$CacheBust = if ($env:MODELSELL_CACHE_BUST) { $env:MODELSELL_CACHE_BUST } else { "0.3.0" }

$Asset = "modelsell-win-x64.exe"
$Url = "$BaseUrl/$Asset"

if ($Version -ne "latest") {
  $Url = "$BaseUrl/$Version/$Asset"
} elseif ($CacheBust) {
  $Url = "$Url`?v=$CacheBust"
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$BinDir = [System.IO.Path]::GetFullPath($BinDir)

$TempFile = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName() + ".exe")
$InstallPath = Join-Path $BinDir "modelsell.exe"

try {
  Write-Host "Downloading ModelSell CLI from $Url"
  Invoke-WebRequest -Uri $Url -OutFile $TempFile
  Move-Item -Force -Path $TempFile -Destination $InstallPath
} finally {
  if (Test-Path $TempFile) {
    Remove-Item -Force $TempFile
  }
}

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$PathParts = @()
if ($UserPath) {
  $PathParts = $UserPath -split ';' | Where-Object { $_ }
}

$AlreadyInPath = $false
foreach ($Part in $PathParts) {
  if ([string]::Equals($Part.TrimEnd('\'), $BinDir.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
    $AlreadyInPath = $true
    break
  }
}

$PathReady = $AlreadyInPath
$PathUpdateFailed = $false
if (-not $AlreadyInPath) {
  try {
    $NewUserPath = if ($UserPath) { "$UserPath;$BinDir" } else { $BinDir }
    [Environment]::SetEnvironmentVariable("Path", $NewUserPath, "User")
    $env:Path = "$env:Path;$BinDir"
    $PathReady = $true
  } catch {
    $PathUpdateFailed = $true
  }
}

$IsChinese = [Globalization.CultureInfo]::CurrentUICulture.Name -like "zh*"

Write-Host ""
Write-Host "============================================================"
if ($IsChinese) {
  Write-Host "ModelSell CLI 安装成功"
  Write-Host "安装位置: $InstallPath"
  Write-Host ""
  Write-Host "下一步：请在 PowerShell 中输入以下命令，进入 ModelSell：" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  modelsell" -ForegroundColor Green

  if ($PathUpdateFailed) {
    Write-Host ""
    Write-Host "未能自动把安装目录添加到 PATH，但不影响使用。" -ForegroundColor Yellow
  } elseif ($PathReady -and -not $AlreadyInPath) {
    Write-Host ""
    Write-Host "安装目录已添加到用户 PATH；新打开的 PowerShell 会自动生效。"
  }

  Write-Host ""
  Write-Host "如果输入 modelsell 后提示“无法识别”或“找不到命令”，请使用完整路径："
  Write-Host ""
  Write-Host "  & `"$InstallPath`"" -ForegroundColor Green
} else {
  Write-Host "ModelSell CLI installed successfully"
  Write-Host "Installed at: $InstallPath"
  Write-Host ""
  Write-Host "Next: type this command in PowerShell to open ModelSell:" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  modelsell" -ForegroundColor Green

  if ($PathUpdateFailed) {
    Write-Host ""
    Write-Host "The install directory could not be added to PATH automatically, but you can still use ModelSell." -ForegroundColor Yellow
  } elseif ($PathReady -and -not $AlreadyInPath) {
    Write-Host ""
    Write-Host "The install directory was added to your user PATH. It will be available in a new PowerShell window."
  }

  Write-Host ""
  Write-Host "If modelsell is not recognized or reports 'command not found', run the full path:"
  Write-Host ""
  Write-Host "  & `"$InstallPath`"" -ForegroundColor Green
}
Write-Host "============================================================"
