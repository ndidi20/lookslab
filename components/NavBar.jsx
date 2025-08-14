'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

function useOutside(ref, onAway) {
  useEffect(() => {
    const h = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onAway?.();
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h, { passive: true });
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, [ref, onAway]);
}

export default function NavBar() {
  const supabase = createClientComponentClient();
  const [me, setMe] = useState({ loggedIn: false, pro: false, email: null }); // UI state
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useOutside(menuRef, () => setOpen(false));

  // Pull server-truth (email + pro) without blocking the optimistic UI
  const refreshFromServer = useCallback(async () => {
    try {
      const r = await fetch('/api/me', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      setMe((s) => ({ ...s, ...data }));
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // 1) Instant client session -> optimistic UI
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;

      if (!mounted) return;

      if (session?.user) {
        setMe((s) => ({
          ...s,
          loggedIn: true,
          email: session.user.email ?? s.email,
        }));
        // 2) Background server-truth (includes `pro`)
        refreshFromServer();
      } else {
        setMe({ loggedIn: false, pro: false, email: null });
      }
    })();

    // 3) React immediately to auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!mounted) return;

      if (session?.user) {
        setMe((s) => ({
          ...s,
          loggedIn: true,
          email: session.user.email ?? s.email,
        }));
        refreshFromServer();
      } else {
        setMe({ loggedIn: false, pro: false, email: null });
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [supabase, refreshFromServer]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setMe({ loggedIn: false, pro: false, email: null });
    // Hard reload to ensure middleware + cookies are fully in sync
    location.href = '/';
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-black/40 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href="/" className="font-extrabold tracking-wide">
          LooksLab
          {me.pro && (
            <span className="ml-2 inline-flex items-center rounded bg-violet-600/20 px-2 py-0.5 text-xs text-violet-200 ring-1 ring-inset ring-violet-600/40">
              PRO
            </span>
          )}
        </Link>

        {/* Right: auth / avatar */}
        <div className="relative" ref={menuRef}>
          {me.loggedIn ? (
            <>
              <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Open account menu"
                className="group inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950 hover:bg-neutral-900"
              >
                {/* stickman user icon */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-neutral-300 group-hover:text-neutral-100"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 12c2.485 0 4.5-2.015 4.5-4.5S14.485 3 12 3 7.5 5.015 7.5 7.5 9.515 12 12 12Z" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-lg border border-neutral-800 bg-black/95 shadow-xl">
                  <div className="px-3 py-2 text-xs text-neutral-400">
                    {me.email}
                  </div>
                  <Link
                    href="/account"
                    className="block px-3 py-2 text-sm hover:bg-neutral-900"
                    onClick={() => setOpen(false)}
                  >
                    Account
                  </Link>
                  <button
                    onClick={signOut}
                    className="block w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-neutral-900"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg border border-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-900"
            >
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
