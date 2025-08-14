import Stripe from 'stripe';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

export async function POST() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Missing STRIPE_SECRET_KEY');
    }
    const returnUrl =
      process.env.STRIPE_PORTAL_RETURN_URL ||
      `${process.env.NEXT_PUBLIC_SITE_URL}/account`;
    if (!returnUrl) {
      throw new Error('Missing STRIPE_PORTAL_RETURN_URL / NEXT_PUBLIC_SITE_URL');
    }

    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    // 1) Load profile
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, email, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    if (pErr) throw pErr;

    let customerId = profile?.stripe_customer_id;

    // 2) If missing, try to look up or create by email and backfill
    if (!customerId) {
      const email = user.email || profile?.email;
      if (!email) throw new Error('No email on user/profile to locate Stripe customer');

      // Try to find existing customer by email
      const search = await stripe.customers.search({
        query: `email:"${email}"`,
      });
      let customer = search.data?.[0];

      if (!customer) {
        customer = await stripe.customers.create({ email });
      }
      customerId = customer.id;

      // Backfill Supabase for future requests
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // 3) Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return Response.json({ url: session.url });
  } catch (e) {
    console.error('portal error:', e);
    // expose message during development to help you debug
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
