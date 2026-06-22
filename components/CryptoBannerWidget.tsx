import React, { useEffect, useState } from 'react';

import type { BannerMarketId } from '../lib/bannerMarketsApiCore';
import { fetchBannerMarketsClientFallback } from '../lib/bannerMarketsClient';

type GeckoMarketCoin = {
  id: BannerMarketId;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price: number[] };
};

const COINS: Array<{
  id: BannerMarketId;
  label: string;
  logoUrl: string;
  ticker: string;
}> = [
  {
    id: 'bitcoin',
    label: 'Bitcoin',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Bitcoin.svg/960px-Bitcoin.svg.png',
    ticker: 'BTC',
  },
  {
    id: 'ethereum',
    label: 'Ethereum',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ethereum_Logo.png',
    ticker: 'ETH',
  },
  {
    id: 'solana',
    label: 'Solana',
    logoUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=029',
    ticker: 'SOL',
  },
  {
    id: 'ripple',
    label: 'Ripple',
    logoUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=029',
    ticker: 'XRP',
  },
];

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const fractionDigits = abs >= 1000 ? 0 : abs >= 10 ? 2 : abs >= 1 ? 3 : 5;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

function fallbackSpark(seed: string, size: number) {
  const base = Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const out: number[] = [];
  for (let i = 0; i < size; i++) {
    const t = i / Math.max(1, size - 1);
    const a = 0.55 + ((base % 7) / 20);
    const b = 0.25 + ((base % 11) / 30);
    const c = 0.18 + ((base % 5) / 40);
    const v =
      Math.sin((t * (6 + (base % 5))) * Math.PI) * a +
      Math.sin((t * (10 + (base % 9))) * Math.PI) * b +
      Math.cos((t * (4 + (base % 3))) * Math.PI) * c;
    out.push(v);
  }
  return out;
}

function sparklinePoints(values: number[], w: number, h: number, pad = 2) {
  if (!values || values.length < 2) return '';
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '';
  if (min === max) {
    const y = Math.round(h / 2);
    return `0,${y} ${w},${y}`;
  }
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  const step = innerW / (values.length - 1);
  const pts: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const x = pad + i * step;
    const t = (v - min) / (max - min);
    const y = pad + (1 - t) * innerH;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

export default function CryptoBannerWidget() {
  const [data, setData] = useState<Partial<Record<BannerMarketId, GeckoMarketCoin>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const arr = (await fetchBannerMarketsClientFallback(
          COINS.map((c) => c.id) as BannerMarketId[],
        )) as GeckoMarketCoin[];

        if (cancelled) return;

        const map: Partial<Record<BannerMarketId, GeckoMarketCoin>> = {};
        for (const c of arr) {
          if (!c?.id) continue;
          map[c.id] = c;
        }
        setData(map);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-2 rounded-2xl bg-surfaceElevated overflow-hidden ring-1 ring-white/5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.04]">
        {COINS.map((coin) => {
          const row = data?.[coin.id];
          const price = typeof row?.current_price === 'number' && row.current_price > 0 ? row.current_price : undefined;
          const change = row?.price_change_percentage_24h;
          const sparkRaw = row?.sparkline_in_7d?.price?.filter(Number.isFinite).slice(-48) ?? [];
          const spark = sparkRaw.length >= 2 ? sparkRaw : fallbackSpark(coin.id, 48);
          const up = (change ?? 0) >= 0;
          const stroke = up ? 'var(--color-up)' : 'var(--color-down)';

          return (
            <div
              key={coin.id}
              className="bg-surfaceElevated px-3 py-2.5 hover:bg-white/[0.03] transition-all duration-200 group cursor-pointer active:scale-[0.99]"
            >

              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  <img
                    src={coin.logoUrl}
                    alt=""
                    className="h-4 w-4 rounded-full bg-background object-contain"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-textPrimary truncate">{coin.ticker}</div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={[
                      'text-[9px] font-bold tabular-nums',
                      typeof change === 'number' ? (up ? 'text-up' : 'text-down') : 'text-textMuted',
                    ].join(' ')}
                  >
                    {typeof change === 'number' ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '0.00%'}
                  </div>
                </div>
              </div>
              
              <div className="text-[13px] font-mono font-bold text-textPrimary tabular-nums leading-none mb-1">
                {typeof price === 'number' ? formatUsd(price) : '$0.00'}
              </div>

              <div className="h-5 opacity-50 group-hover:opacity-100 transition-opacity">
                <svg width="100%" height="20" viewBox="0 0 120 20" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    fill="none"
                    stroke={stroke}
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={sparklinePoints(spark, 120, 20, 2)}
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
