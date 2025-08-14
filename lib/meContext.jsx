'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const MeCtx = createContext(null);

export function MeProvider({ children }) {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [me, setMe] = useState({
    loading: true,
    loggedIn: false,
    email: null,
    pro: false,
  });

  // Helper: fetch server-truth (email + pro) without blocking UI
  const refreshFromServer = async () => {
    try {
      const r = await fetch('/api/me', { cache: 'no-store' });
      if (!r.ok) throw new Error('me failed');
      const data = await r.json();
      setMe((s) => ({ ...s, ...data, loading: false }));
    } catch {
      // If server can’t confirm, keep what we have but drop loading
      setMe((s) => ({ ...s, loading: false }));
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      // 1) Instant client session for snappy UI
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session ?? null;

      if (!mounted) return;

      if (session?.user) {
        // Optimistic: we already know user is logged in
        setMe((s) => ({
          ...s,
          loading: false,
          loggedIn: true,
          email: session.user.email ?? s.email,
        }));
        // Get server-truth (pro flag, etc.) in the background
        refreshFromServer();
      } else {
        setMe({ loading: false, loggedIn: false, email: null, pro: false });
      }
    })();

    // 2) Update immediately on auth changes
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (!mounted) return;

      if (session?.user) {
        setMe((s) => ({
          ...s,
          loggedIn: true,
          email: session.user.email ?? s.email,
        }));
        // Bring in server-truth quietly
        refreshFromServer();
      } else {
        setMe({ loading: false, loggedIn: false, email: null, pro: false });
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  const value = useMemo(() => ({ me, setMe, refreshFromServer }), [me]);

  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>;
}

export function useMe() {
  const ctx = useContext(MeCtx);
  if (!ctx) throw new Error('useMe must be used inside <MeProvider>');
  return ctx;
}
