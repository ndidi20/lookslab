'use client';

export default function ProPage(){
  const go = async () => {
  try {
    const r = await fetch('/api/billing/create-checkout-session', { method: 'POST' });
    const j = await r.json();
    if (j.url) location.href = j.url;
    else alert(j.error || 'Could not start checkout');
  } catch {
    alert('Network error.');
  }
};


  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-extrabold mb-2">Go Pro</h1>
      <p className="text-sm text-neutral-400 mb-4">
        Unlock Face‑Off Studio, HD exports, captions, and a creator tag.
      </p>
      <button
        onClick={go}
        className="px-4 py-2 rounded bg-violet-500 text-black font-semibold hover:bg-violet-400"
      >
        Upgrade for $5.99/mo
      </button>
      <p className="text-xs text-neutral-500 mt-3">
        Test mode: use card <code>4242&nbsp;4242&nbsp;4242&nbsp;4242</code>
      </p>
    </div>
  );
}
