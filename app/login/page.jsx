'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function Login() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [msg,setMsg] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('Checking…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    setMsg('Welcome back! Redirecting…');
    router.push('/');
  };

  const social = async (provider) => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin }
    });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Log in</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <input className="w-full rounded-md bg-neutral-900 border border-neutral-700 p-3"
                 placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="w-full rounded-md bg-neutral-900 border border-neutral-700 p-3"
                 placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button className="w-full bg-violet-500 hover:bg-violet-400 text-black font-bold rounded-md p-3">
            Log in
          </button>
        </form>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>social('google')} className="border border-neutral-700 rounded-md p-3">Google</button>
          <button onClick={()=>social('apple')} className="border border-neutral-700 rounded-md p-3">Apple</button>
        </div>

        <p className="text-sm text-neutral-400">{msg}</p>
        <p className="text-sm">New here? <a className="underline" href="/signup">Create account</a></p>
      </div>
    </div>
  );
}
