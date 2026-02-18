'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { getSupabaseBrowserClient } from '../server/supabase-browser';
import { mapDbProfile } from '../mappers';
import { createProfile, updateProfile, deactivateProfile } from '../actions/profiles';
import type { Profile } from '../types';

export function useProfiles() {
  const supabase = getSupabaseBrowserClient();
  return useQuery<Profile[]>({
    queryKey: queryKeys.profiles.all,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map(mapDbProfile);
    },
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles.all });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Profile> & { id: string }) => updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles.all });
    },
  });
}

export function useDeactivateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => deactivateProfile(profileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles.all });
    },
  });
}
