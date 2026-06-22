import { supabase } from './supabase';
import {
  parseNftSeedRows,
  NFT_SEED_CSV_ROWS,
  setCachedNftListings,
  type NftListingRow,
} from './nftCatalog';

type NftRowDb = {
  id?: string;
  collection_name: string;
  nft_code: string;
  price_eth: number | string;
  image_url: string;
  spot_ticker?: string | null;
};

function rowFromDb(r: NftRowDb): NftListingRow | null {
  const line = `${r.collection_name},${r.nft_code},${String(r.price_eth)},${r.image_url}`;
  const parsed = parseNftSeedRows([line]);
  const row = parsed[0];
  if (!row) return null;
  const spotTicker = r.spot_ticker?.trim() || null;
  const withSpot = spotTicker ? { ...row, spotTicker } : row;
  return r.id ? { ...withSpot, listingDbId: r.id } : withSpot;
}

/** Один раз при старте рынка NFT: Supabase → при пустой таблице остаётся офлайн-сид. */
export async function refreshNftListingsFromSupabase(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('nft_listings')
      .select('id,collection_name,nft_code,price_eth,image_url,spot_ticker')
      .order('collection_name', { ascending: true })
      .order('price_eth', { ascending: true });

    if (error || !Array.isArray(data) || data.length === 0) {
      setCachedNftListings(parseNftSeedRows(NFT_SEED_CSV_ROWS));
      return;
    }

    const merged: NftListingRow[] = [];
    for (const raw of data as NftRowDb[]) {
      const row = rowFromDb(raw);
      if (row) merged.push(row);
    }

    setCachedNftListings(merged.length > 0 ? merged : parseNftSeedRows(NFT_SEED_CSV_ROWS));
  } catch {
    setCachedNftListings(parseNftSeedRows(NFT_SEED_CSV_ROWS));
  }
}
