// middleware.js (pure JS)

import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req) {
  // Create a response object for Supabase helper
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Which paths do we want to guard?
  const pathname = req.nextUrl.pathname;
  const isStudio = pathname.startsWith('/studio');
  const isBillingApi = pathname.startsWith('/api/billing');
  const isAccount = pathname.startsWith('/account');

  // Only guard the selected paths
  if (!isStudio && !isBillingApi && !isAccount) return res;

  // Require an authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // (Optional) If later we want to block non‑Pro from /studio,
  // we can read a cookie or make a very quick API call — but
  // keep middleware light for performance. For now, login‑only.
  return res;
}

// Tell Next which routes run through this middleware
export const config = {
  matcher: ['/studio/:path*', '/api/billing/:path*', '/account'],
};
