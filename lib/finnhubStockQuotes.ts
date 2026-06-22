import { FINNHUB_API_KEY, FINNHUB_BASE } from './finnhubConfig';
import { getMarketUsdToRub } from './cryptoPrices';

export interface FinnhubQuoteJson {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const FINNHUB_FETCH_TIMEOUT_MS = 8_000;

export async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuoteJson | null> {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return null;
  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(s)}&token=${encodeURIComponent(FINNHUB_API_KEY)}`;
  const doFetch = async (): Promise<Response> => {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), FINNHUB_FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { signal: ac.signal });
    } finally {
      clearTimeout(tid);
    }
  };
  try {
    let res = await doFetch();
    if (res.status === 429) {
      await sleep(2500);
      res = await doFetch();
    }
    if (res.status === 429) {
      await sleep(5000);
      res = await doFetch();
    }
    if (!res.ok) return null;
    const j = (await res.json()) as FinnhubQuoteJson;
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

export function finnhubQuoteToRubRow(
  q: FinnhubQuoteJson | null,
  _perUsd: number | null
): { price: number; change24h: number; unavailable: boolean } {
  const usd = Number(q?.c);
  const dp = Number(q?.dp);
  const change24h = Number.isFinite(dp) ? dp : 0;
  return {
    price: Number.isFinite(usd) && usd > 0 ? usd : 0,
    change24h,
    unavailable: !(usd > 0),
  };
}

export async function fetchFinnhubQuoteInUsd(
  symbol: string,
  perUsd: number | null
): Promise<{ price: number; change24h: number; unavailable: boolean }> {
  const q = await fetchFinnhubQuote(symbol);
  return finnhubQuoteToRubRow(q, perUsd);
}

/** Rub/USD для конвертации: сначала курс из market_quotes, иначе из кеша приложения. */
export function resolveUsdRate(fallbackFromRates?: number | null): number | null {
  const x = Number(fallbackFromRates);
  if (Number.isFinite(x) && x > 55 && x < 220) return x;
  return getMarketUsdToRub();
}
