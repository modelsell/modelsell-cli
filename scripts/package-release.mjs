#!/usr/bin/env node
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${pkg.version}`) {
  throw new Error('Release tag must match package.json version.');
}
const { stdout } = await promisify(execFile)('npm', ['pack', '--pack-destination', 'dist', '--json']);
const packed = JSON.parse(stdout)[0].filename;
const names = [
  'modelsell-darwin-arm64', 'modelsell-darwin-x64',
  'modelsell-linux-arm64', 'modelsell-linux-x64', 'modelsell-win-x64.exe',
  packed, 'install.sh', 'install.ps1'
];
await copyFile('install.sh', 'dist/install.sh');
await copyFile('install.ps1', 'dist/install.ps1');
const sums = [];
for (const name of names) {
  const bytes = await readFile(`dist/${name}`);
  if (bytes.length === 0) throw new Error(`Empty release asset: ${name}`);
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
await writeFile('dist/SHA256SUMS', sums.join('\n') + '\n');
console.log(`Prepared ${names.length} release assets plus SHA256SUMS for v${pkg.version}.`);
