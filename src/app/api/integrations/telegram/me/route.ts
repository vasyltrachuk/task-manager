import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { mapErrorToResponse } from '@/lib/server/integrations/dps/error';
import { getSessionContext, isPrivilegedRole } from '@/lib/server/integrations/dps/http';

export const runtime = 'nodejs';

interface TelegramBotRow {
  id: string;
  public_id: string;
  webhook_secret: string;
  token_encrypted: string;
  bot_username: string | null;
  display_name: string | null;
  updated_at: string;
}

interface TelegramApiSuccess<T> {
  ok: true;
  result: T;
}

interface TelegramApiFailure {
  ok: false;
  description?: string;
}

type TelegramApiResponse<T> = TelegramApiSuccess<T> | TelegramApiFailure;

interface TelegramGetMeResult {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramWebhookInfoResult {
  url?: string;
}

const LOCAL_WEBHOOK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const NGROK_API_URL = process.env.NGROK_API_URL?.trim() || 'http://127.0.0.1:4040/api/tunnels';

interface NgrokTunnelApiResponse {
  tunnels?: Array<{
    proto?: string;
    public_url?: string;
  }>;
}

function isLocalWebhookHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOCAL_WEBHOOK_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost');
}

async function getNgrokBaseUrl(): Promise<string | null> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(NGROK_API_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as NgrokTunnelApiResponse;
    const tunnelUrl = data.tunnels?.find((item) => item?.proto === 'https')?.public_url?.trim();
    if (!tunnelUrl) return null;

    const normalized = tunnelUrl.replace(/\/+$/, '');
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:') return null;
    if (isLocalWebhookHostname(parsed.hostname)) return null;
    if (parsed.pathname !== '/' && parsed.pathname !== '') return null;

    return normalized;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function getAppBaseUrl(request: Request): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/+$/, '');
  if (envUrl) {
    let hasPath = false;
    try {
      const parsed = new URL(envUrl);
      hasPath = parsed.pathname !== '/' && parsed.pathname !== '';
    } catch {
      hasPath = true;
    }

    // In local development we allow fallback to the current ngrok URL when env
    // still points to localhost/http from .env.local.
    if (isPublicHttpsUrl(envUrl) && !hasPath) {
      return envUrl;
    }

    if (process.env.NODE_ENV === 'production') {
      return envUrl;
    }
  }

  const url = new URL(request.url);
  const fallbackBaseUrl = `${url.protocol}//${url.host}`;

  if (url.protocol === 'https:' && !isLocalWebhookHostname(url.hostname)) {
    return fallbackBaseUrl;
  }

  if (process.env.NODE_ENV !== 'production') {
    const ngrokBaseUrl = await getNgrokBaseUrl();
    if (ngrokBaseUrl) {
      return ngrokBaseUrl;
    }
  }

  return fallbackBaseUrl;
}

function buildWebhookUrl(baseUrl: string, botPublicId: string): string {
  return `${baseUrl}/api/telegram/webhook/${botPublicId}`;
}

function isPublicHttpsUrl(value: string | null): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost = isLocalWebhookHostname(host);

    return parsed.protocol === 'https:' && !isLocalHost;
  } catch {
    return false;
  }
}

function assertPublicHttpsUrlForWebhook(baseUrl: string): void {
  if (!isPublicHttpsUrl(baseUrl)) {
    throw new Error('Field "NEXT_PUBLIC_APP_URL" must be a public HTTPS URL without a path.');
  }

  const parsed = new URL(baseUrl);
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('Field "NEXT_PUBLIC_APP_URL" must be a public HTTPS URL without a path.');
  }
}

function getTelegramApiBaseUrl(): string {
  return process.env.TELEGRAM_API_BASE_URL?.trim() || 'https://api.telegram.org';
}

async function callTelegramApi<T>(
  token: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(`${getTelegramApiBaseUrl()}/bot${token}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram API HTTP ${response.status}: ${body || 'Unknown error'}`);
  }

  const parsed = (await response.json()) as TelegramApiResponse<T>;
  if (!parsed.ok) {
    throw new Error(parsed.description || `Telegram API ${method} failed`);
  }

  return parsed.result;
}

