import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readRawBody(req) {
  try { return await req.text(); } catch { return null; }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

export async function POST(req) {
  try {
    // --- Sanity checks BEFORE we touch Supabase client ---
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[WH] Missing STRIPE_SECRET_KEY');
      return new Response('missing stripe secret', { status: 500 });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('[WH] Missing STRIPE_WEBHOOK_SECRET');
      return new Response('missing webhook secret', { status: 500 });
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[WH] Missing supabase admin envs');
      return new Response('missing supabase envs', { status: 500 });
    }

    // Create admin client AFTER checks (avoids top-level throw)
    const supaAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const sig = req.headers.get('stripe-signature');
    const raw = await readRawBody(req);
    if (!sig || !raw) {
      console.error('[WH] No signature/raw body', { hasSig: !!sig, hasRaw: !!raw });
      return new Response('bad request', { status: 400 });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[WH] Signature verify FAILED:', err?.message);
      return new Response('signature failed', { status: 400 });
    }

    console.log('[WH] Event received:', event.type);

    async function setProByCustomer(customerId, { pro, subscriptionId, periodEnd }) {
      console.log('[WH] setProByCustomer:', { customerId, pro, subscriptionId, periodEnd });

      const { data: existing, error: findErr } = await supaAdmin
        .from('profiles')
        .select('id, email, pro, stripe_customer_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (findErr) { console.error('[WH] Supabase find error:', findErr); throw findErr; }
      if (!existing) {
        console.warn('[WH] No profile row found for customer', customerId);
        return; // 200 OK; don’t retry forever
      }

      const { error: updErr } = await supaAdmin
        .from('profiles')
        .update({
          pro,
          stripe_subscription_id: subscriptionId ?? null,
          pro_until: periodEnd ?? null,
        })
        .eq('stripe_customer_id', customerId);

      if (updErr) { console.error('[WH] Supabase update error:', updErr); throw updErr; }
      console.log('[WH] Profile updated OK for', existing.email);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const sub = await stripe.subscriptions.retrieve(s.subscription);
        const active = sub.status === 'active' || sub.status === 'trialing';
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        await setProByCustomer(s.customer, { pro: active, subscriptionId: sub.id, periodEnd });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
      case 'invoice.payment_succeeded': {
        const sub = event.data.object;
        const active = sub.status === 'active' || sub.status === 'trialing';
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        await setProByCustomer(sub.customer, { pro: active, subscriptionId: sub.id, periodEnd });
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.canceled': {
        const sub = event.data.object;
        await setProByCustomer(sub.customer, { pro: false, subscriptionId: sub.id, periodEnd: null });
        break;
      }
      default:
        console.log('[WH] Ignoring event:', event.type);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[WH] Top-level webhook error:', err);
    return new Response('webhook error', { status: 500 });
  }
}
