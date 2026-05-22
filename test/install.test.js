import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Windows installer downloads the exe and installs modelsell.exe', async () => {
  const script = await readFile(new URL('../install.ps1', import.meta.url), 'utf8');

  assert.match(script, /\$env:MODELSELL_VERSION/);
  assert.match(script, /\$env:MODELSELL_BIN_DIR/);
  assert.match(script, /\$env:MODELSELL_DOWNLOAD_BASE_URL/);
  assert.match(script, /modelsell-win-x64\.exe/);
  assert.match(script, /modelsell\.exe/);
  assert.match(script, /Invoke-WebRequest/);
  assert.match(script, /SetEnvironmentVariable\("Path"/);
});
