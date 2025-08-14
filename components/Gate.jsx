'use client';

import Link from 'next/link';

export default function Gate({
  title,
  body,
  primary,       // { href, label }
  secondary,     // { href, label }
  icon = 'lock', // 'lock' | 'user'
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <div className="rounded-xl border border-neutral-800 bg-black/40 p-6">
        <div className="mb-4 flex items-center gap-3">
          {icon === 'user' ? (
            <svg className="h-5 w-5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 12c2.485 0 4.5-2.015 4.5-4.5S14.485 3 12 3 7.5 5.015 7.5 7.5 9.515 12 12 12Z" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>

        <p className="text-neutral-400 mb-6">{body}</p>

        <div className="flex gap-3">
          {primary && (
            <Link href={primary.href} className="px-4 py-2 rounded bg-violet-600 text-black font-semibold hover:bg-violet-500">
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href} className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-900">
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
