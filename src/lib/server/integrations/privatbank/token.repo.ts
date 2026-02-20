import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/server/tenant-context';
import { decryptPrivatbankToken, encryptPrivatbankToken, maskToken } from './crypto';
import type { PrivatbankTokenRecord, PrivatbankTokenStatus } from './contracts';
import { isMissingTableError, isNoRowsError } from './supabase-errors';

interface TokenRow {
  id: string;
  tenant_id: string;
  profile_id: string;
  client_id: string | null;
  token_ciphertext: string;
  token_masked: string;
  is_active: boolean;
  updated_at: string;
  last_used_at: string | null;
}

function maskClientId(clientId: string): string {
  if (clientId.length <= 4) {
    return `${clientId.slice(0, 1)}***${clientId.slice(-1)}`;
  }

  return `${clientId.slice(0, 2)}***${clientId.slice(-2)}`;
}

export class PrivatbankTokenRepo {
  private readonly db: SupabaseClient;
  private readonly tenantId: string;

  constructor(db: SupabaseClient, ctx: TenantContext) {
    this.db = db;
    this.tenantId = ctx.tenantId;
  }

  async getTokenStatus(profileId: string): Promise<PrivatbankTokenStatus> {
    const { data, error } = await this.db
      .from('privatbank_accountant_tokens')
      .select('client_id, token_masked, is_active, last_used_at, updated_at')
      .eq('tenant_id', this.tenantId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error && isMissingTableError(error)) {
      return {
        hasToken: false,
        maskedToken: null,
        maskedClientId: null,
        lastUsedAt: null,
        updatedAt: null,
      };
    }

    if (error && !isNoRowsError(error)) {
      throw new Error(`[privatbank_token_status] ${error.message}`);
    }

    const hasClientId = typeof data?.client_id === 'string' && data.client_id.trim() !== '';

    if (!data || !data.is_active || !hasClientId) {
      return {
        hasToken: false,
        maskedToken: null,
        maskedClientId: null,
        lastUsedAt: null,
        updatedAt: null,
      };
    }

    return {
      hasToken: true,
      maskedToken: data.token_masked,
      maskedClientId: maskClientId(data.client_id.trim()),
      lastUsedAt: data.last_used_at,
      updatedAt: data.updated_at,
    };
  }

  async upsertToken(profileId: string, clientId: string, plainToken: string): Promise<PrivatbankTokenStatus> {
    const tokenCiphertext = encryptPrivatbankToken(plainToken);
    const tokenMasked = maskToken(plainToken);

    const { error } = await this.db
      .from('privatbank_accountant_tokens')
      .upsert(
        {
          tenant_id: this.tenantId,
          profile_id: profileId,
          client_id: clientId,
          token_ciphertext: tokenCiphertext,
          token_masked: tokenMasked,
          is_active: true,
        },
        { onConflict: 'tenant_id,profile_id' }
      );

    if (error && isMissingTableError(error)) {
      throw new Error('[privatbank_upsert_token] PrivatBank migrations are not applied. Run 00012_privatbank_integrations.sql');
    }

    if (error) {
      throw new Error(`[privatbank_upsert_token] ${error.message}`);
    }

    return this.getTokenStatus(profileId);
  }

  async deactivateToken(profileId: string): Promise<void> {
    const { error } = await this.db
      .from('privatbank_accountant_tokens')
      .update({
        is_active: false,
      })
      .eq('tenant_id', this.tenantId)
      .eq('profile_id', profileId);

    if (error && isMissingTableError(error)) {
      throw new Error('[privatbank_deactivate_token] PrivatBank migrations are not applied. Run 00012_privatbank_integrations.sql');
    }

    if (error) {
      throw new Error(`[privatbank_deactivate_token] ${error.message}`);
    }
  }

  async getActiveToken(profileId: string): Promise<PrivatbankTokenRecord | null> {
    const { data, error } = await this.db
      .from('privatbank_accountant_tokens')
      .select('id, client_id, token_ciphertext, token_masked, is_active')
      .eq('tenant_id', this.tenantId)
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .maybeSingle();

    if (error && isMissingTableError(error)) {
      return null;
    }

    if (error && !isNoRowsError(error)) {
      throw new Error(`[privatbank_get_active_token] ${error.message}`);
    }

    if (!data || !data.is_active) {
      return null;
    }

    if (typeof data.client_id !== 'string' || data.client_id.trim() === '') {
      throw new Error('PRIVATBANK_CLIENT_ID_NOT_FOUND');
    }

    try {
      const typed = data as Pick<TokenRow, 'id' | 'client_id' | 'token_ciphertext' | 'token_masked'>;
      return {
        tokenId: typed.id,
        clientId: typed.client_id as string,
        token: decryptPrivatbankToken(typed.token_ciphertext),
        masked: typed.token_masked,
      };
    } catch {
      return null;
    }
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    const { error } = await this.db
      .from('privatbank_accountant_tokens')
      .update({
        last_used_at: new Date().toISOString(),
      })
      .eq('tenant_id', this.tenantId)
      .eq('id', tokenId);

    if (error && isMissingTableError(error)) {
      return;
    }

    if (error) {
      throw new Error(`[privatbank_touch_token] ${error.message}`);
    }
  }
}
