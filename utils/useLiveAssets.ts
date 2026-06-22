import { useState, useEffect, useRef } from 'react';
import { Asset } from '../types';
import { fetchAssetPricesInUsd, getCachedPrices } from '../lib/cryptoPrices';

const DEFAULT_FETCH_INTERVAL_MS = 10_000;

function tickerKey(assets: Asset[]): string {
  return assets.map((a) => a.ticker).sort().join(',');
}

function mergeWithCache(base: Asset[]): Asset[] {
  const cached = getCachedPrices();
  if (!cached || Object.keys(cached).length === 0) return base.map((a) => ({ ...a }));
  return base.map((a) => {
    const data = cached[a.ticker];
    if (!data) return { ...a };
    return { ...a, price: data.price, change24h: data.change24h, priceUnavailable: !(data.price > 0) };
  });
}

function mergeWithCachePreservingPrev(base: Asset[], prev: Asset[]): Asset[] {
  const cached = getCachedPrices();
  return base.map((a) => {
    const data = cached?.[a.ticker];
    if (data) return { ...a, price: data.price, change24h: data.change24h, priceUnavailable: !(data.price > 0) };
    const prevAsset = prev.find((p) => p.ticker === a.ticker);
    if (prevAsset) return prevAsset;
    return { ...a };
  });
}

export function useLiveAssets(baseAssets: Asset[], options?: { intervalMs?: number }): Asset[] {
  // Мгновенный старт из кеша — нет мигания
  const [assets, setAssets] = useState<Asset[]>(() => mergeWithCache(baseAssets));
  const baseRef = useRef(baseAssets);
  const tickerKeyRef = useRef(tickerKey(baseAssets));

  useEffect(() => {
    const nextKey = tickerKey(baseAssets);
    if (nextKey !== tickerKeyRef.current) {
      tickerKeyRef.current = nextKey;
      baseRef.current = baseAssets;
      setAssets((prev) => mergeWithCachePreservingPrev(baseAssets, prev));
    } else {
      baseRef.current = baseAssets;
    }
  }, [baseAssets]);

  useEffect(() => {
    // Binance quotes endpoint supports only crypto tickers (e.g. BTCUSDT).
    // Forex/stocks/commodities are shown via TradingView only and must not be requested here.
    const tickers = baseRef.current
      .filter((a) => (a.category ?? 'crypto') === 'crypto')
      .map((a) => a.ticker);
    if (tickers.length === 0) return;

    const applyPrices = (prices: Record<string, { price: number; change24h: number }>) => {
      setAssets((prev) =>
        prev.map((a) => {
          const data = prices[a.ticker];
          if (!data) return a;
          return { ...a, price: data.price, change24h: data.change24h, priceUnavailable: !(data.price > 0) };
        })
      );
    };

    const update = async () => {
      try {
        const prices = await fetchAssetPricesInUsd(tickers);
        if (Object.keys(prices).length > 0) applyPrices(prices);
      } catch {
        // тихо — кеш уже показан
      }
    };

    // Всегда обновляем при маунте — кеш показан мгновенно, но свежие данные важны
    update();

    const intervalMs =
      typeof options?.intervalMs === 'number' && Number.isFinite(options.intervalMs) && options.intervalMs > 250
        ? options.intervalMs
        : DEFAULT_FETCH_INTERVAL_MS;
    const interval = setInterval(update, intervalMs);
    return () => clearInterval(interval);
  }, [options?.intervalMs]);

  return assets;
}