async function fetchTelegramMe(token: string): Promise<TelegramGetMeResult> {
  return callTelegramApi<TelegramGetMeResult>(token, 'getMe');
}

async function fetchTelegramWebhookInfo(token: string): Promise<TelegramWebhookInfoResult> {
  return callTelegramApi<TelegramWebhookInfoResult>(token, 'getWebhookInfo');
}

async function setTelegramWebhook(token: string, webhookUrl: string, webhookSecret: string): Promise<void> {
  await callTelegramApi(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ['message', 'edited_message', 'channel_post', 'callback_query'],
    drop_pending_updates: false,
  });
}

async function deleteTelegramWebhook(token: string): Promise<void> {
  await callTelegramApi(token, 'deleteWebhook', {
    drop_pending_updates: false,
  });
}

function normalizeToken(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Field "token" must be a non-empty string');
  }

  return value.trim();
}

function normalizeOptionalDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAdminRole(role?: string): boolean {
  return role === 'admin';
}

function mapTelegramStatus(
  bot: TelegramBotRow | null,
  webhookUrl: string | null,
  webhookSet: boolean
) {
  return {
    hasBot: Boolean(bot),
    botId: bot?.id ?? null,
    botUsername: bot?.bot_username ?? null,
    displayName: bot?.display_name ?? null,
    publicId: bot?.public_id ?? null,
    webhookUrl,
    webhookSet,
    webhookUrlIsPublicHttps: isPublicHttpsUrl(webhookUrl),
    updatedAt: bot?.updated_at ?? null,
  };
}

