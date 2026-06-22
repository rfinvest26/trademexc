import { useCallback, useEffect, useState } from 'react';
import type { SpotHolding } from '../types';
import { fetchSpotHoldings } from '../lib/spot';

export function useSpotHoldings(userId: number | null | undefined) {
  const [spotHoldings, setSpotHoldings] = useState<SpotHolding[]>([]);

  const refreshSpotHoldings = useCallback(async () => {
    if (!userId) {
      setSpotHoldings([]);
      return;
    }
    const list = await fetchSpotHoldings(userId);
    setSpotHoldings(list);
  }, [userId]);

  useEffect(() => {
    void refreshSpotHoldings();
  }, [refreshSpotHoldings]);

  return { spotHoldings, setSpotHoldings, refreshSpotHoldings };
}
