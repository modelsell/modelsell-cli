#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';

const targets = [
  { pkg: 'node20-macos-arm64', output: 'modelsell-darwin-arm64' },
  { pkg: 'node20-macos-x64', output: 'modelsell-darwin-x64' },
  { pkg: 'node20-linux-arm64', output: 'modelsell-linux-arm64' },
  { pkg: 'node20-linux-x64', output: 'modelsell-linux-x64' },
  { pkg: 'node20-win-x64', output: 'modelsell-win-x64.exe' }
];

async function runCommand(command, args) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  const child = execFile(command, args);
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

await mkdir('dist', { recursive: true });
await runCommand('npx', [
  'esbuild',
  'bin/modelsell.js',
  '--bundle',
  '--platform=node',
  '--target=node20',
  '--format=cjs',
  '--outfile=dist/modelsell.cjs'
], { stdio: 'inherit' });

for (const target of targets) {
  await runCommand('npx', [
    'pkg',
    'dist/modelsell.cjs',
    '--targets',
    target.pkg,
    '--output',
    `dist/${target.output}`
  ]);
}