async function getActiveBot(supabase: Awaited<ReturnType<typeof getSessionContext>>['supabase'], tenantId: string) {
  const result = await supabase
    .from('tenant_bots')
    .select('id, public_id, webhook_secret, token_encrypted, bot_username, display_name, updated_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data as TelegramBotRow | null) ?? null;
}

export async function GET(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bot = await getActiveBot(supabase, ctx.tenantId);
    if (!bot) {
      return NextResponse.json({ botStatus: mapTelegramStatus(null, null, false) });
    }

    const webhookUrl = buildWebhookUrl(await getAppBaseUrl(request), bot.public_id);
    let webhookSet = false;

    try {
      const webhookInfo = await fetchTelegramWebhookInfo(bot.token_encrypted.trim());
      webhookSet = (webhookInfo.url ?? '').trim() === webhookUrl;
    } catch {
      webhookSet = false;
    }

    return NextResponse.json({
      botStatus: mapTelegramStatus(bot, webhookUrl, webhookSet),
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!isAdminRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Only admin can configure Telegram bot.' }, { status: 403 });
    }

    const appBaseUrl = await getAppBaseUrl(request);
    assertPublicHttpsUrlForWebhook(appBaseUrl);

    const payload = (await request.json()) as Record<string, unknown>;
    const token = normalizeToken(payload.token);
    const displayNameInput = normalizeOptionalDisplayName(payload.displayName);

    const me = await fetchTelegramMe(token);
    const username = me.username?.trim() || null;
    const fallbackDisplayName = me.first_name?.trim() || (username ? `@${username}` : 'Telegram bot');
    const displayName = displayNameInput ?? fallbackDisplayName;

    const existingBotsResult = await supabase
      .from('tenant_bots')
      .select('id, public_id, webhook_secret, token_encrypted, bot_username, display_name, updated_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (existingBotsResult.error) {
      throw new Error(existingBotsResult.error.message);
    }

    const existingBots = (existingBotsResult.data ?? []) as TelegramBotRow[];
    const primaryBot = existingBots[0] ?? null;
    let bot: TelegramBotRow;

    if (primaryBot) {
      const updateResult = await supabase
        .from('tenant_bots')
        .update({
          token_encrypted: token,
          bot_username: username,
          display_name: displayName,
          webhook_secret: primaryBot.webhook_secret || randomBytes(24).toString('hex'),
          is_active: true,
        })
        .eq('id', primaryBot.id)
        .select('id, public_id, webhook_secret, token_encrypted, bot_username, display_name, updated_at')
        .single();

      if (updateResult.error || !updateResult.data) {
        throw new Error(updateResult.error?.message ?? 'Failed to update tenant bot.');
      }

      bot = updateResult.data as TelegramBotRow;
    } else {
      const insertResult = await supabase
        .from('tenant_bots')
        .insert({
          tenant_id: ctx.tenantId,
          public_id: randomUUID(),
          token_encrypted: token,
          webhook_secret: randomBytes(24).toString('hex'),
          is_active: true,
          bot_username: username,
          display_name: displayName,
        })
        .select('id, public_id, webhook_secret, token_encrypted, bot_username, display_name, updated_at')
        .single();

      if (insertResult.error || !insertResult.data) {
        throw new Error(insertResult.error?.message ?? 'Failed to create tenant bot.');
      }

      bot = insertResult.data as TelegramBotRow;
    }

    if (existingBots.length > 1) {
      const staleIds = existingBots
        .map((row) => row.id)
        .filter((id) => id !== bot.id);

      if (staleIds.length > 0) {
        const deactivateResult = await supabase
          .from('tenant_bots')
          .update({ is_active: false })
          .in('id', staleIds)
          .eq('tenant_id', ctx.tenantId);

        if (deactivateResult.error) {
          throw new Error(deactivateResult.error.message);
        }
      }
    }

    const webhookUrl = buildWebhookUrl(appBaseUrl, bot.public_id);
    await setTelegramWebhook(token, webhookUrl, bot.webhook_secret);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'tenant_bots',
      entity_id: bot.id,
      action: primaryBot ? 'telegram_bot_updated' : 'telegram_bot_created',
      meta: {
        bot_username: username,
        webhook_url: webhookUrl,
      },
    });

    return NextResponse.json({
      botStatus: mapTelegramStatus(bot, webhookUrl, true),
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!isAdminRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Only admin can refresh Telegram webhook.' }, { status: 403 });
    }

    const bot = await getActiveBot(supabase, ctx.tenantId);
    if (!bot) {
      return NextResponse.json({ error: 'Telegram bot is not configured.' }, { status: 404 });
    }

    const appBaseUrl = await getAppBaseUrl(request);
    assertPublicHttpsUrlForWebhook(appBaseUrl);

    const webhookUrl = buildWebhookUrl(appBaseUrl, bot.public_id);
    await setTelegramWebhook(bot.token_encrypted.trim(), webhookUrl, bot.webhook_secret);

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'tenant_bots',
      entity_id: bot.id,
      action: 'telegram_webhook_refreshed',
      meta: {
        webhook_url: webhookUrl,
      },
    });

    return NextResponse.json({
      botStatus: mapTelegramStatus(bot, webhookUrl, true),
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function DELETE() {
  try {
    const { supabase, ctx } = await getSessionContext();

    if (!ctx.userId || !isPrivilegedRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!isAdminRole(ctx.userRole)) {
      return NextResponse.json({ error: 'Only admin can disconnect Telegram bot.' }, { status: 403 });
    }

    const bot = await getActiveBot(supabase, ctx.tenantId);
    if (!bot) {
      return NextResponse.json({
        botStatus: mapTelegramStatus(null, null, false),
      });
    }

    try {
      await deleteTelegramWebhook(bot.token_encrypted.trim());
    } catch {
      // Continue with deactivation even if webhook cleanup failed.
    }

    const deactivateResult = await supabase
      .from('tenant_bots')
      .update({ is_active: false })
      .eq('tenant_id', ctx.tenantId)
      .eq('id', bot.id);

    if (deactivateResult.error) {
      throw new Error(deactivateResult.error.message);
    }

    await supabase.from('audit_log').insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity: 'tenant_bots',
      entity_id: bot.id,
      action: 'telegram_bot_deactivated',
      meta: {},
    });

    return NextResponse.json({
      botStatus: mapTelegramStatus(null, null, false),
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
