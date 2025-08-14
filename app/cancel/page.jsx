'use client';
import Link from 'next/link';

export default function Cancel() {
  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-extrabold mb-2">Payment canceled</h1>
      <p className="text-sm text-neutral-400 mb-4">
        No charge was made. You can try again anytime.
      </p>
      <div className="flex items-center gap-3">
        <Link href="/pro" className="px-3 py-2 rounded bg-violet-500 text-black font-semibold hover:bg-violet-400">
          Try again
        </Link>
        <Link href="/" className="px-3 py-2 rounded border border-neutral-800 hover:bg-neutral-900">
          Back home
        </Link>
      </div>
    </div>
  );
}
