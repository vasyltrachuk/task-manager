import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import type { Json } from '@/lib/database.types';
import {
  provisionTenantFromCheckout,
  updateSubscriptionFromWebhook,
  type SaasSubscriptionStatus,
} from '@/lib/server/saas/provisioning';

interface BillingWebhookEvent {
  id: string;
  provider: string;
  type: string;
  data: Record<string, unknown>;
}

const SAAS_STATUS_VALUES = new Set<SaasSubscriptionStatus>([
  'trialing',
  'active',
  'grace',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
]);

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | undefined {
  const text = safeString(value);
  return text.length > 0 ? text : undefined;
}

function optionalStatus(value: unknown): SaasSubscriptionStatus | undefined {
  const status = safeString(value) as SaasSubscriptionStatus;
  if (!status) return undefined;
  if (!SAAS_STATUS_VALUES.has(status)) return undefined;
  return status;
}

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  const actualBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

function parseEvent(rawPayload: string): BillingWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error('Invalid JSON payload.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Webhook payload must be an object.');
  }

  const event = parsed as Record<string, unknown>;
  const id = safeString(event.id);
  const provider = safeString(event.provider).toLowerCase();
  const type = safeString(event.type);
  const data = (event.data ?? {}) as Record<string, unknown>;

  if (!id) throw new Error('Webhook event id is required.');
  if (!provider) throw new Error('Webhook provider is required.');
  if (!type) throw new Error('Webhook type is required.');
  if (typeof data !== 'object' || data === null) {
    throw new Error('Webhook data must be an object.');
  }

  return { id, provider, type, data };
}

export async function POST(request: Request) {
  const rawPayload = await request.text();
  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim();

  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'BILLING_WEBHOOK_SECRET is required in production.' },
      { status: 500 }
    );
  }

  if (secret) {
    const signature = request.headers.get('x-billing-signature');
    if (!verifySignature(rawPayload, signature, secret)) {
      return NextResponse.json({ error: 'Invalid billing webhook signature.' }, { status: 401 });
    }
  }

  let event: BillingWebhookEvent;
  try {
    event = parseEvent(rawPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid payload';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: insertedEvent, error: insertEventError } = await supabaseAdmin
    .from('saas_subscription_events')
    .insert({
      provider: event.provider,
      provider_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Json,
    })
    .select('id')
    .single();

  if (insertEventError?.code === '23505') {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (insertEventError || !insertedEvent?.id) {
    return NextResponse.json(
      { error: insertEventError?.message ?? 'Failed to persist webhook event.' },
      { status: 500 }
    );
  }

  let tenantId: string | null = null;

  try {
    if (event.type === 'checkout.completed') {
      const providerCustomerId = safeString(event.data.providerCustomerId);
      const providerSubscriptionId = safeString(event.data.providerSubscriptionId);
      const tenantName = safeString(event.data.tenantName);
      const ownerEmail = safeString(event.data.ownerEmail);
      const ownerFullName = safeString(event.data.ownerFullName);
      const ownerPassword = optionalString(event.data.ownerPassword);
      const planCode = safeString(event.data.planCode || 'starter');
      const subscriptionStatus = optionalStatus(event.data.subscriptionStatus);
      const currentPeriodStart = optionalString(event.data.currentPeriodStart);
      const currentPeriodEnd = optionalString(event.data.currentPeriodEnd);
      const cancelAtPeriodEnd = Boolean(event.data.cancelAtPeriodEnd);

      const result = await provisionTenantFromCheckout({
        provider: event.provider,
        providerCustomerId,
        providerSubscriptionId,
        tenantName,
        ownerEmail,
        ownerFullName,
        ownerPassword,
        planCode,
        subscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      });
      tenantId = result.tenantId;
    } else if (event.type === 'subscription.updated') {
      const result = await updateSubscriptionFromWebhook({
        provider: event.provider,
        providerSubscriptionId: safeString(event.data.providerSubscriptionId),
        planCode: optionalString(event.data.planCode),
        status: optionalStatus(event.data.subscriptionStatus),
        currentPeriodStart: optionalString(event.data.currentPeriodStart),
        currentPeriodEnd: optionalString(event.data.currentPeriodEnd),
        cancelAtPeriodEnd: Boolean(event.data.cancelAtPeriodEnd),
      });
      tenantId = result.tenantId;
    } else if (event.type === 'subscription.canceled') {
      const result = await updateSubscriptionFromWebhook({
        provider: event.provider,
        providerSubscriptionId: safeString(event.data.providerSubscriptionId),
        status: 'canceled',
        currentPeriodEnd: optionalString(event.data.currentPeriodEnd),
        cancelAtPeriodEnd: true,
      });
      tenantId = result.tenantId;
    } else {
      await supabaseAdmin
        .from('saas_subscription_events')
        .update({
          processed_at: new Date().toISOString(),
          processing_error: null,
        })
        .eq('id', insertedEvent.id);
      return NextResponse.json({ ok: true, ignored: true });
    }

    await supabaseAdmin
      .from('saas_subscription_events')
      .update({
        tenant_id: tenantId,
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq('id', insertedEvent.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';

    await supabaseAdmin
      .from('saas_subscription_events')
      .update({
        tenant_id: tenantId,
        processed_at: new Date().toISOString(),
        processing_error: message,
      })
      .eq('id', insertedEvent.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
