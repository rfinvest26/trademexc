/**
 * Каталог NFT: офлайн-сид совпадает с форматом Supabase (collection_name, nft_code, price_eth, image_url).
 * См. supabase_nft_listings_migration.sql для таблицы.
 */

import type { Asset, AssetCategory, NftMeta } from '../types';

/** Строки «как в CSV» после trim. Формат: collection_name,nft_code,price_eth,image_url */
export const NFT_SEED_CSV_ROWS: string[] = [];

export type NftListingRow = {
  /** Строка public.nft_listings.id если подгружали из БД */
  listingDbId?: string | null;
  /** Как в БД `spot_ticker` — должен совпадать с RPC и worker_nft_policies */
  spotTicker?: string | null;
  collectionName: string;
  collectionSlug: string;
  codeDisplay: string;
  codeKey: string;
  priceEth: number;
  imageUrl: string;
  /** Worker USD price override — when set, used as fixed USD price bypassing ETH × rate math. */
  customPriceUsd?: number;
};

export type NftCollectionSummary = {
  slug: string;
  name: string;
  coverUrl: string;
  floorEth: number;
  itemCount: number;
};

const COLLECTION_TICKER_PREFIX: Record<string, string> = {
  'bored-ape-yacht-club': 'BAYC',
  'pudgy-penguins': 'PPG',
};

