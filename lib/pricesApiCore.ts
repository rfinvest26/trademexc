/**
 * Shared price fetch core for browser clients.
 * Источники: USD/RUB, CoinLore и CoinGecko.
 */

import { COINGECKO_ID_BY_TICKER } from './pricesCoingeckoMap.js';
import { COINLORE_ID_BY_TICKER } from './pricesCoinloreMap.js';

type PricesResponse = {
  usdToRub: number;
  prices: Record<string, { price: number; change24h: number }>;
};

const COINLORE_TICKER_URL = 'https://api.coinlore.net/api/ticker/';

async function fetchUsdToRub(signal?: AbortSignal): Promise<number> {
  const sources = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const data = (await res.json()) as { usd?: Record<string, number> };
      const rub = data?.usd?.rub;
      if (typeof rub === 'number' && Number.isFinite(rub) && rub > 0) return rub;
    } catch {
      // next
    }
  }
  return 90;
}

function baseTickerFromPair(symbolUpper: string): string {
  const s = symbolUpper.toUpperCase();
  if (s.endsWith('USDT')) return s.slice(0, -4) || s;
  return s;
}

type CoinloreTickerRow = {
  id?: string;
  symbol?: string;
  price_usd?: string;
  percent_change_24h?: string;
};

/**
 * CoinLore: батчи `GET /api/ticker/?id=90,80,...` без ключа API.
 * Ответ массив; цена в USD — умножаем на тот же usd→RUB, что и Binance.
 */
async function fetchCoinloreFill(
  symbolListUsdtPair: string[],
  _usdToRub: number,
  filledKeys: Set<string>,
  signal?: AbortSignal
): Promise<PricesResponse['prices']> {
  const out: PricesResponse['prices'] = {};

  /** один CoinLore id → какие ключи нам нужно заполнить (например POLUSDT). */
  const idToBinanceKeys: Record<string, string[]> = {};

  for (const pair of symbolListUsdtPair) {
    const raw = pair.toUpperCase().trim();
    const key = raw.endsWith('USDT') ? raw : `${raw}USDT`;
    if (!key.endsWith('USDT') || key === 'USDTRUB') continue;
    if (filledKeys.has(key)) continue;

    const base = baseTickerFromPair(key);
    const loreId = COINLORE_ID_BY_TICKER[base];
    if (!loreId) continue;
    if (!idToBinanceKeys[loreId]) idToBinanceKeys[loreId] = [];
    idToBinanceKeys[loreId].push(key);
  }

  const uniqIds = [...new Set(Object.keys(idToBinanceKeys))];
  if (uniqIds.length === 0) return out;

  const chunks: string[][] = [];
  for (let i = 0; i < uniqIds.length; i += 45) chunks.push(uniqIds.slice(i, i + 45));

  for (const chunk of chunks) {
    try {
      const query = encodeURIComponent(chunk.join(','));
      const res = await fetch(`${COINLORE_TICKER_URL}?id=${query}`, {
        signal,
        headers: { Accept: 'application/json', 'User-Agent': 'prices-api/1.0' },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as unknown;
      const rows = Array.isArray(data) ? (data as CoinloreTickerRow[]) : [];

      const byId = new Map(rows.map((r) => [String(r.id ?? ''), r]));

      for (const lid of chunk) {
        const row = byId.get(lid);
        const px = parseFloat(String(row?.price_usd ?? ''));
        const chRaw = parseFloat(String(row?.percent_change_24h ?? '0'));
        const targets = idToBinanceKeys[lid];
        if (!targets?.length || !Number.isFinite(px) || px <= 0) continue;

        for (const binanceKey of targets) {
          if (filledKeys.has(binanceKey)) continue;
          out[binanceKey] = {
            price: px,
            change24h: Number.isFinite(chRaw) ? chRaw : 0,
          };
        }
      }
    } catch {
      // next chunk
    }
  }

  return out;
}

async function fetchCoingeckoFill(
  symbolListUsdtPair: string[],
  _usdToRub: number,
  filledKeys: Set<string>,
  signal?: AbortSignal
): Promise<PricesResponse['prices']> {
  const out: PricesResponse['prices'] = {};
  const ids: string[] = [];
  const idToSymbols: Record<string, string[]> = {};

  for (const pair of symbolListUsdtPair) {
    const p = pair.toUpperCase();
    const key = p.endsWith('USDT') ? p : `${p}USDT`;
    if (filledKeys.has(key)) continue;
    const base = baseTickerFromPair(p.endsWith('USDT') ? p : `${p}USDT`);
    const cid = COINGECKO_ID_BY_TICKER[base];
    if (!cid) continue;

    ids.push(cid);
    if (!idToSymbols[cid]) idToSymbols[cid] = [];
    idToSymbols[cid].push(key);
  }

  const uniqIds = [...new Set(ids)];
  if (uniqIds.length === 0) return out;

  const chunks: string[][] = [];
  for (let i = 0; i < uniqIds.length; i += 30) chunks.push(uniqIds.slice(i, i + 30));

  const urls = chunks.map((c) => {
    const u = new URL('https://api.coingecko.com/api/v3/simple/price');
    u.searchParams.set('ids', c.join(','));
    u.searchParams.set('vs_currencies', 'usd');
    u.searchParams.set('include_24hr_change', 'true');
    return u.toString();
  });

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const data = (await res.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;
      if (!data || typeof data !== 'object') continue;

      for (const [cid, row] of Object.entries(data)) {
        const px = typeof row?.usd === 'number' ? row.usd : NaN;
        const ch = typeof row?.usd_24h_change === 'number' ? row.usd_24h_change : 0;
        const syms = idToSymbols[cid];
        if (!syms?.length || !Number.isFinite(px) || px <= 0) continue;
        for (const binanceKey of syms) {
          if (filledKeys.has(binanceKey)) continue;
          out[binanceKey] = { price: px, change24h: Number.isFinite(ch) ? ch : 0 };
        }
      }
    } catch {
      // next chunk
    }
  }

  return out;
}

/**
 * Direct browser-friendly sources only: USD/RUB (jsdelivr) + CoinLore + CoinGecko.
 */
export async function fetchPricesForStaticHost(
  symbolPairs: string[],
  signal?: AbortSignal
): Promise<PricesResponse> {
  const want = [...new Set(symbolPairs.map((s) => String(s || '').toUpperCase()).filter(Boolean))];
  if (want.length === 0) return { usdToRub: 90, prices: {} };

  const usdToRub = await fetchUsdToRub(signal);
  let prices: PricesResponse['prices'] = {};
  const filled = new Set<string>();

  const lore = await fetchCoinloreFill(want, usdToRub, filled, signal);
  prices = { ...prices, ...lore };
  for (const k of Object.keys(lore)) filled.add(k);

  const geo = await fetchCoingeckoFill(want, usdToRub, filled, signal);
  prices = { ...prices, ...geo };

  return { usdToRub, prices };
}
