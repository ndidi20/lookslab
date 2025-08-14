'use client';
import { MeProvider } from '@/lib/meContext';

export default function Providers({ children }) {
  return <MeProvider>{children}</MeProvider>;
}
