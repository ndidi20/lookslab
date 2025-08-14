'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AccountPage() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/me', { cache: 'no-store' });
      const j = await r.json();
      setMe(j);
    })();
  }, []);

  const openPortal = async () => {
    const r = await fetch('/api/billing/create-portal-session', { method: 'POST' });
    const j = await r.json();
    if (j.url) location.href = j.url;
    else alert(j.error || 'Could not open portal');
  };

  if (!me) return <div className="max-w-xl mx-auto p-6">Loading…</div>;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-extrabold">Account</h1>
      <div className="text-sm text-neutral-400">Signed in as {me.email ?? 'unknown'}</div>

      <div className="p-4 rounded-lg border border-neutral-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Subscription</div>
            <div className="text-sm text-neutral-400">{me.pro ? 'Pro (active)' : 'Free'}</div>
          </div>
          {me.pro ? (
            <button onClick={openPortal}
              className="px-3 py-2 rounded bg-violet-500 text-black font-semibold hover:bg-violet-400">
              Manage billing
            </button>
          ) : (
            <Link href="/pro" className="px-3 py-2 rounded bg-violet-500 text-black font-semibold hover:bg-violet-400">
              Go Pro
            </Link>
          )}
        </div>
      </div>

      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">← Back home</Link>
    </div>
  );
}
