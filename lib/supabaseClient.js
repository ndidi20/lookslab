'use client';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
export function supabaseClient() {
  return createClientComponentClient();
}
