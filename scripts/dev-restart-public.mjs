#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';

function stopExistingProcesses() {
  if (process.platform === 'win32') return;

  // Best-effort cleanup before launching a fresh public dev session.
  spawnSync('pkill', ['-f', 'next dev'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', 'ngrok'], { stdio: 'ignore' });
}

function main() {
  stopExistingProcesses();

  const child = spawn('npm', ['run', 'dev:public', '--', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    process.stderr.write(`[dev:public:restart] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main();
