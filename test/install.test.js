import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('macOS/Linux installer clearly shows the command and full-path fallback in Chinese and English', async () => {
  const script = await readFile(new URL('../install.sh', import.meta.url), 'utf8');

  assert.match(script, /ModelSell CLI 安装成功/);
  assert.match(script, /下一步：请在终端输入以下命令，进入 ModelSell/);
  assert.match(script, /如果输入 modelsell 后提示“找不到命令”，请使用完整路径/);
  assert.match(script, /Next: type this command in your terminal to open ModelSell/);
  assert.match(script, /run the full path/);
  assert.match(script, /printf '  "%s"\\n' "\$install_path"/);
});

test('Windows installer downloads the exe and installs modelsell.exe', async () => {
  const script = await readFile(new URL('../install.ps1', import.meta.url), 'utf8');

  assert.match(script, /\$env:MODELSELL_VERSION/);
  assert.match(script, /\$env:MODELSELL_BIN_DIR/);
  assert.match(script, /\$env:MODELSELL_DOWNLOAD_BASE_URL/);
  assert.match(script, /modelsell-win-x64\.exe/);
  assert.match(script, /modelsell\.exe/);
  assert.match(script, /Invoke-WebRequest/);
  assert.match(script, /SetEnvironmentVariable\("Path"/);
  assert.match(script, /ModelSell CLI 安装成功/);
  assert.match(script, /下一步：请在 PowerShell 中输入以下命令，进入 ModelSell/);
  assert.match(script, /未能自动把安装目录添加到 PATH/);
  assert.match(script, /如果输入 modelsell 后提示“无法识别”或“找不到命令”，请使用完整路径/);
  assert.match(script, /& `"\$InstallPath`"/);
});
