'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import type { Profile } from './types';
import { getSupabaseBrowserClient } from './server/supabase-browser';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isLoading: true,
  signOut: async () => {},
});

export function AuthProvider({
  children,
  initialProfile,
}: {
  children: ReactNode;
  initialProfile: Profile | null;
}) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [isLoading, setIsLoading] = useState(!initialProfile);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: nextUser } }) => {
      setUser(nextUser);
      if (!initialProfile && !nextUser) {
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, initialProfile]);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
