import { useEffect, useState, useCallback } from 'react';
import type { Deal } from '../types';
import { fetchUserTrades } from '../lib/services/tradeService';

export function useUserTrades(userId: number | null | undefined) {
  const [deals, setDeals] = useState<Deal[]>([]);

  const refreshDeals = useCallback(async () => {
    if (!userId) {
      setDeals([]);
      return;
    }
    const list = await fetchUserTrades(userId);
    setDeals(list);
  }, [userId]);

  useEffect(() => {
    void refreshDeals();
  }, [userId, refreshDeals]);

  return { deals, setDeals, refreshDeals };
}
