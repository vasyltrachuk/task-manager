import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantContext } from '@/lib/server/tenant-context';
import { decryptDpsToken, encryptDpsToken, maskToken } from './crypto';
import type { DpsTokenStatus } from './contracts';
import { isMissingTableError, isNoRowsError } from './supabase-errors';

interface TokenRow {
  id: string;
  tenant_id: string;
  profile_id: string;
  token_ciphertext: string;
  token_masked: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export class DpsTokenRepo {
  private readonly db: SupabaseClient;
  private readonly tenantId: string;

  constructor(db: SupabaseClient, ctx: TenantContext) {
    this.db = db;
    this.tenantId = ctx.tenantId;
  }

  async getTokenStatus(profileId: string): Promise<DpsTokenStatus> {
    const { data, error } = await this.db
      .from('dps_accountant_tokens')
      .select('token_masked, is_active, last_used_at, updated_at')
      .eq('tenant_id', this.tenantId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error && isMissingTableError(error)) {
      return {
        hasToken: false,
        maskedToken: null,
        lastUsedAt: null,
        updatedAt: null,
      };
    }

    if (error && !isNoRowsError(error)) {
      throw new Error(`[dps_token_status] ${error.message}`);
    }

    if (!data || !data.is_active) {
      return {
        hasToken: false,
        maskedToken: null,
        lastUsedAt: null,
        updatedAt: null,
      };
    }

    return {
      hasToken: true,
      maskedToken: data.token_masked,
      lastUsedAt: data.last_used_at,
      updatedAt: data.updated_at,
    };
  }

  async upsertToken(profileId: string, plainToken: string): Promise<DpsTokenStatus> {
    const tokenCiphertext = encryptDpsToken(plainToken);
    const tokenMasked = maskToken(plainToken);

    const { error } = await this.db
      .from('dps_accountant_tokens')
      .upsert(
        {
          tenant_id: this.tenantId,
          profile_id: profileId,
          token_ciphertext: tokenCiphertext,
          token_masked: tokenMasked,
          is_active: true,
        },
        { onConflict: 'tenant_id,profile_id' }
      );

    if (error && isMissingTableError(error)) {
      throw new Error('[dps_upsert_token] DPS migrations are not applied. Run 00003_dps_integrations.sql');
    }

    if (error) {
      throw new Error(`[dps_upsert_token] ${error.message}`);
    }

    return this.getTokenStatus(profileId);
  }

  async deactivateToken(profileId: string): Promise<void> {
    const { error } = await this.db
      .from('dps_accountant_tokens')
      .update({
        is_active: false,
      })
      .eq('tenant_id', this.tenantId)
      .eq('profile_id', profileId);

    if (error && isMissingTableError(error)) {
      throw new Error('[dps_deactivate_token] DPS migrations are not applied. Run 00003_dps_integrations.sql');
    }

    if (error) {
      throw new Error(`[dps_deactivate_token] ${error.message}`);
    }
  }

  async getActiveTokensByProfiles(profileIds: string[]): Promise<Map<string, { tokenId: string; token: string; masked: string }>> {
    if (profileIds.length === 0) return new Map();

    const { data, error } = await this.db
      .from('dps_accountant_tokens')
      .select('id, profile_id, token_ciphertext, token_masked, is_active')
      .eq('tenant_id', this.tenantId)
      .in('profile_id', profileIds)
      .eq('is_active', true);

    if (error && isMissingTableError(error)) {
      return new Map();
    }

    if (error) {
      throw new Error(`[dps_get_tokens_by_profiles] ${error.message}`);
    }

    const map = new Map<string, { tokenId: string; token: string; masked: string }>();

    (data ?? []).forEach((row) => {
      const typed = row as Pick<TokenRow, 'id' | 'profile_id' | 'token_ciphertext' | 'token_masked'>;
      try {
        map.set(typed.profile_id, {
          tokenId: typed.id,
          token: decryptDpsToken(typed.token_ciphertext),
          masked: typed.token_masked,
        });
      } catch {
        // Skip malformed encrypted records.
      }
    });

    return map;
  }

  async touchLastUsed(tokenId: string): Promise<void> {
    const { error } = await this.db
      .from('dps_accountant_tokens')
      .update({
        last_used_at: new Date().toISOString(),
      })
      .eq('tenant_id', this.tenantId)
      .eq('id', tokenId);

    if (error && isMissingTableError(error)) {
      return;
    }

    if (error) {
      throw new Error(`[dps_touch_token] ${error.message}`);
    }
  }
}
