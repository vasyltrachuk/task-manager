'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbLicense } from '../mappers';
import { createLicense, updateLicense, deleteLicense } from '../actions/licenses';
import type { License } from '../types';

const LICENSE_SELECT = `
  *,
  client:clients (*),
  responsible:profiles (*)
`;

export function useLicenses() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<License[]>({
    queryKey: queryKeys.licenses.all,
    queryFn: async (): Promise<License[]> => {
      const { data, error } = await supabase
        .from('licenses')
        .select(LICENSE_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbLicense(row));
    },
  });
}

export function useLicensesByClient(clientId: string) {
  const supabase = getSupabaseBrowserClient();
  return useQuery<License[]>({
    queryKey: queryKeys.licenses.byClient(clientId),
    queryFn: async (): Promise<License[]> => {
      const { data, error } = await supabase
        .from('licenses')
        .select(LICENSE_SELECT)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapDbLicense(row));
    },
    enabled: !!clientId,
  });
}

export function useCreateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createLicense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.licenses.all });
    },
  });
}

export function useUpdateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateLicense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.licenses.all });
    },
  });
}

export function useDeleteLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (licenseId: string) => deleteLicense(licenseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.licenses.all });
    },
  });
}
