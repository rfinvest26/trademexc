import React, { createContext, useContext, useMemo } from 'react';
import { supabase } from './supabase';
import { nftTickerForListing, type NftListingRow } from './nftCatalog';

export type RpcNftPolicyRow = {
  nft_listing_id?: string;
  spot_ticker?: string | null;
  collection_slug?: string | null;
  nft_code_norm?: string | null;
  custom_price_eth?: number | string | null;
  custom_price_usd?: number | string | null;
  duo_pair_required?: boolean | string | null;
};

export type NftReferrerPolicies = {
  prices: Record<string, number>;
  /** USD price overrides keyed by ticker — bypasses ETH × rate multiplication. */
  pricesUsd: Record<string, number>;
  duoByTicker: Record<string, boolean>;
  jitter: number;
  /** Растёт при любом realtime-обновлении nft_listings/worker_nft_policies. */
  listingsTick?: number;
};

const defaultPolicies: NftReferrerPolicies = { prices: {}, pricesUsd: {}, duoByTicker: {}, jitter: 1, listingsTick: 0 };
const Ctx = createContext<NftReferrerPolicies>(defaultPolicies);

function normalizeTickerKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function NftReferrerPriceProvider({
  prices,
  pricesUsd,
  duoByTicker,
  listingsTick,
  children,
}: {
  prices: Record<string, number>;
  pricesUsd?: Record<string, number>;
  duoByTicker?: Record<string, boolean>;
  listingsTick?: number;
  children: React.ReactNode;
}) {
  const [jitter, setJitter] = React.useState<number>(1);

  React.useEffect(() => {
    let timeoutId: number;
    const tick = () => {
      // Simulate market jitter: +/- 0.2%
      const newJitter = 0.998 + Math.random() * 0.004;
      setJitter(newJitter);
      
      // Random interval between 20 and 30 seconds
      const nextDelay = 20000 + Math.random() * 10000;
      timeoutId = window.setTimeout(tick, nextDelay);
    };

    // Start loop
    timeoutId = window.setTimeout(tick, 20000 + Math.random() * 10000);
    return () => clearTimeout(timeoutId);
  }, []);

  const value = useMemo(
    () => ({ prices, pricesUsd: pricesUsd ?? {}, duoByTicker: duoByTicker ?? {}, jitter, listingsTick: listingsTick ?? 0 }),
    [prices, pricesUsd, duoByTicker, jitter, listingsTick]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNftReferrerPriceMap(): Record<string, number> {
  return useContext(Ctx).prices;
}

export function useNftReferrerPriceUsdMap(): Record<string, number> {
  return useContext(Ctx).pricesUsd;
}

export function useNftReferrerDuoByTicker(): Record<string, boolean> {
  return useContext(Ctx).duoByTicker;
}

export function useNftListingsTick(): number {
  return useContext(Ctx).listingsTick;
}

export function useNftMarketJitter(): number {
  return useContext(Ctx).jitter;
}

function normalizeRpcNftPolicyRows(data: unknown): RpcNftPolicyRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as RpcNftPolicyRow[];
  if (typeof data === 'string') {
    try {
      return normalizeRpcNftPolicyRows(JSON.parse(data) as unknown);
    } catch {
      return [];
    }
  }
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['rows', 'result', 'data', 'items', 'overrides', 'policies'] as const) {
      const v = o[k];
      if (Array.isArray(v)) return v as RpcNftPolicyRow[];
    }
    const looksLikeRow =
      typeof o.spot_ticker === 'string' ||
      o.nft_listing_id != null ||
      o.custom_price_eth != null;
    if (looksLikeRow) return [o as RpcNftPolicyRow];
    const vals = Object.values(o);
    if (vals.length > 0 && vals.every((x) => x != null && typeof x === 'object')) {
      const asRows = vals as RpcNftPolicyRow[];
      if (asRows.some((r) => typeof (r as { spot_ticker?: unknown }).spot_ticker === 'string')) {
        return asRows;
      }
    }
  }
  return [];
}

