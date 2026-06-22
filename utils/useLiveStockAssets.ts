import { useState, useEffect, useRef } from 'react';
import type { Asset } from '../types';
import { fetchFinnhubQuote, finnhubQuoteToRubRow, resolveUsdRate } from '../lib/finnhubStockQuotes';

const STOCK_CACHE_KEY = 'mexc_stock_quotes_v1';
const QUOTE_REQUEST_GAP_MS = 1200;
const DEFAULT_PAUSE_BETWEEN_CYCLES_MS = 28_000;

type StockCache = {
  prices: Record<string, { price: number; change24h: number; volume24h?: number }>;
  timestamp: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readStockCache(): Record<string, { price: number; change24h: number; volume24h?: number }> | null {
  try {
    const raw = localStorage.getItem(STOCK_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StockCache;
    if (!data?.prices || Object.keys(data.prices).length === 0) return null;
    // stale-while-revalidate: возвращаем кеш любого возраста — лучше старая цена чем никакой
    return data.prices;
  } catch {
    return null;
  }
}

function writeStockCacheFromAssets(rows: Asset[]) {
  const snap: Record<string, { price: number; change24h: number; volume24h?: number }> = {};
  rows.forEach((a) => {
    if ((a.category ?? 'crypto') !== 'stock') return;
    if (!(a.price > 0)) return;
    snap[a.ticker] = {
      price: a.price,
      change24h: a.change24h ?? 0,
      ...(a.volume24h != null && a.volume24h > 0 ? { volume24h: a.volume24h } : {}),
    };
  });
  if (Object.keys(snap).length === 0) return;
  try {
    localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify({ prices: snap, timestamp: Date.now() } satisfies StockCache));
  } catch {}
}

function mergeStockCache(base: Asset[]): Asset[] {
  const cached = readStockCache();
  if (!cached) return base.map((a) => ({ ...a }));
  return base.map((a) => {
    const row = cached[a.ticker];
    if (!row) return { ...a };
    return {
      ...a,
      price: row.price,
      change24h: row.change24h,
      volume24h: row.volume24h ?? a.volume24h,
      priceUnavailable: !(row.price > 0),
    };
  });
}

function tickerKey(assets: Asset[]): string {
  return assets.map((a) => a.ticker).sort().join(',');
}

function applyQuoteRow(
  prev: Asset,
  p: { price: number; change24h: number; unavailable: boolean }
): Asset {
  const hadGood = prev.price > 0 && !prev.priceUnavailable;
  if (p.unavailable || !(p.price > 0)) {
    if (hadGood) return prev;
    return { ...prev, price: 0, change24h: p.change24h ?? 0, priceUnavailable: true };
  }
  return { ...prev, price: p.price, change24h: p.change24h, priceUnavailable: false };
}

export function useLiveStockAssets(
  baseAssets: Asset[],
  options?: { perUsd?: number | null; quoteIntervalMs?: number }
): Asset[] {
  const [assets, setAssets] = useState<Asset[]>(() => mergeStockCache(baseAssets));
  const baseRef = useRef(baseAssets);
  const tickerKeyRef = useRef(tickerKey(baseAssets));
  const rubOptRef = useRef<number | null>(options?.perUsd ?? null);
  const lastGoodRubRef = useRef<number | null>(null);

  rubOptRef.current = options?.perUsd ?? null;

  useEffect(() => {
    const nextKey = tickerKey(baseAssets);
    if (nextKey !== tickerKeyRef.current) {
      tickerKeyRef.current = nextKey;
      baseRef.current = baseAssets;
      setAssets((prev) => {
        const cached = readStockCache();
        return baseAssets.map((a) => {
          const row = cached?.[a.ticker];
          const prevA = prev.find((p) => p.ticker === a.ticker);
          if (row) {
            return {
              ...a,
              price: row.price,
              change24h: row.change24h,
              volume24h: row.volume24h ?? a.volume24h,
              priceUnavailable: !(row.price > 0),
            };
          }
          return prevA ?? { ...a };
        });
      });
    } else {
      baseRef.current = baseAssets;
    }
  }, [baseAssets]);

  const quoteIntervalMs = options?.quoteIntervalMs;

  useEffect(() => {
    const pauseBetweenCycles =
      typeof quoteIntervalMs === 'number' && Number.isFinite(quoteIntervalMs) && quoteIntervalMs >= 8000
        ? quoteIntervalMs
        : DEFAULT_PAUSE_BETWEEN_CYCLES_MS;

    let cancelled = false;

    const runOneCycle = async () => {
      const list = baseRef.current.filter((a) => (a.category ?? 'crypto') === 'stock');
      if (list.length === 0) return;

      let rub = resolveUsdRate(rubOptRef.current);
      if (rub != null && rub > 0) lastGoodRubRef.current = rub;
      else rub = lastGoodRubRef.current;

      // Если нет курса RUB/USD — не можем обновить, но кеш уже показан при маунте
      if (rub == null || !(rub > 0)) return;

      const priceMap: Record<string, { price: number; change24h: number; unavailable: boolean }> = {};
      for (let i = 0; i < list.length; i++) {
        if (cancelled) return;
        const a = list[i];
        const q = await fetchFinnhubQuote(a.ticker);
        priceMap[a.ticker] = finnhubQuoteToRubRow(q, rub);
        if (i < list.length - 1) await sleep(QUOTE_REQUEST_GAP_MS);
      }
      if (cancelled) return;

      setAssets((prev) => {
        const next = prev.map((x) => {
          if ((x.category ?? 'crypto') !== 'stock') return x;
          const p = priceMap[x.ticker];
          if (!p) return x;
          return applyQuoteRow(x, p);
        });
        writeStockCacheFromAssets(next);
        return next;
      });
    };

    const loop = async () => {
      while (!cancelled) {
        await runOneCycle();
        if (cancelled) return;
        await sleep(pauseBetweenCycles);
      }
    };

    void loop();
    return () => {
      cancelled = true;
    };
  }, [quoteIntervalMs, tickerKey(baseAssets)]);

  return assets;
}