export function slugifyCollectionName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseCsvRow(line: string): NftListingRow | null {
  const firstComma = line.indexOf(',');
  const lastComma = line.lastIndexOf(',');
  if (firstComma < 0 || lastComma <= firstComma) return null;
  const collectionName = line.slice(0, firstComma).trim();
  const tail = line.slice(firstComma + 1);
  const secondComma = tail.indexOf(',');
  if (secondComma < 0) return null;
  const codePart = tail.slice(0, secondComma).trim();
  const rest = tail.slice(secondComma + 1);
  const thirdComma = rest.indexOf(',');
  if (thirdComma < 0) return null;
  const pricePart = rest.slice(0, thirdComma).trim();
  const imageUrl = rest.slice(thirdComma + 1).trim();
  const priceEth = parseFloat(pricePart.replace(',', '.'));
  if (!collectionName || !codePart || !Number.isFinite(priceEth) || !imageUrl) return null;

  const codeDisplay = codePart.startsWith('#') ? codePart : `#${codePart}`;
  const codeKey = codePart.replace(/^#/, '').trim();
  const collectionSlug = slugifyCollectionName(collectionName);

  return {
    collectionName,
    collectionSlug,
    codeDisplay,
    codeKey,
    priceEth,
    imageUrl,
  };
}

let cachedParsed: NftListingRow[] | null = null;

export function parseNftSeedRows(rows: string[]): NftListingRow[] {
  const out: NftListingRow[] = [];
  for (const raw of rows) {
    const line = raw.trim();
    if (!line) continue;
    const row = parseCsvRow(line);
    if (row) out.push(row);
  }
  return out;
}

export function getAllNftListings(): NftListingRow[] {
  if (!cachedParsed) cachedParsed = parseNftSeedRows(NFT_SEED_CSV_ROWS);
  return cachedParsed;
}

/** Поиск позиций каталога по фрагменту кода (например 7986, #9812). */
export function searchNftListingsByCodeQuery(raw: string): NftListingRow[] {
  const norm = raw.trim().toLowerCase();
  const q = norm.startsWith('#') ? norm.slice(1) : norm;
  if (!q) return [];
  return getAllNftListings().filter((r) => {
    const ck = r.codeKey.toLowerCase();
    const disp = r.codeDisplay.toLowerCase().replace(/^#/, '');
    return ck.includes(q) || q.includes(ck) || disp.includes(q);
  });
}

function listingMatchesMarketQuery(r: NftListingRow, norm: string): boolean {
  const q = norm.startsWith('#') ? norm.slice(1) : norm;
  const qAlnum = norm.replace(/[^a-z0-9]/gi, '');
  const name = r.collectionName.toLowerCase();
  const slug = r.collectionSlug.toLowerCase();
  const slugCompact = slug.replace(/-/g, '');
  const qSlug = norm.replace(/-/g, '');
  const ck = r.codeKey.toLowerCase();
  const disp = r.codeDisplay.toLowerCase().replace(/^#/, '');
  const fullLine = `${name} ${r.codeDisplay.toLowerCase()}`.trim();
  const ticker = nftTickerForListing(r).toLowerCase();
  if (name.includes(norm) || slug.includes(norm) || slugCompact.includes(qSlug.replace(/-/g, ''))) return true;
  if (ck.includes(q) || q.includes(ck) || disp.includes(q)) return true;
  if (fullLine.includes(norm)) return true;
  if (qAlnum.length >= 2 && ticker.includes(qAlnum)) return true;
  return false;
}

/** Поиск лотов: коллекция, slug, #код, полное имя, спот-тикер (BAYC7986). */
export function searchNftListingsByMarketQuery(raw: string): NftListingRow[] {
  const norm = raw.trim().toLowerCase();
  if (!norm) return [];
  return getAllNftListings().filter((r) => listingMatchesMarketQuery(r, norm));
}

function effectiveEthForCollection(row: NftListingRow, ref?: Record<string, number>): number {
  if (!ref) return row.priceEth;
  const c = ref[nftTickerForListing(row)];
  if (Number.isFinite(c) && c > 0) return c;
  return row.priceEth;
}

/** Позволяет подменять данные после загрузки из Supabase. */
export function setCachedNftListings(rows: NftListingRow[]): void {
  cachedParsed = rows;
}

export function listNftCollections(refPriceByTicker?: Record<string, number>): NftCollectionSummary[] {
  const ref =
    refPriceByTicker && Object.keys(refPriceByTicker).length > 0 ? refPriceByTicker : undefined;
  const all = getAllNftListings();
  const bySlug = new Map<string, NftListingRow[]>();
  for (const row of all) {
    const list = bySlug.get(row.collectionSlug) ?? [];
    list.push(row);
    bySlug.set(row.collectionSlug, list);
  }
  const summaries: NftCollectionSummary[] = [];
  for (const [slug, items] of bySlug) {
    const floorEth = Math.min(...items.map((i) => effectiveEthForCollection(i, ref)));
    const sortedByEff = [...items].sort(
      (a, b) => effectiveEthForCollection(a, ref) - effectiveEthForCollection(b, ref)
    );
    const coverUrl = sortedByEff[0]?.imageUrl ?? items[0]!.imageUrl;
    summaries.push({
      slug,
      name: items[0]!.collectionName,
      coverUrl,
      floorEth,
      itemCount: items.length,
    });
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export function getNftListingsForCollection(slug: string): NftListingRow[] {
  return getAllNftListings()
    .filter((r) => r.collectionSlug === slug)
    .sort((a, b) => a.priceEth - b.priceEth);
}

export function getNftListing(slug: string, codeKey: string): NftListingRow | undefined {
  const key = codeKey.replace(/^#/, '').trim();
  return getAllNftListings().find((r) => r.collectionSlug === slug && r.codeKey === key);
}

export function nftTickerForListing(
  row: Pick<NftListingRow, 'collectionSlug' | 'codeKey'> & { spotTicker?: string | null }
): string {
  const st = row.spotTicker?.trim();
  if (st) return st.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const mapped = COLLECTION_TICKER_PREFIX[row.collectionSlug];
  const initials = row.collectionSlug
    .split('-')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 6);
  const prefix = mapped ?? (initials.length > 0 ? initials : 'NFT');
  return `${prefix}${row.codeKey}`.replace(/[^A-Z0-9]/gi, '');
}

export function listingToNftMeta(row: NftListingRow): NftMeta {
  return {
    collectionSlug: row.collectionSlug,
    collectionName: row.collectionName,
    codeDisplay: row.codeDisplay,
    codeKey: row.codeKey,
    priceEth: row.priceEth,
    imageUrl: row.imageUrl,
    customPriceUsd: row.customPriceUsd,
  };
}

export function nftListingToAsset(row: NftListingRow, priceRubFallback: number): Asset {
  const meta = listingToNftMeta(row);
  const ticker = nftTickerForListing(row);
  return {
    id: `nft-${row.collectionSlug}-${row.codeKey}`,
    ticker,
    name: `${row.collectionName} ${row.codeDisplay}`,
    price: Math.max(priceRubFallback, 1),
    volume24h: 0,
    change24h: 0,
    category: 'nft' as AssetCategory,
    nft: meta,
    tradingViewSymbol: 'BINANCE:ETHUSDT',
    priceUnavailable: !(priceRubFallback > 0),
  };
}
