$ErrorActionPreference = "Stop"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Version = if ($env:MODELSELL_VERSION) { $env:MODELSELL_VERSION } else { "latest" }
$BinDir = if ($env:MODELSELL_BIN_DIR) { $env:MODELSELL_BIN_DIR } else { Join-Path $HOME ".local\bin" }
$BaseUrl = if ($env:MODELSELL_DOWNLOAD_BASE_URL) { $env:MODELSELL_DOWNLOAD_BASE_URL } else { "https://static.modelsell.com/modelsell-cli" }
$CacheBust = if ($env:MODELSELL_CACHE_BUST) { $env:MODELSELL_CACHE_BUST } else { "202605221928" }

$Asset = "modelsell-win-x64.exe"
$Url = "$BaseUrl/$Asset"

if ($Version -ne "latest") {
  $Url = "$BaseUrl/$Version/$Asset"
} elseif ($CacheBust) {
  $Url = "$Url`?v=$CacheBust"
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

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

Write-Host "ModelSell CLI installed at $InstallPath"

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

if (-not $AlreadyInPath) {
  $NewUserPath = if ($UserPath) { "$UserPath;$BinDir" } else { $BinDir }
  [Environment]::SetEnvironmentVariable("Path", $NewUserPath, "User")
  $env:Path = "$env:Path;$BinDir"
  Write-Host "Added $BinDir to your user PATH. Open a new PowerShell window if modelsell is not found."
}

Write-Host "Run: modelsell"
