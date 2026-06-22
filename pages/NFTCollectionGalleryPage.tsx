import React, { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { fetchAssetPricesInUsd } from '../lib/cryptoPrices';
import { getNftListingsForCollection, getAllNftListings, type NftListingRow } from '../lib/nftCatalog';
import { enrichNftListings, useNftReferrerPriceMap, useNftReferrerPriceUsdMap, useNftMarketJitter, useNftListingsTick, useNftReferrerDuoByTicker } from '../lib/nftReferrerPricing';
import { nftTickerForListing } from '../lib/nftCatalog';
import { Haptic } from '../utils/haptics';
import NftHorizontalStrip from '../components/NftHorizontalStrip';
import TopSearchControl from '../components/TopSearchControl';

/** Снизу оставляем место под fixed bottom-nav + safe-area (+ запас под баннер P2P над навбаром). */
const GALLERY_SCROLL_BOTTOM_PADDING =
  'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]';

type GallerySort = 'floorAsc' | 'floorDesc' | 'tokenId';

interface NFTCollectionGalleryPageProps {
  collectionSlug: string;
  collectionName: string;
  coverUrl?: string;
  itemCount?: number;
  floorEth?: number;
  onBack: () => void;
  onOpenListing: (row: NftListingRow) => void;
}

const NFTCollectionGalleryPage: React.FC<NFTCollectionGalleryPageProps> = ({
  collectionSlug,
  collectionName,
  coverUrl: coverProp,
  itemCount: itemCountProp,
  floorEth: floorProp,
  onBack,
  onOpenListing,
}) => {
  const { t } = useLanguage();
  const { formatPrice } = useCurrency();

  const refPrices = useNftReferrerPriceMap();
  const refPricesUsd = useNftReferrerPriceUsdMap();
  const jitter = useNftMarketJitter();
  const listingsTick = useNftListingsTick();
  const duoByTicker = useNftReferrerDuoByTicker();
  const [ethUsdSpot, setEthUsdSpot] = useState(0);
  const [codeQuery, setCodeQuery] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prices = await fetchAssetPricesInUsd(['ETH']);
        const ethUsd = prices.ETH?.price ?? 0;
        if (!cancelled) setEthUsdSpot(ethUsd > 0 ? ethUsd : 0);
      } catch {
        if (!cancelled) setEthUsdSpot(0);
      }
    })();
    return () => { cancelled = true; };
  }, [collectionSlug]);

  const listings = useMemo(
    () => enrichNftListings(getNftListingsForCollection(collectionSlug), refPrices, jitter, refPricesUsd),
    [collectionSlug, refPrices, jitter, listingsTick]
  );

  const normalizedCodeQuery = codeQuery.trim().replace(/^#/, '').toLowerCase();
  const filteredListings = useMemo(() => {
    if (!normalizedCodeQuery) return listings;
    return listings.filter((row) => row.codeKey.toLowerCase().includes(normalizedCodeQuery));
  }, [listings, normalizedCodeQuery]);

  const listingUsd = (row: NftListingRow): number =>
    row.customPriceUsd != null && row.customPriceUsd > 0
      ? row.customPriceUsd
      : ethUsdSpot > 0
        ? row.priceEth * ethUsdSpot
        : row.priceEth;

  const [sort, setSort] = useState<GallerySort>('floorAsc');

  const sortedListings = useMemo(() => {
    const rows = [...filteredListings];
    switch (sort) {
      case 'floorDesc':
        rows.sort((a, b) => listingUsd(b) - listingUsd(a));
        break;
      case 'floorAsc':
        rows.sort((a, b) => listingUsd(a) - listingUsd(b));
        break;
      case 'tokenId':
        rows.sort((a, b) =>
          a.codeKey.localeCompare(b.codeKey, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        );
        break;
      default:
        break;
    }
    return rows;
  }, [filteredListings, sort]);

  const coverUrl = coverProp ?? listings[0]?.imageUrl;
  const itemCount = itemCountProp ?? listings.length;

  const priceRollup = useMemo(() => {
    if (!listings.length) return { floor: floorProp ?? 0, high: 0, avg: 0 };
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const r of listings) {
      const p = listingUsd(r);
      sum += p;
      min = Math.min(min, p);
      max = Math.max(max, p);
    }
    const fallbackFloor = Number.isFinite(min) ? min : 0;
    const floor =
      typeof floorProp === 'number' && Number.isFinite(floorProp)
        ? (ethUsdSpot > 0 ? floorProp * ethUsdSpot : floorProp)
        : fallbackFloor;
    return {
      floor,
      high: Number.isFinite(max) ? max : 0,
      avg: listings.length ? sum / listings.length : 0,
    };
  }, [listings, floorProp, ethUsdSpot]);

  const sortChip = (
    key: GallerySort,
    label: string
  ) => {
    const on = sort === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => {
          Haptic.tap();
          setSort(key);
        }}
        className={`whitespace-nowrap shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
          on
            ? 'bg-neon/20 text-neon ring-1 ring-inset ring-neon/35'
            : 'bg-surface text-textSubtle hover:text-textSecondary hover:bg-surfaceElevated'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="bg-background animate-fade-in min-h-screen">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md pb-2 pt-2 border-b border-white/5">
        <div className="max-w-2xl w-full mx-auto">
          <PageHeader title={collectionName} onBack={onBack} />
        </div>
      </div>

      {/* Premium Hero Header */}
      <div className="relative w-full overflow-hidden">
        {/* Background Layer: Blurry cover */}
        <div className="absolute inset-0 z-0">
          <img 
            src={coverUrl} 
            alt="" 
            className="w-full h-full object-cover blur-2xl scale-110 opacity-30 saturate-150"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background" />
        </div>

        {/* Content Layer */}
        <div className="relative z-10 px-4 pt-4 pb-8 flex flex-col items-center text-center">
          {/* Avatar with Glow */}
          <div className="relative mb-6">
            <div className="relative w-24 h-24 rounded-2xl overflow-hidden ring-4 ring-background bg-surfaceElevated shadow-xl">
              <img 
                src={coverUrl} 
                alt={collectionName} 
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight mb-2 drop-shadow-lg">
            {collectionName}
          </h1>
          
          <p className="text-[10px] font-mono text-textSubtle uppercase tracking-[0.2em] mb-8 opacity-70">
            {collectionSlug}
          </p>

          {/* Stats Row */}
          <div className="flex items-center justify-center bg-surfaceElevated rounded-[16px] p-4 divide-x divide-white/5 shadow-sm">
            <div className="flex flex-col items-center px-4 sm:px-8">
              <span className="text-[9px] text-textSubtle uppercase tracking-widest font-bold mb-1">Floor</span>
              <span className="text-sm font-mono font-bold text-neon">{formatPrice(priceRollup.floor)} <span className="text-[10px] text-textMuted">$</span></span>
            </div>
            <div className="flex flex-col items-center px-4 sm:px-8">
              <span className="text-[9px] text-textSubtle uppercase tracking-widest font-bold mb-1">Items</span>
              <span className="text-sm font-mono font-bold text-white">{itemCount}</span>
            </div>
            <div className="flex flex-col items-center px-4 sm:px-8">
              <span className="text-[9px] text-textSubtle uppercase tracking-widest font-bold mb-1">Highest</span>
              <span className="text-sm font-mono font-bold text-white">{formatPrice(priceRollup.high)} <span className="text-[10px] text-textMuted">$</span></span>
            </div>
          </div>
        </div>
      </div>

      <div className={`max-w-2xl w-full mx-auto px-4 pt-4 space-y-5`}>
        <TopSearchControl
          variant="input"
          value={codeQuery}
          placeholder={t('markets_nft_search_code_placeholder')}
          onChange={setCodeQuery}
          onClear={() => setCodeQuery('')}
        />
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1">
          {sortChip('floorAsc', t('markets_nft_sort_floor_low'))}
          {sortChip('floorDesc', t('markets_nft_sort_floor_high'))}
          {sortChip('tokenId', t('markets_nft_sort_alpha'))}
        </div>

        {sortedListings.length === 0 ? (
          <p className="text-sm text-textMuted text-center py-14">{t('nothing_found')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2.5 pb-2">
            {sortedListings.map((row) => (
              <button
                key={`${row.codeKey}-${row.collectionSlug}`}
                type="button"
                onClick={() => {
                  Haptic.tap();
                  onOpenListing(row);
                }}
                aria-label={`${collectionName} ${row.codeDisplay}`}
                className="group rounded-2xl overflow-hidden bg-surfaceElevated text-left active:scale-[0.97] transition-all hover:bg-surface hover:shadow-lg focus:outline-none"
              >
                <div className="aspect-[4/5] bg-surface relative overflow-hidden">
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.08]"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />

                  {duoByTicker[nftTickerForListing(row)] ? (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-neon/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-black shadow-sm">
                      {t('nft_duo_badge')}
                    </span>
                  ) : null}

                  {/* Glassy overlay for details */}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] font-bold text-white/90 truncate drop-shadow-sm">
                      {row.codeDisplay}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-neon tabular-nums">
                          {formatPrice(listingUsd(row), { fractionDigits: listingUsd(row) < 1 ? 4 : listingUsd(row) < 100 ? 2 : 0 })}
                        </span>
                      <span className="text-[8px] text-textMuted font-medium uppercase tracking-tighter">$</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggested Other NFTs */}
      <div className={`mt-8 border-t border-border ${GALLERY_SCROLL_BOTTOM_PADDING}`}>
        <NftHorizontalStrip 
          title={t('nft_explore_others')}
          items={enrichNftListings(getAllNftListings().filter(n => n.collectionSlug !== collectionSlug), refPrices, jitter, refPricesUsd).slice(0, 15)}
          onItemClick={(item) => onOpenListing(item)}
          renderPrice={(item) => {
            const itemUsd = listingUsd(item);
            return (
              <>
                <span className="text-[11px] font-bold text-neon tabular-nums">
                  {formatPrice(itemUsd, { fractionDigits: itemUsd < 1 ? 4 : itemUsd < 100 ? 2 : 0 })}
                </span>
                <span className="text-[8px] text-textMuted font-bold uppercase tracking-tighter">$</span>
              </>
            );
          }}
        />
      </div>
    </div>
  );
};

export default NFTCollectionGalleryPage;
