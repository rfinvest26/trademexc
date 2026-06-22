import { useEffect, useState, useCallback } from 'react';
import { initializeNftData, subscribeToNftUpdates } from '../lib/services/nftService';
import { refreshNftListingsFromSupabase } from '../lib/nftSupabase';
import type { NftReferrerPolicies } from '../lib/nftReferrerPricing';

export function useNftRealtime(userId: number | null | undefined, referrerId: number | null | undefined) {
  const [nftPolicies, setNftPolicies] = useState<NftReferrerPolicies>({
    prices: {},
    pricesUsd: {},
    duoByTicker: {},
    jitter: 1,
  });
  // Растёт при любом изменении nft_listings/worker_nft_policies — независимо от
  // наличия реферера. Страницы подписывают на это значение свои useMemo, иначе
  // обновлённый кеш цен из nftCatalog.ts не вызывает перерисовку.
  const [listingsTick, setListingsTick] = useState(0);

  const refreshNftData = useCallback(async () => {
    if (!userId || !referrerId) return;
    const policies = await initializeNftData(userId, referrerId);
    setNftPolicies(policies);
  }, [userId, referrerId]);

  // Базовые цены (nft_listings) должны жить в реальном времени для ВСЕХ
  // пользователей, а не только для тех, у кого есть привязанный реферер.
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupListings = async () => {
      await refreshNftListingsFromSupabase();
      setListingsTick((tick) => tick + 1);

      unsubscribe = subscribeToNftUpdates(async () => {
        await refreshNftListingsFromSupabase();
        setListingsTick((tick) => tick + 1);
      });
    };

    void setupListings();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Реферальные оверрайды (кастомные цены, дуо-флаг) — только для рефералов.
  useEffect(() => {
    if (!userId || !referrerId) {
      setNftPolicies({
        prices: {},
        pricesUsd: {},
        duoByTicker: {},
        jitter: 1,
      });
      return;
    }

    let interval: number;

    const setupPolicies = async () => {
      await refreshNftData();

      // Polling for policies every 3 seconds to ensure real-time updates
      // even if Supabase RLS blocks realtime replication for worker_nft_policies
      interval = window.setInterval(async () => {
        const { fetchReferrerNftPolicies } = await import('../lib/nftReferrerPricing');
        const policies = await fetchReferrerNftPolicies(userId);
        setNftPolicies(policies);
      }, 3000);
    };

    void setupPolicies();

    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [userId, referrerId, refreshNftData]);

  return { ...nftPolicies, listingsTick };
}
