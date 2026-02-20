#!/usr/bin/env node

import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const NGROK_API_URL = 'http://127.0.0.1:4040/api/tunnels';

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;

    const raw = current.slice(2);
    const eqIndex = raw.indexOf('=');

    if (eqIndex >= 0) {
      const key = raw.slice(0, eqIndex);
      const value = raw.slice(eqIndex + 1);
      options[key] = value;
      continue;
    }

    const key = raw;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = 'true';
    }
  }

  return options;
}

function loadEnvFromDotLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return {};

  const content = readFileSync(envPath, 'utf-8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    env[key] = value;
  }

  return env;
}

function pickNonEmpty(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function normalizeBaseUrl(value) {
  const raw = pickNonEmpty(value, DEFAULT_BASE_URL);
  if (raw.endsWith('/')) return raw.slice(0, -1);
  return raw;
}

function readErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const fromError = payload.error;
  if (typeof fromError === 'string' && fromError.trim().length > 0) {
    return fromError.trim();
  }
  const fromText = payload.text;
  if (typeof fromText === 'string' && fromText.trim().length > 0) {
    return fromText.trim();
  }
  return '';
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function tryResolveNgrokPublicUrl() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(NGROK_API_URL, { signal: controller.signal });
    if (!response.ok) return '';

    const payload = await response.json();
    const tunnels = Array.isArray(payload?.tunnels) ? payload.tunnels : [];
    const httpsTunnel = tunnels.find((row) => row?.proto === 'https');
    const publicUrl = typeof httpsTunnel?.public_url === 'string' ? httpsTunnel.public_url.trim() : '';
    return publicUrl.startsWith('https://') ? publicUrl : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function printHelp() {
  process.stdout.write(
    [
      'Create a new tenant via local billing webhook.',
      '',
      'Usage:',
      '  npm run tenant:create -- [options]',
      '',
      'Options:',
      '  --base-url <url>                    API base URL (default: http://localhost:3000)',
      '  --tenant-name <name>                Tenant name (default: QA Tenant <timestamp>)',
      '  --owner-full-name <name>            Owner full name (default: QA Admin)',
      '  --owner-email <email>               Owner email (default: qa-admin+<timestamp>@example.com)',
      '  --owner-password <password>         Owner password (default: TempPass123!)',
      '  --plan-code <code>                  Plan code (default: starter)',
      '  --subscription-status <status>      Subscription status (default: active)',
      '  --provider <name>                   Billing provider name (default: manual)',
      '  --provider-customer-id <id>         Provider customer id (default: cust-<timestamp>)',
      '  --provider-subscription-id <id>     Provider subscription id (default: sub-<timestamp>)',
      '  --event-id <id>                     Webhook event id (default: manual-<timestamp>)',
      '  --webhook-secret <secret>           HMAC secret for x-billing-signature header',
      '  --public-url <url>                  URL to print as login base (for example ngrok URL)',
      '  --help                              Show this help',
      '',
      'Example:',
      '  npm run tenant:create -- --tenant-name "QA Firm" --owner-email qa-admin@example.com',
      '',
    ].join('\n')
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const wantsHelp = args.help === 'true';
  if (wantsHelp) {
    printHelp();
    return;
  }

  const env = loadEnvFromDotLocal();
  const timestamp = Date.now();

  const baseUrl = normalizeBaseUrl(
    pickNonEmpty(args['base-url'], process.env.TENANT_CREATE_BASE_URL, env.TENANT_CREATE_BASE_URL)
  );
  const tenantName = pickNonEmpty(args['tenant-name']) || `QA Tenant ${timestamp}`;
  const ownerFullName = pickNonEmpty(args['owner-full-name']) || 'QA Admin';
  const ownerEmail = pickNonEmpty(args['owner-email']) || `qa-admin+${timestamp}@example.com`;
  const ownerPassword = pickNonEmpty(args['owner-password']) || 'TempPass123!';
  const planCode = pickNonEmpty(args['plan-code']) || 'starter';
  const subscriptionStatus = pickNonEmpty(args['subscription-status']) || 'active';
  const provider = pickNonEmpty(args.provider) || 'manual';
  const providerCustomerId = pickNonEmpty(args['provider-customer-id']) || `cust-${timestamp}`;
  const providerSubscriptionId = pickNonEmpty(args['provider-subscription-id']) || `sub-${timestamp}`;
  const eventId = pickNonEmpty(args['event-id']) || `manual-${timestamp}`;
  const webhookSecret = pickNonEmpty(
    args['webhook-secret'],
    process.env.BILLING_WEBHOOK_SECRET,
    env.BILLING_WEBHOOK_SECRET
  );

  const payload = {
    id: eventId,
    provider,
    type: 'checkout.completed',
    data: {
      providerCustomerId,
      providerSubscriptionId,
      tenantName,
      ownerEmail,
      ownerFullName,
      ownerPassword,
      planCode,
      subscriptionStatus,
    },
  };

  const rawPayload = JSON.stringify(payload);
  const headers = { 'content-type': 'application/json' };

  if (webhookSecret) {
    headers['x-billing-signature'] = createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');
  }

  process.stdout.write(`[tenant:create] POST ${baseUrl}/api/billing/webhook\n`);

  const response = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: 'POST',
    headers,
    body: rawPayload,
  });

  const responseBody = await readResponseBody(response);
  if (!response.ok) {
    const detail = readErrorMessage(responseBody);
    const suffix = detail ? `: ${detail}` : '';
    throw new Error(`Request failed (${response.status}${suffix})`);
  }

  const requestedPublicUrl = pickNonEmpty(args['public-url'], process.env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_APP_URL);
  const ngrokPublicUrl = requestedPublicUrl ? '' : await tryResolveNgrokPublicUrl();
  const loginBase = normalizeBaseUrl(pickNonEmpty(requestedPublicUrl, ngrokPublicUrl, baseUrl));

  process.stdout.write('[tenant:create] Tenant provisioning event accepted.\n');
  process.stdout.write('\n');
  process.stdout.write(`Tenant: ${tenantName}\n`);
  process.stdout.write(`Owner: ${ownerFullName}\n`);
  process.stdout.write(`Email: ${ownerEmail}\n`);
  process.stdout.write(`Password: ${ownerPassword}\n`);
  process.stdout.write(`Login URL: ${loginBase}/login\n`);

  if (ngrokPublicUrl) {
    process.stdout.write('[tenant:create] Login URL uses ngrok tunnel discovered at 127.0.0.1:4040.\n');
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[tenant:create] ${message}\n`);
  process.exit(1);
});
