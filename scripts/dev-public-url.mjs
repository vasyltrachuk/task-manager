#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CLOUDFLARED_URL_REGEX = /https:\/\/[a-z0-9-]+-[a-z0-9-]+\.trycloudflare\.com/i;
const LOCALTUNNEL_URL_REGEX = /https:\/\/[a-z0-9.-]+\.(loca\.lt|localtunnel\.me)/i;
const NGROK_URL_REGEX = /https:\/\/[a-z0-9-]+\.ngrok-free\.app/i;
const TUNNEL_TIMEOUT_MS = 240_000;

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

function getLocalTunnelBin() {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const localBinary = path.join(process.cwd(), 'node_modules', '.bin', `lt${ext}`);
  return existsSync(localBinary) ? localBinary : null;
}

function startTunnel(port) {
  const cloudflaredPath = process.env.NO_CLOUDFLARED ? null : findBinary('cloudflared');

  if (cloudflaredPath) {
    const tunnelProcess = spawn(
      cloudflaredPath,
      ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    return {
      provider: 'cloudflared',
      process: tunnelProcess,
      urlRegex: CLOUDFLARED_URL_REGEX,
    };
  }

  const ngrokPath = findBinary('ngrok');
  if (ngrokPath) {
    process.stdout.write('[public-url] Using ngrok.\n');

    // Kill any stale ngrok sessions before starting a new one (free plan: 1 session limit).
    spawnSync('pkill', ['-f', 'ngrok'], { stdio: 'ignore' });

    const tunnelProcess = spawn(ngrokPath, ['http', String(port)], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });

    return {
      provider: 'ngrok',
      process: tunnelProcess,
      urlRegex: NGROK_URL_REGEX,
      via: 'ngrok-api',
    };
  }

  const localTunnelBin = getLocalTunnelBin();
  if (localTunnelBin) {
    process.stdout.write('[public-url] cloudflared is not installed, using local node_modules/.bin/lt.\n');

    const tunnelProcess = spawn(localTunnelBin, ['--port', String(port), '--local-host', '127.0.0.1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      provider: 'localtunnel',
      process: tunnelProcess,
      urlRegex: LOCALTUNNEL_URL_REGEX,
      via: 'local-bin',
    };
  }

  process.stdout.write('[public-url] cloudflared is not installed, falling back to localtunnel via npx.\n');
  process.stdout.write('[public-url] First npx run may take time while package is downloaded.\n');

  const tunnelProcess = spawn('npx', ['localtunnel', '--port', String(port)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_yes: 'true',
    },
  });

  return {
    provider: 'localtunnel',
    process: tunnelProcess,
    urlRegex: LOCALTUNNEL_URL_REGEX,
    via: 'npx',
  };
}

async function main() {
  const port = parsePort(process.argv.slice(2));
  const tunnelRuntime = startTunnel(port);
  const tunnel = tunnelRuntime.process;
  const tunnelProvider = tunnelRuntime.provider;

  process.stdout.write(`[public-url] Waiting for ${tunnelProvider} URL (up to ${Math.floor(TUNNEL_TIMEOUT_MS / 1000)}s)...\n`);

  let resolvedUrl = null;
  let tunnelClosed = false;

  const tunnelUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${tunnelProvider} public URL.`));
    }, TUNNEL_TIMEOUT_MS);

    // ngrok exposes its URL via local API, not stdout
    if (tunnelRuntime.via === 'ngrok-api') {
      const pollNgrok = async () => {
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const res = await fetch('http://127.0.0.1:4040/api/tunnels');
            if (res.ok) {
              const data = await res.json();
              const publicUrl = data?.tunnels?.find((t) => t.proto === 'https')?.public_url;
              if (publicUrl) {
                clearTimeout(timeout);
                resolve(publicUrl);
                return;
              }
            }
          } catch {
            // not ready yet
          }
        }
        clearTimeout(timeout);
        reject(new Error('Timed out waiting for ngrok public URL.'));
      };

      tunnel.on('error', (error) => { clearTimeout(timeout); reject(error); });
      tunnel.on('close', (code) => {
        tunnelClosed = true;
        if (!resolvedUrl) { clearTimeout(timeout); reject(new Error(`ngrok exited (code ${code ?? 'unknown'}).`)); }
      });

      pollNgrok();
      return;
    }

    let sentPromptConfirmation = false;

    const onData = (chunk) => {
      const text = String(chunk);
      const match = text.match(tunnelRuntime.urlRegex);
      if (!resolvedUrl && match?.[0]) {
        resolvedUrl = match[0];
        clearTimeout(timeout);
        resolve(resolvedUrl);
        return;
      }

      // Some npm versions still ask interactive confirmation even with npm_config_yes.
      if (
        tunnelRuntime.via === 'npx' &&
        !sentPromptConfirmation &&
        /need to install|ok to proceed/i.test(text)
      ) {
        sentPromptConfirmation = true;
        tunnel.stdin?.write('y\n');
      }

      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        process.stdout.write(`[public-url][${tunnelProvider}] ${line}\n`);
      }
    };

    const onClose = (code) => {
      tunnelClosed = true;
      if (!resolvedUrl) {
        clearTimeout(timeout);
        reject(
          new Error(`${tunnelProvider} exited before URL was created (code ${code ?? 'unknown'}).`)
        );
      }
    };

    tunnel.stdout?.on('data', onData);
    tunnel.stderr?.on('data', onData);
    tunnel.on('close', onClose);
    tunnel.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

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
    if (tunnelClosed && dev.exitCode === null) {
      process.stderr.write(
        `[public-url] ${tunnelProvider} stopped unexpectedly (code ${code ?? 'unknown'}).\n`
      );
      terminateProcess(dev);
      process.exit(1);
    }
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[public-url] ${message}\n`);
  process.exit(1);
});
