// app/page.jsx
import Link from 'next/link';

export const metadata = {
  title: 'LooksLab — Face score, Face‑Off studio, and glow‑up tips',
  description:
    'Upload a selfie to get an in‑browser score, Face‑Off two pics, export shareable cards, and get practical glow‑up tips. Private. Fast. Mobile‑ready.',
};

export default function HomePage() {
  return (
    <main className="relative">
      {/* background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,#3b2a7a33,transparent_60%),radial-gradient(40%_30%_at_80%_10%,#7c3aed22,transparent_60%),radial-gradient(50%_35%_at_20%_10%,#6d28d933,transparent_60%)]" />
      </div>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-10 md:pt-20 md:pb-14">
        <div className="flex flex-col items-center text-center gap-6">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-400">
            Private • In‑browser • For creators
          </span>

          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">
            Score your look. <span className="text-violet-400">Face‑Off</span>.  
            Export viral cards.
          </h1>

          <p className="max-w-2xl text-neutral-300 text-base md:text-lg">
            LooksLab runs scoring on your device — no photo uploads.  
            Compare two pics in <span className="text-violet-300 font-medium">Face‑Off Studio</span>, and export
            clean 9:16 cards (Pro) ready for TikTok, Shorts, and Reels.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <Link
              href="/scan"
              className="px-5 py-3 rounded-lg bg-violet-500 text-black font-semibold hover:bg-violet-400"
            >
              Try Score
            </Link>
            <Link
              href="/studio"
              className="px-5 py-3 rounded-lg border border-neutral-800 hover:bg-neutral-900"
            >
              Face‑Off Studio
            </Link>
            <Link
              href="/pro"
              className="px-5 py-3 rounded-lg border border-violet-700/60 text-violet-300 hover:bg-violet-600/10"
            >
              Go Pro
            </Link>
          </div>

          {/* tiny trust row */}
          <div className="mt-4 text-xs text-neutral-400">
            Test mode available • Watermark‑free exports with Pro
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-5 py-10 grid gap-4 md:grid-cols-3">
        <Feature
          title="On‑device scoring"
          body="We analyze symmetry, jaw, eye area, skin cues & proportions on your device. Nothing is uploaded."
          tag="Private"
        />
        <Feature
          title="Face‑Off Studio"
          body="Drop two pics to auto‑score each side and export a 9:16 mog card in one tap."
          tag="Creators"
        />
        <Feature
          title="Actionable tips"
          body="You also get practical glow‑up suggestions — hair, skin, sleep, grooming — no fluff."
          tag="Results"
        />
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="text-xl font-bold mb-6">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          <Step n="1" title="Pick a photo or use camera" />
          <Step n="2" title="Quick quality checks" sub="Lighting, sharpness & face angle." />
          <Step n="3" title="Get score + tips" sub="Export a shareable card (Pro)." />
        </ol>
      </section>

      {/* CTA split */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="text-lg font-bold">Try it free</h3>
            <p className="text-neutral-300 text-sm mb-4">
              Private scoring with camera or photo. No account needed.
            </p>
            <Link
              href="/scan"
              className="inline-block px-4 py-2 rounded-md bg-violet-500 text-black font-semibold hover:bg-violet-400"
            >
              Try Score
            </Link>
          </Card>

          <Card>
            <h3 className="text-lg font-bold">For creators: Pro</h3>
            <p className="text-neutral-300 text-sm mb-4">
              Unlock Face‑Off exports (9:16), HD single‑card exports, and watermark‑free downloads.
            </p>
            <Link
              href="/pro"
              className="inline-block px-4 py-2 rounded-md border border-violet-700/60 text-violet-300 hover:bg-violet-600/10"
            >
              See Pro
            </Link>
          </Card>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-neutral-900/70">
        <div className="mx-auto max-w-6xl px-5 py-6 text-sm flex flex-col md:flex-row items-center justify-between gap-3 text-neutral-400">
          <span>© {new Date().getFullYear()} LooksLab</span>
          <div className="flex items-center gap-4">
            <Link className="hover:text-neutral-200" href="/privacy">Privacy</Link>
            <Link className="hover:text-neutral-200" href="/terms">Terms</Link>
            <Link className="hover:text-neutral-200" href="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

// -- UI bits --

function Card({ children }) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-black/40 p-5">
      {children}
    </div>
  );
}

function Feature({ title, body, tag }) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-black/40 p-5">
      <div className="text-xs text-violet-300">{tag}</div>
      <h3 className="text-lg font-bold mt-1">{title}</h3>
      <p className="text-sm text-neutral-300 mt-2">{body}</p>
    </div>
  );
}

function Step({ n, title, sub }) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-black/40 p-5">
      <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-700/60 text-violet-300 flex items-center justify-center font-bold">
        {n}
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      {sub && <div className="text-sm text-neutral-300">{sub}</div>}
    </div>
  );
}
