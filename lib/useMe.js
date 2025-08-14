'use client';

import { useEffect, useState } from 'react';

export function useMe() {
  const [me, setMe] = useState({ loggedIn: false, pro: false, email: null, checking: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j = r.ok ? await r.json() : { loggedIn: false, pro: false, email: null };
        if (alive) setMe({ ...j, checking: false });
      } catch {
        if (alive) setMe({ loggedIn: false, pro: false, email: null, checking: false });
      }
    })();
    return () => { alive = false; };
  }, []);

  return me;
}
