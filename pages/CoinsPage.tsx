import React, { useEffect, useMemo, useState } from 'react';
import {
  getAllNftListings,
  listNftCollections,
  searchNftListingsByMarketQuery,
  type NftCollectionSummary,
  type NftListingRow,
} from '../lib/nftCatalog';
import { fetchAssetPricesInUsd } from '../lib/cryptoPrices';
import { enrichNftListings, useNftReferrerPriceMap, useNftReferrerPriceUsdMap, useNftMarketJitter, useNftListingsTick } from '../lib/nftReferrerPricing';
import { MARKET_ASSETS } from '../constants';
import { Asset, type NavigateToTradingOptions } from '../types';
import { Search, Star } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { Haptic } from '../utils/haptics';
import { useLiveAssets } from '../utils/useLiveAssets';

import Skeleton from '../components/Skeleton';
import MarketTopBar from '../components/MarketTopBar';
import TopSearchControl from '../components/TopSearchControl';
import NftArtwork from '../components/NftArtwork';
const MARKETS_PRIMARY_TAB_KEY = 'mexc_markets_primary_tab_v3';

type CryptoMarketsSort = 'list' | 'volume' | 'priceAsc' | 'priceDesc' | 'changeDesc' | 'changeAsc';
type NftMarketsSort = 'name' | 'floorDesc' | 'floorAsc' | 'itemsDesc' | 'notionalDesc';
type NftMarketLayout = 'collections' | 'catalog';

function marketsPickAvatarStage(asset: Asset): 'logo' | 'coincap' {
  return asset.logoUrl ? 'logo' : 'coincap';
}

function MarketsPickAvatar({ asset }: { asset: Asset }) {
  const [stage, setStage] = useState<'logo' | 'coincap' | 'letter'>(() => marketsPickAvatarStage(asset));

  useEffect(() => {
    setStage(marketsPickAvatarStage(asset));
  }, [asset.id]);

  if (stage === 'letter') {
    const initials = asset.ticker.replace(/[^A-Z0-9]/gi, '').slice(0, 2) || '?';
    return (
      <div className="h-7 w-7 shrink-0 rounded-md bg-surfaceElevated flex items-center justify-center text-[9px] font-bold font-mono text-textPrimary">
        {initials}
      </div>
    );
  }

  const src =
    stage === 'logo' && asset.logoUrl
      ? asset.logoUrl
      : `https://assets.coincap.io/assets/icons/${asset.ticker.toLowerCase()}@2x.png`;

  return (
    <img
      src={src}
      alt=""
      className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-border bg-black/50"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (stage === 'logo') setStage('coincap');
        else setStage('letter');
      }}
    />
  );
}

function cmpAssetPriceAsc(a: Asset, b: Asset): number {
  const ua = Boolean(a.priceUnavailable);
  const ub = Boolean(b.priceUnavailable);
  if (ua && ub) return a.ticker.localeCompare(b.ticker);
  if (ua) return 1;
  if (ub) return -1;
  return (a.price ?? 0) - (b.price ?? 0);
}

interface CoinsPageProps {
  onNavigateToTrading: (asset: Asset, options?: NavigateToTradingOptions) => void;
  onOpenNftCollection?: (collectionSlug: string) => void;
  onOpenNftListing?: (row: NftListingRow) => void;
  onNavigate?: (page: 'PROFILE' | 'SUPPORT' | 'NFT') => void;
}

