import type { BannerMarketId } from './bannerMarketsApiCore';
import { fetchAssetPricesInUsd } from './cryptoPrices';

export type BannerClientRow = {
  id: BannerMarketId;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price: number[] };
};

const META: Record<BannerMarketId, { symbol: string; name: string }> = {
  bitcoin: { symbol: 'btc', name: 'Bitcoin' },
  ethereum: { symbol: 'eth', name: 'Ethereum' },
  solana: { symbol: 'sol', name: 'Solana' },
  ripple: { symbol: 'xrp', name: 'Ripple' },
};

export async function fetchBannerMarketsClientFallback(
  ids: BannerMarketId[]
): Promise<BannerClientRow[]> {
  let crypto: Record<string, { price: number; change24h: number }> = {};
  try {
    crypto = await fetchAssetPricesInUsd(['BTC', 'ETH', 'SOL', 'XRP']);
  } catch {
    crypto = {};
  }

  const out: BannerClientRow[] = [];
  for (const id of ids) {
    const meta = META[id];
    if (!meta) continue;
    if (id === 'bitcoin') {
      const row = crypto.BTC;
      const px = typeof row?.price === 'number' ? row.price : 0;
      const ch = typeof row?.change24h === 'number' ? row.change24h : null;
      out.push({
        id,
        symbol: meta.symbol,
        name: meta.name,
        image: '',
        current_price: px,
        price_change_percentage_24h: ch,
        sparkline_in_7d: { price: [] },
      });
      continue;
    }
    if (id === 'ethereum') {
      const row = crypto.ETH;
      const px = typeof row?.price === 'number' ? row.price : 0;
      const ch = typeof row?.change24h === 'number' ? row.change24h : null;
      out.push({
        id,
        symbol: meta.symbol,
        name: meta.name,
        image: '',
        current_price: px,
        price_change_percentage_24h: ch,
        sparkline_in_7d: { price: [] },
      });
      continue;
    }
    if (id === 'solana') {
      const row = crypto.SOL;
      out.push({
        id,
        symbol: meta.symbol,
        name: meta.name,
        image: '',
        current_price: typeof row?.price === 'number' ? row.price : 0,
        price_change_percentage_24h: typeof row?.change24h === 'number' ? row.change24h : null,
        sparkline_in_7d: { price: [] },
      });
      continue;
    }
    if (id === 'ripple') {
      const row = crypto.XRP;
      out.push({
        id,
        symbol: meta.symbol,
        name: meta.name,
        image: '',
        current_price: typeof row?.price === 'number' ? row.price : 0,
        price_change_percentage_24h: typeof row?.change24h === 'number' ? row.change24h : null,
        sparkline_in_7d: { price: [] },
      });
    }
  }
  return out;
}
