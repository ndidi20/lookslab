'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ProSuccess() {
  const [status, setStatus] = useState('Checking your subscription…');
  const [tries, setTries] = useState(0);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    let timer;
    const check = async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j = await r.json();
        if (j?.pro) {
          setIsPro(true);
          setStatus('Pro active! Redirecting…');
          // tiny delay so user sees it flip
          setTimeout(() => { window.location.href = '/'; }, 800);
          return;
        }
        // not pro yet – keep polling while webhook processes
        setTries(t => t + 1);
        if (tries < 30) { // ~60s if interval 2000ms
          timer = setTimeout(check, 2000);
        } else {
          setStatus('Still confirming your payment… You can keep using the app; Pro will unlock shortly.');
        }
      } catch {
        setStatus('Network hiccup. Retrying…');
        timer = setTimeout(check, 2000);
      }
    };
    check();
    return () => clearTimeout(timer);
  }, [tries]);

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-extrabold mb-2">Thanks for upgrading 🎉</h1>
      <p className="text-sm text-neutral-400 mb-4">{status}</p>

      {!isPro && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-2 rounded border border-neutral-800 hover:bg-neutral-900"
          >
            Refresh
          </button>
          <Link
            href="/"
            className="px-3 py-2 rounded bg-violet-500 text-black font-semibold hover:bg-violet-400"
          >
            Go to Home
          </Link>
        </div>
      )}
    </div>
  );
}