function policyRowTickerKeys(r: RpcNftPolicyRow): string[] {
  const slug = String(r.collection_slug ?? '').trim();
  const codeRaw = String(r.nft_code_norm ?? '').trim();
  const codeKey = codeRaw.replace(/^#/, '');
  const fromRpc = String(r.spot_ticker ?? '').trim();
  const keys = new Set<string>();
  if (fromRpc) keys.add(normalizeTickerKey(fromRpc));
  if (slug && codeKey) {
    keys.add(
      nftTickerForListing({
        collectionSlug: slug,
        codeKey,
        spotTicker: null,
      })
    );
  }
  return [...keys].filter(Boolean);
}

function parseDuoFlag(v: RpcNftPolicyRow['duo_pair_required']): boolean {
  if (v === true || v === 'true' || v === 't' || v === '1') return true;
  return false;
}

/** Цены и Duo-флаги политик реферера (для реферала на сайте). */
export async function fetchReferrerNftPolicies(
  viewerUid: number | null | undefined
): Promise<NftReferrerPolicies> {
  const prices: Record<string, number> = {};
  const pricesUsd: Record<string, number> = {};
  const duoByTicker: Record<string, boolean> = {};
  if (!Number.isFinite(viewerUid ?? NaN) || (viewerUid ?? 0) <= 0) {
    return { prices, pricesUsd, duoByTicker, jitter: 1 };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) {
    return { prices, pricesUsd, duoByTicker, jitter: 1 };
  }
  const { data, error } = await supabase.rpc('get_referrer_nft_policy_overrides', {
    p_viewer_uid: viewerUid,
  });
  if (error || data == null) return { prices, pricesUsd, duoByTicker, jitter: 1 };
  const rows = normalizeRpcNftPolicyRows(data);
  for (const r of rows) {
    const keys = policyRowTickerKeys(r);
    // Prefer custom_price_usd (fixed USD, no ETH drift) over custom_price_eth
    const pusd = Number(r.custom_price_usd);
    if (Number.isFinite(pusd) && pusd > 0) {
      for (const k of keys) pricesUsd[k] = pusd;
    } else {
      const p = Number(r.custom_price_eth);
      if (Number.isFinite(p) && p > 0) {
        for (const k of keys) prices[k] = p;
      }
    }
    if (parseDuoFlag(r.duo_pair_required)) {
      for (const k of keys) {
        if (k) duoByTicker[k] = true;
      }
    }
  }
  return { prices, pricesUsd, duoByTicker, jitter: 1 };
}

/** @deprecated Prefer fetchReferrerNftPolicies — возвращает только карту цен. */
export async function fetchReferrerNftPriceMap(
  viewerUid: number | null | undefined
): Promise<Record<string, number>> {
  const { prices } = await fetchReferrerNftPolicies(viewerUid);
  return prices;
}

function listingPriceOverrideEth(row: NftListingRow, map: Record<string, number>): number | undefined {
  const k1 = nftTickerForListing(row);
  const st = row.spotTicker?.trim();
  const k2 = st ? normalizeTickerKey(st) : '';
  for (const k of [k1, k2].filter(Boolean)) {
    const c = map[k];
    if (Number.isFinite(c) && c > 0) return c;
  }
  return undefined;
}

export function enrichNftListingRow(
  row: NftListingRow,
  map: Record<string, number>,
  globalJitter: number = 1,
  mapUsd?: Record<string, number>,
): NftListingRow {
  // USD override: fixed price, no ETH multiplication — store on customPriceUsd
  if (mapUsd) {
    const k1 = nftTickerForListing(row);
    const k2 = row.spotTicker ? row.spotTicker.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
    for (const k of [k1, k2].filter(Boolean)) {
      const usd = mapUsd[k];
      if (Number.isFinite(usd) && usd > 0) {
        return { ...row, customPriceUsd: usd * globalJitter };
      }
    }
  }
  // ETH override: multiplied by live ETH rate in TradingPage
  const custom = listingPriceOverrideEth(row, map);
  const basePrice = (Number.isFinite(custom) && custom && custom > 0) ? custom : row.priceEth;
  return { ...row, priceEth: basePrice * globalJitter };
}

export function enrichNftListings(
  rows: NftListingRow[],
  map: Record<string, number>,
  globalJitter: number = 1,
  mapUsd?: Record<string, number>,
): NftListingRow[] {
  return rows.map((r) => enrichNftListingRow(r, map, globalJitter, mapUsd));
}
