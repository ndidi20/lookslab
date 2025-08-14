import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ loggedIn: false, email: null, pro: false });
  }

  const { data } = await supabase
    .from('profiles')
    .select('email, pro')
    .eq('id', user.id)
    .maybeSingle();

  return Response.json({
    loggedIn: true,
    email: data?.email || user.email || null,
    pro: !!data?.pro
  });
}
