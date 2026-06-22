import { removeChannelDeferred, type TradeRealtimeChannel } from '../shared';
import { supabase } from '../supabase';
import { refreshNftListingsFromSupabase } from '../nftSupabase';
import { fetchReferrerNftPolicies, type NftReferrerPolicies } from '../nftReferrerPricing';

export async function initializeNftData(
  userId: number | null | undefined,
  referrerId: number | null | undefined,
): Promise<NftReferrerPolicies> {
  await refreshNftListingsFromSupabase();

  if (!userId || !referrerId) {
    return { prices: {}, pricesUsd: {}, duoByTicker: {}, jitter: 1 };
  }

  return await fetchReferrerNftPolicies(userId);
}

let nftChannelSeq = 0;

export function subscribeToNftUpdates(onUpdate: () => void): () => void {
  // Имя канала должно быть уникальным на каждый вызов: removeChannel
  // в removeChannelDeferred срабатывает с задержкой, и если эффект
  // (React StrictMode dev double-invoke) пересоздаёт подписку раньше,
  // supabase.channel(name) вернёт ещё не удалённый, уже subscribed
  // канал с тем же именем — и .on() на нём упадёт.
  const channelName = `nft-prices-realtime-${++nftChannelSeq}`;

  const nftChannel: TradeRealtimeChannel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nft_listings' }, () => {
      onUpdate();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'worker_nft_policies' }, () => {
      onUpdate();
    })
    .subscribe();

  return () => {
    removeChannelDeferred(supabase, nftChannel);
  };
}
