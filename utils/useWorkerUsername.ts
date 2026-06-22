import { useState, useEffect, useRef } from 'react';
import { fetchUserName } from '../lib/services/userNameService';

/**
 * Fetches the username of the worker (referrer) by workerId.
 * Caches result in a ref to avoid repeated DB calls.
 *
 * Returns `null` while loading, empty string if not found.
 */
export function useWorkerUsername(workerId: number | null | undefined): string | null {
  const [username, setUsername] = useState<string | null>(null);
  const cachedRef = useRef<Record<number, string>>({});

  useEffect(() => {
    const wid = Number(workerId);
    if (!Number.isFinite(wid) || wid <= 0) {
      setUsername('');
      return;
    }

    // Return from cache if available
    if (cachedRef.current[wid] !== undefined) {
      setUsername(cachedRef.current[wid]);
      return;
    }

    setUsername(null); // loading

    async function load() {
      const name = await fetchUserName(wid);
      cachedRef.current[wid] = name;
      setUsername(name);
    }

    void load();
  }, [workerId]);

  return username;
}