const CoinsPage: React.FC<CoinsPageProps> = ({
  onNavigateToTrading,
  onOpenNftCollection,
  onOpenNftListing,
  onNavigate,
}) => {
  const { t } = useLanguage();
  const { formatPrice, rates, currencyCode } = useCurrency();
  const refNftPrices = useNftReferrerPriceMap();
  const refNftPricesUsd = useNftReferrerPriceUsdMap();
  const jitter = useNftMarketJitter();
  const nftListingsTick = useNftListingsTick();
  const [ethUsdSpot, setEthUsdSpot] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [cryptoSort, setCryptoSort] = useState<CryptoMarketsSort>('list');
  const [nftSort, setNftSort] = useState<NftMarketsSort>('name');
  const [nftMarketLayout, setNftMarketLayout] = useState<NftMarketLayout>('collections');
  const [primaryTab, setPrimaryTab] = useState<'favorites' | 'crypto' | 'stocks' | 'nft'>(() => {
    try {
      const v = localStorage.getItem(MARKETS_PRIMARY_TAB_KEY);
      if (v === 'favorites' || v === 'crypto' || v === 'nft') return v;
    } catch {
      /* ignore */
    }
    return 'favorites';
  });
  const { user } = useUser();
  const perUsd = rates?.usd?.rub ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(MARKETS_PRIMARY_TAB_KEY, primaryTab);
    } catch {
      /* ignore */
    }
  }, [primaryTab]);

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('mexc_favorites_v1');
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set((arr || []).filter(Boolean));
    } catch {
      return new Set();
    }
  });

  const toggleFavorite = (ticker: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      try {
        localStorage.setItem('mexc_favorites_v1', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const liveCrypto = useLiveAssets(MARKET_ASSETS);

  useEffect(() => {
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
  }, []);

  const nftUsd = (row: Pick<NftListingRow, 'priceEth' | 'customPriceUsd'>): number =>
    row.customPriceUsd != null && row.customPriceUsd > 0
      ? row.customPriceUsd
      : ethUsdSpot > 0
        ? row.priceEth * ethUsdSpot
        : row.priceEth;

  const nftCollections = useMemo<NftCollectionSummary[]>(
    () => listNftCollections(refNftPrices),
    [refNftPrices, nftListingsTick]
  );
  const nftMarketHits = useMemo(
    () => enrichNftListings(searchNftListingsByMarketQuery(searchQuery.trim()), refNftPrices, jitter, refNftPricesUsd),
    [searchQuery, refNftPrices, jitter, nftListingsTick]
  );

  const filteredNftCollections = useMemo(() => {
    let base = nftCollections;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const hitSlugs = new Set(searchNftListingsByMarketQuery(searchQuery.trim()).map((r) => r.collectionSlug));
      base = nftCollections.filter(
        (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || hitSlugs.has(c.slug)
      );
    }
    const list = [...base];
    switch (nftSort) {
      case 'floorDesc':
        list.sort((a, b) => b.floorEth - a.floorEth);
        break;
      case 'floorAsc':
        list.sort((a, b) => a.floorEth - b.floorEth);
        break;
      case 'itemsDesc':
        list.sort((a, b) => b.itemCount - a.itemCount);
        break;
      case 'notionalDesc':
        list.sort((a, b) => b.floorEth * b.itemCount - a.floorEth * a.itemCount);
        break;
      default:
        list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [nftCollections, searchQuery, nftSort]);

  const catalogListingRows = useMemo(() => {
    const q = searchQuery.trim();
    const raw = q ? searchNftListingsByMarketQuery(q) : getAllNftListings();
    return enrichNftListings(raw, refNftPrices, jitter, refNftPricesUsd);
  }, [searchQuery, refNftPrices, jitter, nftListingsTick]);

  const catalogSortedListings = useMemo(() => {
    const list = [...catalogListingRows];
    const countBySlug = (slug: string) => nftCollections.find((c) => c.slug === slug)?.itemCount ?? 0;
    switch (nftSort) {
      case 'floorDesc':
        list.sort((a, b) => b.priceEth - a.priceEth);
        break;
      case 'floorAsc':
        list.sort((a, b) => a.priceEth - b.priceEth);
        break;
      case 'itemsDesc':
        list.sort((a, b) => countBySlug(b.collectionSlug) - countBySlug(a.collectionSlug));
        break;
      case 'notionalDesc':
        list.sort(
          (a, b) =>
            b.priceEth * countBySlug(b.collectionSlug) - a.priceEth * countBySlug(a.collectionSlug)
        );
        break;
      default:
        list.sort((a, b) =>
          `${a.collectionName} ${a.codeKey}`.localeCompare(`${b.collectionName} ${b.codeKey}`)
        );
    }
    return list;
  }, [catalogListingRows, nftSort, nftCollections]);

  const nftHasResults =
    nftMarketLayout === 'catalog'
      ? catalogSortedListings.length > 0
      : filteredNftCollections.length > 0 || (Boolean(searchQuery.trim()) && nftMarketHits.length > 0);

  const cryptoSortChips = useMemo(
    () =>
      [
        { key: 'list' as const, label: t('markets_sort_list') },
        { key: 'volume' as const, label: t('markets_sort_volume') },
        { key: 'priceAsc' as const, label: t('markets_sort_price_low') },
        { key: 'priceDesc' as const, label: t('markets_sort_price_high') },
        { key: 'changeDesc' as const, label: t('markets_sort_gainers') },
        { key: 'changeAsc' as const, label: t('markets_sort_losers') },
      ] satisfies { key: CryptoMarketsSort; label: string }[],
    [t]
  );

  const nftSortChips = useMemo(
    () =>
      [
        { key: 'name' as const, label: t('markets_nft_sort_alpha') },
        { key: 'floorDesc' as const, label: t('markets_nft_sort_floor_high') },
        { key: 'floorAsc' as const, label: t('markets_nft_sort_floor_low') },
        { key: 'itemsDesc' as const, label: t('markets_nft_sort_supply') },
        { key: 'notionalDesc' as const, label: t('markets_nft_sort_notional') },
      ] satisfies { key: NftMarketsSort; label: string }[],
    [t]
  );

  const filteredAssets = useMemo(() => {
    if (primaryTab === 'nft') return [];

    let base: Asset[] = primaryTab === 'crypto' ? liveCrypto : [...liveCrypto];

    if (primaryTab === 'favorites') {
      base = base.filter((a) => favorites.has(a.ticker));
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      base = base.filter((a) => {
        const tag = (a.tagline ?? '').toLowerCase();
        return (
          a.ticker.toLowerCase().includes(lowerQuery) ||
          a.name.toLowerCase().includes(lowerQuery) ||
          (tag && tag.includes(lowerQuery))
        );
      });
    }

    const sorted = [...base].sort((a, b) => {
      switch (cryptoSort) {
        case 'volume':
          return (b.volume24h ?? 0) - (a.volume24h ?? 0);
        case 'priceAsc':
          return cmpAssetPriceAsc(a, b);
        case 'priceDesc':
          return cmpAssetPriceAsc(b, a);
        case 'changeDesc':
          return (b.change24h ?? 0) - (a.change24h ?? 0);
        case 'changeAsc':
          return (a.change24h ?? 0) - (b.change24h ?? 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [searchQuery, liveCrypto, cryptoSort, primaryTab, favorites]);

  const listSourceEmpty =
    primaryTab === 'crypto' || primaryTab === 'favorites'
      ? liveCrypto.length === 0
      : false;


  const topCryptoPick = useMemo(
    () => [...liveCrypto].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 4),
    [liveCrypto]
  );
  const favoritesNftTopPicks = useMemo(() => {
    const list = enrichNftListings(getAllNftListings(), refNftPrices, jitter);
    return [...list].sort((a, b) => b.priceEth - a.priceEth).slice(0, 10);
  }, [refNftPrices, jitter, nftListingsTick]);

  const openPickAsset = (asset: Asset) => {
    Haptic.tap();
    const cat = asset.category ?? 'crypto';
    const isListedNft = cat === 'nft';
    const nonCrypto = cat !== 'crypto' && !isListedNft;
    const forced = isListedNft
      ? ({ tradeType: 'spot' as const, spotAction: 'buy' as const })
      : nonCrypto
        ? { tradeType: 'futures' as const }
        : { tradeType: 'spot' as const };
    onNavigateToTrading(asset, forced);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in relative">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md pb-2 pt-1 border-b border-border">
        <MarketTopBar
          user={user}
          sticky={false}
          onProfile={() => onNavigate?.('PROFILE')}
          onSupport={() => onNavigate?.('SUPPORT')}
          profileLabel={t('profile')}
          supportLabel={t('support')}
          className="py-1"
          innerClassName="px-4 lg:px-6 max-w-[1440px] mx-auto"
        >
          <div className="flex-1 w-full flex justify-center">
            <TopSearchControl
              variant="input"
              value={searchQuery}
              placeholder={primaryTab === 'nft' ? t('markets_nft_search_placeholder') : t('search_pair')}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery('')}
              clearLabel={t('clear_search')}
            />
          </div>
        </MarketTopBar>

        {/* Primary tabs */}
        <div className="px-0 pt-1 max-w-[1440px] w-full mx-auto">
          <div className="app-tabs px-4 lg:px-6 overflow-x-auto no-scrollbar">
            {(
              [
                ['favorites', t('markets_tab_favorites')],
                ['crypto', t('markets_tab_crypto')],
                ['nft', t('markets_tab_nft')],
              ] as const
            ).map(([id, label]) => {
              const active = primaryTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    Haptic.tap();
                    if (id === 'nft') { onNavigate?.('NFT'); return; }
                    setPrimaryTab(id);
                  }}
                  className={`app-tab ${active ? 'app-tab-active' : ''}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sort chips - compact horizontal scroll */}
        <div className="px-4 lg:px-6 max-w-[1440px] w-full mx-auto pb-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(primaryTab === 'crypto' || primaryTab === 'favorites'
              ? cryptoSortChips
              : nftSortChips
            ).map((chip) => {
              const active = (primaryTab === 'crypto' || primaryTab === 'favorites')
                ? cryptoSort === chip.key
                : nftSort === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    Haptic.tap();
                    if (primaryTab === 'crypto' || primaryTab === 'favorites') {
                      setCryptoSort(chip.key as CryptoMarketsSort);
                    } else {
                      setNftSort(chip.key as NftMarketsSort);
                    }
                  }}
                  className={`app-chip shrink-0 ${active ? 'app-chip-active' : ''}`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table header - more compact */}
        <div className="px-4 lg:px-6 max-w-[1440px] w-full mx-auto pb-2 pt-1">
          <div className="grid grid-cols-12 gap-2 text-[11px] text-textMuted font-medium">
            {primaryTab === 'nft' ? (
              <>
                <div className="col-span-5">{t('markets_table_nft_pair')}</div>
                <div className="col-span-4 text-right">{t('markets_table_nft_last')}</div>
                <div className="col-span-3 text-right font-mono">{t('nft_table_hint_eth')}</div>
              </>
            ) : (
              <>
                <div className="col-span-5">{t('markets_table_pair_vol')}</div>
                <div className="col-span-4 text-right">{t('markets_table_last_price')}</div>
                <div className="col-span-3 text-right">{t('markets_table_change')}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-56 pt-2 min-h-screen max-w-[1440px] w-full mx-auto">
        {primaryTab === 'nft' ? (
          nftHasResults ? (
            <div className="flex flex-col">
              <div className="mb-2 flex w-full rounded-lg bg-surface p-[3px]" role="tablist" aria-label={t('markets_nft_layout_label')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={nftMarketLayout === 'collections'}
                  onClick={() => {
                    Haptic.tap();
                    setNftMarketLayout('collections');
                  }}
                  className={`min-w-0 flex-1 rounded-md py-1 px-1.5 text-center text-[11px] font-medium transition-colors truncate ${
                    nftMarketLayout === 'collections'
                      ? 'bg-surfaceElevated text-textPrimary'
                      : 'text-textSubtle hover:text-textSecondary'
                  }`}
                >
                  {t('markets_nft_layout_collections')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={nftMarketLayout === 'catalog'}
                  onClick={() => {
                    Haptic.tap();
                    setNftMarketLayout('catalog');
                  }}
                  className={`min-w-0 flex-1 rounded-md py-1 px-1.5 text-center text-[11px] font-medium transition-colors truncate ${
                    nftMarketLayout === 'catalog'
                      ? 'bg-surfaceElevated text-textPrimary'
                      : 'text-textSubtle hover:text-textSecondary'
                  }`}
                >
                  {t('markets_nft_layout_catalog')}
                </button>
              </div>

              {nftMarketLayout === 'catalog' ? (
                <div className="grid grid-cols-3 gap-2">
                  {catalogSortedListings.map((hit) => (
                    <button
                      key={`${hit.collectionSlug}-${hit.codeKey}`}
                      type="button"
                      onClick={() => {
                        Haptic.tap();
                        onOpenNftListing?.(hit);
                      }}
                      className="nft-card text-left w-full"
                    >
                      <NftArtwork src={hit.imageUrl} alt={`${hit.collectionName} ${hit.codeDisplay}`} className="aspect-square" />
                      <div className="p-1.5 min-w-0">
                        <div className="text-[8px] text-textMuted truncate leading-tight">{hit.collectionName}</div>
                        <div className="font-mono text-[11px] font-bold text-textPrimary truncate">{hit.codeDisplay}</div>
                        <div className="text-[10px] font-mono text-neon tabular-nums mt-0.5">
                          {formatPrice(nftUsd(hit), { fractionDigits: 2 })}
                          <span className="text-textMuted font-normal"> $</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {searchQuery.trim() && nftMarketHits.length > 0 ? (
                    <div className="mb-3 rounded-xl app-border overflow-hidden divide-y divide-border">
                      {nftMarketHits.map((hit) => (
                        <button
                          key={`hit-${hit.collectionSlug}-${hit.codeKey}`}
                          type="button"
                          onClick={() => {
                            Haptic.tap();
                            onOpenNftListing?.(hit);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-surfaceElevated transition-colors"
                        >
                          <NftArtwork src={hit.imageUrl} alt={`${hit.collectionName} ${hit.codeDisplay}`} className="h-10 w-10 shrink-0 rounded-lg" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-textMuted truncate">{hit.collectionName}</div>
                            <div className="font-mono text-[14px] font-bold text-textPrimary">{hit.codeDisplay}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-textMuted">$</div>
                            <div className="text-[12px] font-mono font-semibold text-neon tabular-nums">
                              {formatPrice(nftUsd(hit), { fractionDigits: 3 })}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {filteredNftCollections.map((col, idx) => (
                    <div
                      key={col.slug}
                      className={['py-2', idx === 0 ? '' : 'hairline-top'].join(' ')}
                    >
                      <button
                        type="button"
                        className="w-full grid grid-cols-12 gap-2 items-center text-left active:scale-[0.99] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-border rounded-xl"
                        onClick={() => {
                          Haptic.tap();
                          onOpenNftCollection?.(col.slug);
                        }}
                      >
                        <div className="col-span-5 min-w-0 flex items-center gap-2">
                          <NftArtwork src={col.coverUrl} alt={col.name} className="h-11 w-11 shrink-0 rounded-lg" />
                          <div className="min-w-0">
                            <div className="text-[14px] font-bold text-textPrimary truncate">{col.name}</div>
                            <div className="text-[11px] text-textSubtle mt-0.5">
                              {col.itemCount} {t('nft_items')}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-4 text-right font-mono text-[14px] font-bold text-neon tabular-nums">
                          {formatPrice(ethUsdSpot > 0 ? col.floorEth * ethUsdSpot : col.floorEth, { fractionDigits: 3 })}
                        </div>
                        <div className="col-span-3 text-right font-mono text-[11px] text-textMuted">$</div>
                      </button>
                    </div>
                  ))}
                </>
              )}
              <div className="h-24" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-600 space-y-2">
              <Search size={32} className="opacity-20" />
              <span className="text-sm font-mono">{t('nothing_found_for', { query: searchQuery })}</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-neutral-400 hover:text-neon underline underline-offset-2"
              >
                {t('clear_search')}
              </button>
            </div>
          )
        ) : listSourceEmpty ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton
                key={`skeleton-${idx}`}
                className="w-full h-14 rounded-lg bg-surface"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {primaryTab === 'favorites' && !searchQuery.trim() ? (
              <div className="mb-3 rounded-xl app-border bg-surface overflow-hidden">
                <div className="px-3 pt-2 pb-2 border-b border-border">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-textPrimary leading-tight truncate">
                      {t('markets_favorites_picks_title')}
                    </p>
                    <span className="shrink-0 text-[8px] uppercase tracking-wide text-textMuted font-semibold">
                      {t('markets_favorites_picks_kicker')}
                    </span>
                  </div>
                  <p className="text-[10px] text-textSubtle mt-0.5 leading-snug line-clamp-2">
                    {t('markets_favorites_picks_subtitle')}
                  </p>
                </div>
                <div className="px-2 py-2 space-y-2.5">

                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-textMuted font-semibold mb-1 px-0.5">
                      {t('markets_favorites_section_crypto')}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {topCryptoPick.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => openPickAsset(asset)}
                          className="flex items-center gap-1.5 text-left rounded-lg px-2 py-1.5 bg-surface app-border hover:bg-surfaceElevated active:scale-[0.99] transition-colors"
                        >
                          <MarketsPickAvatar asset={asset} />
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[12px] font-bold text-textPrimary leading-none truncate">
                              {asset.ticker}
                            </div>
                            <div className="text-[8px] text-textMuted truncate leading-tight mt-0.5">{asset.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {favoritesNftTopPicks.length > 0 ? (
                    <div>
                      <p className="text-[9px] uppercase tracking-wide text-textMuted font-semibold mb-1 px-0.5">
                        {t('markets_favorites_section_nft')}
                      </p>
                      <div className="flex gap-1.5 overflow-x-auto snap-x snap-mandatory pb-0.5 -mx-0.5 px-0.5 no-scrollbar scroll-smooth">
                        {favoritesNftTopPicks.map((hit) => (
                          <button
                            key={`pick-${hit.collectionSlug}-${hit.codeKey}`}
                            type="button"
                            onClick={() => {
                              Haptic.tap();
                              onOpenNftListing?.(hit);
                            }}
                            className="snap-start shrink-0 w-[32%] max-w-[104px] text-left rounded-lg overflow-hidden bg-surface hover:bg-surfaceElevated active:scale-[0.99] transition-colors"
                          >
                            <NftArtwork src={hit.imageUrl} alt={`${hit.collectionName} ${hit.codeDisplay}`} className="aspect-square" />
                            <div className="px-1 py-1 min-w-0">
                              <div className="text-[7px] text-textMuted truncate leading-tight">{hit.collectionName}</div>
                              <div className="font-mono text-[10px] font-bold text-textPrimary truncate leading-tight">
                                {hit.codeDisplay}
                              </div>
                              <div className="text-[9px] font-mono text-neon tabular-nums leading-none mt-0.5">
                                {formatPrice(nftUsd(hit), { fractionDigits: 2 })}
                                <span className="text-textMuted font-normal"> $</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {primaryTab === 'favorites' && !searchQuery.trim() && filteredAssets.length > 0 ? (
              <div className="mb-2 flex items-center gap-1.5 px-0.5">
                <Star size={12} className="text-amber-400/90 shrink-0" fill="currentColor" aria-hidden />
                <span className="text-[9px] uppercase tracking-wide text-textMuted font-semibold">
                  {t('markets_favorites_yours_heading')}
                </span>
              </div>
            ) : null}

            {filteredAssets.length > 0 ? (
              <>
            {filteredAssets.map((asset, idx) => {
              const change = asset.change24h ?? 0;
              const isUp = change >= 0;
              const pairQuote = currencyCode;
              const priceText = asset.priceUnavailable
                ? '—'
                : formatPrice(asset.price, { fractionDigits: asset.price < 1 ? 8 : asset.price < 100 ? 4 : 2 });
              const badgeClass = isUp ? 'bg-up text-black' : 'bg-down text-black';
              const fav = favorites.has(asset.ticker);
              return (
                <div key={asset.id} className="app-row border-b border-border last:border-b-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      Haptic.tap();
                      const cat = asset.category ?? 'crypto';
                      const isListedNft = cat === 'nft';
                      const forced = isListedNft
                        ? ({ tradeType: 'spot' as const, spotAction: 'buy' as const })
                        : { tradeType: 'futures' as const };
                      onNavigateToTrading(asset, forced);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        Haptic.tap();
                        const cat = asset.category ?? 'crypto';
                        const isListedNft = cat === 'nft';
                        const forced = isListedNft
                          ? ({ tradeType: 'spot' as const, spotAction: 'buy' as const })
                          : { tradeType: 'futures' as const };
                        onNavigateToTrading(asset, forced);
                      }
                    }}
                    className="w-full grid grid-cols-12 gap-2 items-center text-left active:scale-[0.98] transition-colors hover:bg-surface/40 py-2.5 outline-none"
                    aria-label={`${asset.ticker} ${t('price')}`}
                  >
                    <div className="col-span-5 min-w-0 flex items-center gap-3">
                      {asset.logoUrl ? (
                        <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-background">
                          <img
                            src={asset.logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[15px] font-bold text-textPrimary truncate">{asset.ticker}</span>
                          <span className="text-[11px] text-textMuted font-medium shrink-0">/{pairQuote}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              Haptic.tap();
                              toggleFavorite(asset.ticker);
                            }}
                            className="ml-0.5 h-6 w-6 rounded-lg flex items-center justify-center text-textMuted active:scale-[0.98] transition-colors hover:bg-surface"
                            aria-label={t('favorite')}
                          >
                            <Star size={14} className={fav ? 'text-amber-400 fill-amber-400' : 'text-textMuted'} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-4 text-right">
                      <div className="text-[15px] font-mono font-bold text-textPrimary tabular-nums">
                        {priceText}
                      </div>
                    </div>

                    <div className="col-span-3 flex justify-end">
                      <div className={`min-w-[72px] h-[30px] px-2 rounded-[8px] ${isUp ? 'bg-up/10 text-up' : 'bg-down/10 text-down'} flex items-center justify-end font-mono font-bold text-[13px] tabular-nums`}>
                        {isUp ? '+' : ''}{change.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="h-24" />
              </>
            ) : primaryTab === 'favorites' && !searchQuery.trim() ? (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center rounded-xl bg-surfaceElevated">
                <Star size={36} className="text-textMuted opacity-35 mb-3" />
                <p className="text-sm text-textSubtle leading-relaxed max-w-xs">{t('markets_favorites_empty_hint')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-neutral-600 space-y-2">
                <Search size={32} className="opacity-20" />
                <span className="text-sm font-mono">
                  {t('nothing_found_for', { query: searchQuery })}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs text-neutral-400 hover:text-neon underline underline-offset-2"
                >
                  {t('clear_search')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoinsPage;
