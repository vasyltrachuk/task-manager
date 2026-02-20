#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';

const TUNNEL_TIMEOUT_MS = 240_000;
const NGROK_API_URL = 'http://127.0.0.1:4040/api/tunnels';

function findBinary(name) {
  const result = spawnSync('which', [name], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

function parsePort(argv) {
  let parsed = Number.parseInt(process.env.PORT ?? '3000', 10);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--port' || current === '-p') {
      const next = argv[index + 1];
      parsed = Number.parseInt(next ?? '', 10);
      index += 1;
      continue;
    }

    if (current.startsWith('--port=')) {
      parsed = Number.parseInt(current.slice('--port='.length), 10);
    }
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid port: ${parsed}`);
  }

  return parsed;
}

function terminateProcess(child) {
  if (!child || child.exitCode !== null) return;

  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }, 3_000).unref();
}

function tailText(input, maxChars = 1200) {
  const trimmed = input.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(trimmed.length - maxChars);
}

function startNgrok(port) {
  const ngrokPath = findBinary('ngrok');
  if (!ngrokPath) {
    throw new Error('`ngrok` binary was not found in PATH. Install ngrok and run this command again.');
  }

  process.stdout.write('[public-url] Using ngrok.\n');
  if (process.platform !== 'win32') {
    // Free ngrok plans may block multiple active sessions.
    spawnSync('pkill', ['-f', 'ngrok'], { stdio: 'ignore' });
  }

  const tunnelProcess = spawn(ngrokPath, ['http', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return tunnelProcess;
}

async function waitForNgrokUrl(tunnel, tunnelProvider, lastNgrokLogRef) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TUNNEL_TIMEOUT_MS) {
    if (tunnel.exitCode !== null) {
      const details = tailText(lastNgrokLogRef.value);
      if (details) {
        throw new Error(
          `${tunnelProvider} exited before URL was created (code ${tunnel.exitCode ?? 'unknown'}).\n${details}`
        );
      }
      throw new Error(`${tunnelProvider} exited before URL was created (code ${tunnel.exitCode ?? 'unknown'}).`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const response = await fetch(NGROK_API_URL);
      if (!response.ok) continue;

      const data = await response.json();
      const publicUrl = data?.tunnels?.find((item) => item?.proto === 'https')?.public_url;
      if (typeof publicUrl === 'string' && publicUrl.startsWith('https://')) {
        return publicUrl;
      }
    } catch {
      // ngrok local API is not ready yet.
    }
  }

  throw new Error(`Timed out waiting for ${tunnelProvider} public URL.`);
}

async function main() {
  const port = parsePort(process.argv.slice(2));
  const tunnel = startNgrok(port);
  const tunnelProvider = 'ngrok';
  const lastNgrokLogRef = { value: '' };

  const onNgrokData = (chunk) => {
    const text = String(chunk ?? '');
    if (!text) return;
    lastNgrokLogRef.value = tailText(`${lastNgrokLogRef.value}\n${text}`, 5000);
  };

  tunnel.stdout?.on('data', onNgrokData);
  tunnel.stderr?.on('data', onNgrokData);

  process.stdout.write(
    `[public-url] Waiting for ${tunnelProvider} URL (up to ${Math.floor(TUNNEL_TIMEOUT_MS / 1000)}s)...\n`
  );

  const tunnelUrl = await waitForNgrokUrl(tunnel, tunnelProvider, lastNgrokLogRef);

  process.stdout.write(`\n[public-url] Provider: ${tunnelProvider}\n`);
  process.stdout.write(`[public-url] ${tunnelUrl}\n`);
  process.stdout.write(`[public-url] Starting Next.js on port ${port} with NEXT_PUBLIC_APP_URL=${tunnelUrl}\n\n`);
  process.stdout.write('[public-url] Keep this process running while Telegram webhook tests are active.\n\n');

  const dev = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_URL: tunnelUrl,
      PORT: String(port),
    },
  });

  let shuttingDown = false;

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminateProcess(dev);
    terminateProcess(tunnel);
    process.exitCode = exitCode;
  };

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  dev.on('close', (code) => {
    terminateProcess(tunnel);
    process.exit(code ?? 0);
  });

  tunnel.on('close', (code) => {
    if (shuttingDown) return;
    if (dev.exitCode === null) {
      process.stderr.write(
        `[public-url] ${tunnelProvider} stopped unexpectedly (code ${code ?? 'unknown'}).\n`
      );
      terminateProcess(dev);
      process.exit(1);
    }
  });

  tunnel.on('error', (error) => {
    if (shuttingDown) return;
    process.stderr.write(`[public-url] ${error instanceof Error ? error.message : String(error)}\n`);
    terminateProcess(dev);
    terminateProcess(tunnel);
    process.exit(1);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[public-url] ${message}\n`);
  process.exit(1);
});
