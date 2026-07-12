import React, { useMemo, useState, useEffect } from 'react';
import { Deal } from '../types';
import type { SpotHolding, ActivityHistoryItem, Asset, NavigateToTradingOptions } from '../types';
import {
  TrendingUp,
  Wallet,
  History,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownLeft,
  ArrowUpRight as ArrowUpRightIcon,
  Activity,
  Coins,
} from 'lucide-react';
import Skeleton from '../components/Skeleton';
import AppEmptyState from '../components/AppEmptyState';
import { Haptic } from '../utils/haptics';
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { MARKET_ASSETS } from '../constants';
import { fetchAssetPricesInUsd } from '../lib/cryptoPrices';
import { useLiveAssets } from '../utils/useLiveAssets';
import { withNftDisplayWobbleUsd } from '../utils/nftPriceWobble';
import { enrichNftListingRow, useNftReferrerPriceMap, useNftReferrerPriceUsdMap, useNftMarketJitter } from '../lib/nftReferrerPricing';
import { fetchActivityHistory } from '../lib/activityHistory';
import {
  getAllNftListings,
  nftTickerForListing,
  slugifyCollectionName,
  type NftListingRow,
} from '../lib/nftCatalog';
import { getMyNftOwned, nftOwnedStatusMeta, type NftOwnedRow, type NftStatusTone } from '../lib/nftOrders';

interface DealsPageProps {
  deals: Deal[];
  balance: number;
  balanceLoading?: boolean;
  spotHoldings: SpotHolding[];
  userId: number;
  onNavigateToTrading: (asset: Asset, options?: NavigateToTradingOptions) => void;
  onOpenNftHub?: () => void;
  /** Открыть единую страницу покупки/продажи конкретного NFT из каталога. */
  onOpenNftListing?: (slug: string, codeKey: string) => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

type TabId = 'ACTIVE' | 'HISTORY' | 'ASSETS';

type PortfolioNftRow = {
  key: string;
  /** Есть каталожный листинг — строку открываем на единой странице NFT. Нет — в «Мои NFT» (уникальный, созданный пользователем предмет). */
  catalogSlug: string | null;
  catalogCodeKey: string | null;
  collectionName: string;
  codeDisplay: string;
  imageUrl?: string | null;
  quantityLabel: string;
  price: number;
  valueUsd: number;
  statusLabel: string;
  statusTone: NftStatusTone;
  subtitle: string;
};

function statusToneClass(tone: NftStatusTone): string {
  switch (tone) {
    case 'pending':
      return 'bg-amber-400/10 text-amber-300 ring-amber-300/15';
    case 'success':
      return 'bg-emerald-400/10 text-emerald-300 ring-emerald-300/15';
    case 'danger':
      return 'bg-red-400/10 text-red-300 ring-red-300/15';
    case 'market':
      return 'bg-accent/10 text-accent ring-accent/15';
    default:
      return 'bg-white/[0.04] text-textMuted ring-border';
  }
}

function ownedNftToListing(row: NftOwnedRow): NftListingRow {
  const collectionName = String(row.collection_name ?? 'NFT').trim() || 'NFT';
  const rawCode = String(row.nft_code ?? row.id).trim() || String(row.id);
  const codeKey = rawCode.replace(/^#/, '').trim() || String(row.id);
  const priceUsd = Number(row.list_price_usd ?? row.acquired_price_usd ?? 0);
  return {
    listingDbId: row.nft_listing_id,
    collectionName,
    collectionSlug: slugifyCollectionName(collectionName),
    codeDisplay: rawCode.startsWith('#') ? rawCode : `#${rawCode}`,
    codeKey,
    priceEth: 0,
    imageUrl: row.image_url || '',
    customPriceUsd: Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : undefined,
  };
}

const DealsPage: React.FC<DealsPageProps> = ({
  deals,
  balance,
  balanceLoading = false,
  spotHoldings,
  userId,
  onNavigateToTrading,
  onOpenNftHub,
  onOpenNftListing,
  onDeposit,
  onWithdraw,
}) => {
  const { formatPrice, symbol, currencyCode } = useCurrency();
  const { t, locale } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('ACTIVE');
  const [now, setNow] = useState(Date.now());
  const [ethUsdNft, setEthRubNft] = useState(0);
  const refNftPriceMap = useNftReferrerPriceMap();
  const refNftPriceUsdMap = useNftReferrerPriceUsdMap();
  const jitter = useNftMarketJitter();
  const [activityHistory, setActivityHistory] = useState<ActivityHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [ownedNfts, setOwnedNfts] = useState<NftOwnedRow[]>([]);
  const liveAssets = useLiveAssets(MARKET_ASSETS);

  const assetsByTicker = useMemo(() => {
    const map: Record<string, Asset> = {};
    liveAssets.forEach((a) => { map[a.ticker] = a; });
    return map;
  }, [liveAssets]);

  const nftListingBySpotTicker = useMemo(() => {
    const map = new Map<string, NftListingRow>();
    for (const row of getAllNftListings()) {
      map.set(nftTickerForListing(row), row);
    }
    return map;
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!userId) {
        if (alive) setOwnedNfts([]);
        return;
      }
      const rows = await getMyNftOwned(userId, 100);
      if (alive) setOwnedNfts(rows);
    };
    void load();
    const intervalId = window.setInterval(load, 7000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [userId]);

  // Единое владение (миграция 020): все NFT — из nft_owned, без дублей.
  // spot_holdings теперь тоже отражает эти же предметы (для обратной
  // совместимости старых RPC), поэтому источником для Портфель-секции
  // NFT берём ИСКЛЮЧИТЕЛЬНО nft_owned — иначе каждый предмет считался бы
  // дважды (и как spot-строка, и как owned-строка).
  const ownedActive = useMemo(() => ownedNfts.filter((row) => row.status !== 'sold'), [ownedNfts]);

  /** Каталожные предметы группируем по тикеру (кол-во копий), созданные пользователем — по одному ряду. */
  const ownedGrouped = useMemo(() => {
    const catalogGroups = new Map<string, { listing: NftListingRow; count: number }>();
    const customRows: NftOwnedRow[] = [];
    const tickers = new Set<string>();
    for (const row of ownedActive) {
      const synthetic = ownedNftToListing(row);
      const ticker = nftTickerForListing(synthetic);
      tickers.add(ticker);
      const catalogRow = nftListingBySpotTicker.get(ticker);
      if (catalogRow) {
        const existing = catalogGroups.get(ticker);
        if (existing) existing.count += 1;
        else catalogGroups.set(ticker, { listing: catalogRow, count: 1 });
      } else {
        customRows.push(row);
      }
    }
    return { catalogGroups, customRows, tickers };
  }, [ownedActive, nftListingBySpotTicker]);

  const nftPortfolioRows = useMemo<PortfolioNftRow[]>(() => {
    const catalogRows: PortfolioNftRow[] = Array.from(ownedGrouped.catalogGroups.entries()).map(([ticker, { listing: row, count }]) => {
      const live = assetsByTicker[ticker];
      const rowPriced = enrichNftListingRow(row, refNftPriceMap, jitter, refNftPriceUsdMap);
      const baseUsd =
        ethUsdNft > 0
          ? rowPriced.priceEth * ethUsdNft
          : Math.max(rowPriced.priceEth * 3_200, live?.price ?? 0, 1);
      const priceUsd = Number.isFinite(baseUsd) && baseUsd > 0 ? withNftDisplayWobbleUsd(baseUsd, ticker, now) : 1;
      return {
        key: `catalog-${ticker}`,
        catalogSlug: row.collectionSlug,
        catalogCodeKey: row.codeKey,
        collectionName: row.collectionName,
        codeDisplay: row.codeDisplay,
        imageUrl: row.imageUrl,
        quantityLabel: String(count),
        price: priceUsd,
        valueUsd: priceUsd * count,
        statusLabel: 'В портфеле',
        statusTone: 'market' as const,
        subtitle: t('portfolio_units_label'),
      };
    });
    const customRows: PortfolioNftRow[] = ownedGrouped.customRows.map((row) => {
      const meta = nftOwnedStatusMeta(row.status);
      const listing = ownedNftToListing(row);
      const price = Number(row.list_price_usd ?? row.acquired_price_usd ?? listing.customPriceUsd ?? 0);
      const priceSafe = Number.isFinite(price) && price > 0 ? price : 1;
      return {
        key: `owned-${row.id}`,
        catalogSlug: null,
        catalogCodeKey: null,
        collectionName: listing.collectionName,
        codeDisplay: listing.codeDisplay,
        imageUrl: listing.imageUrl,
        quantityLabel: '1',
        price: priceSafe,
        valueUsd: priceSafe,
        statusLabel: meta.label,
        statusTone: meta.tone,
        subtitle: row.is_user_created ? 'Создан вами' : meta.detail,
      };
    });
    const rows = [...catalogRows, ...customRows];
    rows.sort((a, b) => b.valueUsd - a.valueUsd);
    return rows;
  }, [ownedGrouped, assetsByTicker, now, ethUsdNft, refNftPriceMap, refNftPriceUsdMap, jitter, t]);

  const spotRows = useMemo(() => {
    const rows = spotHoldings
      .filter((h) => !nftListingBySpotTicker.has(h.ticker) && !ownedGrouped.tickers.has(h.ticker))
      .map((h) => {
        const live = assetsByTicker[h.ticker];
        const price = live?.price ?? h.avgPriceUsd ?? 0;
        const valueUsd = (h.amount ?? 0) * price;
        const asset: Asset =
          live ??
          (MARKET_ASSETS.find((a) => a.ticker === h.ticker) ||
            ({
              id: h.ticker,
              ticker: h.ticker,
              name: h.ticker,
              price,
              volume24h: 0,
              change24h: 0,
            } as Asset));
        return { holding: h, asset, price, valueUsd };
      })
      .filter((r) => Number.isFinite(r.valueUsd));
    rows.sort((a, b) => b.valueUsd - a.valueUsd);
    return rows;
  }, [spotHoldings, assetsByTicker, nftListingBySpotTicker, ownedGrouped.tickers]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const p = await fetchAssetPricesInUsd(['ETH']);
        if (cancelled) return;
        const x = p.ETH?.price ?? 0;
        if (Number.isFinite(x) && x > 0 && !p.ETH?.unavailable) setEthRubNft(x);
      } catch {
        /* silent */
      }
    };
    void pull();
    const id = window.setInterval(pull, 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'HISTORY' || userId <= 0) return;
    setHistoryLoading(true);
    fetchActivityHistory(userId).then((list) => {
      setActivityHistory(list);
      setHistoryLoading(false);
    });
  }, [activeTab, userId]);

  const activeDeals = deals.filter((d) => d.status === 'ACTIVE').sort((a, b) => b.startTime - a.startTime);
  const totalActiveExposure = activeDeals.reduce((sum, d) => sum + d.amount, 0);
  const totalPnlActive = activeDeals.reduce((sum, d) => sum + (d.pnl ?? 0), 0);

  const spotValueUsd = useMemo(
    () =>
      spotRows.reduce((s, r) => s + (r.valueUsd ?? 0), 0) +
      nftPortfolioRows.reduce((s, r) => s + (r.valueUsd ?? 0), 0),
    [spotRows, nftPortfolioRows]
  );
  const totalPortfolioUsd = useMemo(() => balance + spotValueUsd, [balance, spotValueUsd]);

  const dayChangeUsd = useMemo(() => {
    const spotCrypto = spotRows.reduce(
      (s, r) =>
        s + (r.valueUsd ?? 0) * (((assetsByTicker[r.holding.ticker]?.change24h ?? 0) as number) / 100),
      0
    );
    const nftDay = nftPortfolioRows.reduce((s, r) => {
      const chTicker = assetsByTicker[r.asset.ticker]?.change24h ?? assetsByTicker.ETH?.change24h ?? 0;
      return s + (r.valueUsd ?? 0) * ((chTicker as number) / 100);
    }, 0);
    return spotCrypto + nftDay;
  }, [spotRows, nftPortfolioRows, assetsByTicker]);

  const dayChangePct = useMemo(() => (totalPortfolioUsd > 0 ? (dayChangeUsd / totalPortfolioUsd) * 100 : 0), [dayChangeUsd, totalPortfolioUsd]);

  const nftHoldingsValueUsd = useMemo(
    () => nftPortfolioRows.reduce((s, r) => s + (r.valueUsd ?? 0), 0),
    [nftPortfolioRows]
  );
  const spotHoldingsValueUsdOnly = useMemo(
    () => spotRows.reduce((s, r) => s + (r.valueUsd ?? 0), 0),
    [spotRows]
  );

  const formatTimeLeft = (deal: Deal) => {
    const endTime = deal.startTime + deal.durationSeconds * 1000;
    const left = Math.max(0, endTime - now);
    const seconds = Math.floor((left / 1000) % 60);
    const minutes = Math.floor(left / 1000 / 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const qtyFormatLocale =
    locale === 'ru'
      ? 'ru-RU'
      : locale === 'uk'
        ? 'uk-UA'
        : locale === 'pl'
          ? 'pl-PL'
          : locale === 'cs'
            ? 'cs-CZ'
            : locale === 'kk'
              ? 'kk-KZ'
              : 'en-US';

  const formatHistoryDate = (createdAt: string) => {
    const d = new Date(createdAt);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const lang = locale === 'ru' ? 'ru-RU' : locale === 'uk' ? 'uk-UA' : 'en-US';
    if (isToday) {
      return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return d.toLocaleString(lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const assetRowsCount = nftPortfolioRows.length + spotRows.length;

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'ACTIVE', label: t('active_tab'), count: activeDeals.length },
    { id: 'HISTORY', label: t('history_tab'), count: activityHistory.length },
    { id: 'ASSETS', label: t('my_assets'), count: assetRowsCount },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in bg-background">
      {/* Wallet / Portfolio header (минималистично, как на бирже) */}
      <header className="shrink-0 px-4 pt-4 pb-4 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-textSubtle leading-none">{t('portfolio_title')}</p>
            <div className="flex items-baseline gap-2 mt-1 min-w-0">
              {balanceLoading ? (
                <Skeleton className="w-44 h-10 rounded-xl bg-surfaceElevated/70" />
              ) : (
                <span className="text-[34px] lg:text-[38px] font-bold tracking-tight text-textPrimary tabular-nums leading-[1] truncate">
                  {formatPrice(totalPortfolioUsd, { fractionDigits: 2 })}
                </span>
              )}
              <span className="text-xs text-textMuted font-medium leading-none">{currencyCode}</span>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {dayChangeUsd !== 0 && (
                <span
                  className={`text-[11px] font-mono px-2.5 py-1 rounded-full ${
                    dayChangeUsd > 0 ? 'text-up bg-emerald-500/10' : 'text-down bg-red-500/10'
                  }`}
                >
                  {dayChangeUsd > 0 ? '+' : ''}
                  {formatPrice(dayChangeUsd)} {symbol} ({dayChangePct > 0 ? '+' : ''}
                  {dayChangePct.toFixed(2)}%)
                </span>
              )}
              {activeDeals.length > 0 ? (
                <span className="text-[11px] text-textMuted">
                  {activeDeals.length} {t('active_tab').toLowerCase()} · {formatPrice(totalActiveExposure)} {symbol}
                </span>
              ) : null}
            </div>
          </div>

          {activeDeals.length > 0 && (
            <div className="text-right shrink-0 rounded-xl bg-surfaceElevated/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-textMuted">P&L</p>
              <p className={`text-sm font-mono font-bold tabular-nums ${totalPnlActive >= 0 ? 'text-up' : 'text-down'}`}>
                {totalPnlActive >= 0 ? '+' : ''}
                {formatPrice(totalPnlActive)} {symbol}
              </p>
            </div>
          )}
        </div>

        {/* Actions row */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => { Haptic.tap(); onDeposit?.(); }}
            className="app-button-primary flex-1 gap-2"
          >
            <ArrowDownLeft size={16} />
            {t('quick_deposit')}
          </button>
          <button
            type="button"
            onClick={() => { Haptic.tap(); onWithdraw?.(); }}
            className="app-button-secondary flex-1 gap-2"
          >
            <ArrowUpRightIcon size={16} />
            {t('quick_withdraw')}
          </button>
        </div>

        <div className="app-tabs mt-2 -mx-0">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => { Haptic.tap(); setActiveTab(id); }}
              className={`app-tab ${activeTab === id ? 'app-tab-active' : ''}`}
            >
              {label}
              {count > 0 && <span className="text-[10px] font-mono opacity-60 ml-1">{count}</span>}
            </button>
          ))}
        </div>
      </header>

      {/* Контент */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-8">
        {/* ——— Активные сделки ——— */}
        {activeTab === 'ACTIVE' && (
          <div className="px-4 py-3">
            {activeDeals.length === 0 && (
              <AppEmptyState
                icon={TrendingUp}
                tone="up"
                pulse
                title={t('no_open_positions')}
                hint={t('portfolio_empty_active_hint')}
              />
            )}

            {activeDeals.length > 0 && (
              <div className="rounded-xl overflow-hidden">
                {/* Заголовки колонок */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-3 py-2.5 border-b border-border bg-surfaceElevated text-[10px] font-semibold uppercase tracking-[0.14em] text-textMuted">
                  <span>Пара / Направление</span>
                  <span className="text-right">Вход</span>
                  <span className="text-right">P&L</span>
                  <span className="text-right">Закрытие</span>
                </div>
                {activeDeals.map((deal) => {
                  const isProfitable = (deal.pnl ?? 0) >= 0;
                  const priceDiff = (deal.currentPrice ?? deal.entryPrice) - deal.entryPrice;
                  const pricePercent = deal.entryPrice ? (priceDiff / deal.entryPrice) * 100 : 0;
                  return (
                    <div
                      key={deal.id}
                      className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-3 py-3 border-b border-border last:border-b-0 items-center min-h-[56px] transition-colors duration-200 hover:bg-surfaceElevated/60 ${
                        isProfitable ? 'bg-up/[0.02]' : 'bg-down/[0.02]'
                      }`}
                    >
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-textPrimary truncate">{deal.assetTicker}</span>
                          <span className="shrink-0 text-[10px] font-mono text-textMuted bg-white/[0.04] px-1.5 py-0.5 rounded-full">
                            x{deal.leverage}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {deal.side === 'UP' ? (
                            <ArrowUpRight size={12} className="text-up shrink-0" />
                          ) : (
                            <ArrowDownRight size={12} className="text-down shrink-0" />
                          )}
                          <span className={`text-[11px] font-medium ${deal.side === 'UP' ? 'text-up' : 'text-down'}`}>
                            {deal.side === 'UP' ? t('up') : t('down')}
                          </span>
                        </div>
                        {(deal.takeProfitPrice || deal.stopLossPrice) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {deal.takeProfitPrice && (
                              <span className="text-[9px] text-up font-mono px-1.5 py-0.5 rounded-full bg-up/10">
                                TP: {formatPrice(deal.takeProfitPrice)}
                              </span>
                            )}
                            {deal.stopLossPrice && (
                              <span className="text-[9px] text-down font-mono px-1.5 py-0.5 rounded-full bg-down/10">
                                SL: {formatPrice(deal.stopLossPrice)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-textSecondary block">
                          {formatPrice(deal.entryPrice)}
                        </span>
                        <span className="text-[10px] text-textMuted">
                          {pricePercent >= 0 ? '+' : ''}
                          {pricePercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2.5 py-1 text-xs font-mono font-bold rounded-full tabular-nums ${isProfitable ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                          {isProfitable ? '+' : ''}
                          {formatPrice(deal.pnl ?? 0)}
                        </span>
                        <span className="text-[10px] text-textMuted block">{symbol}</span>
                      </div>
                      <div className="text-right">
                        {deal.durationSeconds === 0 ? (
                          <span className="text-xs text-textMuted font-medium">Ручное<br/>закрытие</span>
                        ) : (
                          <>
                            <span className="text-sm font-mono font-bold text-textPrimary tabular-nums">
                              {formatTimeLeft(deal)}
                            </span>
                            <span className="text-[10px] text-textMuted block">{t('left')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ——— История операций ——— */}
        {activeTab === 'HISTORY' && (
          <div className="px-4 py-3">
            {historyLoading && (
              <div className="overflow-hidden rounded-xl bg-surfaceElevated">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={`history-skeleton-${idx}`} className="w-full h-14 bg-surface" />
                ))}
              </div>
            )}

            {!historyLoading && activityHistory.length === 0 && (
              <AppEmptyState
                icon={History}
                tone="neon"
                title={t('history_empty')}
                hint={t('portfolio_empty_history_hint')}
              />
            )}

            {!historyLoading && activityHistory.length > 0 && (
              <div className="-mx-4">
                {activityHistory.map((item) => {
                  const labelMap: Record<string, string> = {
                    spot_buy: t('spot_buy'),
                    spot_sell: t('spot_sell'),
                    trade: t('history_trade'),
                  };
                  const label = labelMap[item.activity_type];
                  const isGreen =
                    item.activity_type === 'spot_buy' ||
                    (item.activity_type === 'trade' && (item.amount_usd ?? 0) >= 0);
                  const isRed =
                    item.activity_type === 'spot_sell' ||
                    (item.activity_type === 'trade' && (item.amount_usd ?? 0) < 0);
                  const ticker = item.ticker || (item.payload?.symbol as string) || '—';
                  const amountUsd = item.amount_usd ?? 0;
                  const quantity = item.quantity ?? 0;
                  const payload = item.payload as { type?: string; leverage?: number } | undefined;
                  return (
                    <div
                      key={`${item.id}-${item.created_at}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] rounded-xl hover:bg-white/[0.03] transition-colors duration-200"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-medium ${isGreen ? 'text-up' : isRed ? 'text-down' : 'text-textSecondary'}`}>
                          {label}
                        </p>
                        <p className="font-mono text-sm font-semibold text-textPrimary truncate">{ticker}</p>
                        {(payload?.type || payload?.leverage) && (
                          <p className="text-[10px] text-textMuted mt-0.5">
                            {payload?.type ?? ''} · x{payload?.leverage ?? 1}
                          </p>
                        )}
                        {quantity > 0 && (
                          <p className="text-[10px] text-textMuted font-mono">{quantity.toFixed(6)}</p>
                        )}
                        <p className="text-[10px] text-textMuted mt-0.5">{formatHistoryDate(item.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {item.activity_type === 'trade' && (
                          <span className={`font-mono text-sm font-bold tabular-nums ${amountUsd >= 0 ? 'text-up' : 'text-down'}`}>
                            {amountUsd >= 0 ? '+' : ''}
                            {formatPrice(amountUsd)} {symbol}
                          </span>
                        )}
                        {(item.activity_type === 'spot_buy' || item.activity_type === 'spot_sell') && (
                          <span className="font-mono text-sm text-textPrimary">{formatPrice(amountUsd)} {symbol}</span>
                        )}
                        {item.activity_type === 'stake' && (
                          <span className="font-mono text-sm text-textPrimary">{formatPrice(amountUsd)} {symbol}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ——— Мои активы (спот) ——— */}
        {activeTab === 'ASSETS' && (
          <div className="px-4 py-3">
            {assetRowsCount === 0 && (
              <AppEmptyState
                icon={Wallet}
                tone="purple"
                title={t('no_spot_assets')}
                hint={t('portfolio_empty_spot_hint')}
              />
            )}

            {assetRowsCount > 0 && (
              <div className="space-y-7">
                {(nftPortfolioRows.length > 0 || spotRows.length > 0) && (
                  <div
                    className={`grid gap-2.5 ${
                      nftPortfolioRows.length > 0 && spotRows.length > 0 ? 'grid-cols-2' : 'grid-cols-1'
                    }`}
                  >
                    {nftPortfolioRows.length > 0 ? (
                      <div className="rounded-xl px-3.5 py-3 bg-surfaceElevated">
                        <p className="text-[10px] uppercase tracking-wide text-textMuted font-semibold">
                          {t('portfolio_split_nft_value')}
                        </p>
                        <p className="text-[18px] font-bold font-mono text-neon tabular-nums leading-tight mt-1 truncate">
                          {formatPrice(nftHoldingsValueUsd)} {symbol}
                        </p>
                        <p className="text-[10px] text-textMuted mt-1.5">
                          {nftPortfolioRows.length} {t('nft_items')}
                        </p>
                      </div>
                    ) : null}
                    {spotRows.length > 0 ? (
                      <div className="rounded-xl px-3.5 py-3 bg-surfaceElevated">
                        <p className="text-[10px] uppercase tracking-wide text-textMuted font-semibold">
                          {t('portfolio_split_spot_value')}
                        </p>
                        <p className="text-[18px] font-bold font-mono text-textPrimary tabular-nums leading-tight mt-1 truncate">
                          {formatPrice(spotHoldingsValueUsdOnly)} {symbol}
                        </p>
                        <p className="text-[10px] text-textMuted mt-1.5">
                          {spotRows.length}{' '}
                          {t('portfolio_spot_block')} ·{' '}
                          {currencyCode}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* NFT: горизонтальная лента */}
                <section aria-label={t('portfolio_my_nfts')}>
                  <div className="flex items-end justify-between gap-2 px-0.5 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-neon/12 ring-1 ring-neon/10 flex items-center justify-center shrink-0">
                        <Activity size={18} className="text-neon" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[15px] font-bold text-textPrimary tracking-tight">
                            {t('portfolio_my_nfts')}
                          </h3>
                          <span className="text-[10px] font-mono px-2 py-px rounded-full bg-white/[0.04] text-textMuted">
                            {nftPortfolioRows.length}
                          </span>
                        </div>
                        <p className="text-[10px] text-textMuted leading-snug mt-0.5">{t('portfolio_nft_sell_hint')}</p>
                      </div>
                    </div>
                  </div>
                  {nftPortfolioRows.length === 0 ? (
                    <div className="rounded-xl px-4 py-3 bg-surfaceElevated">
                      <p className="text-xs text-textMuted leading-snug">{t('portfolio_nfts_hint')}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden bg-surfaceElevated divide-y divide-border">
                      {nftPortfolioRows.map(({ key, catalogSlug, catalogCodeKey, collectionName, codeDisplay, imageUrl, quantityLabel, price, valueUsd, statusLabel, statusTone, subtitle }) => {
                        const hasCatalogPage = Boolean(catalogSlug && catalogCodeKey && onOpenNftListing);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              Haptic.tap();
                              // Единая страница: карточка каталога открывает NFTDetailPage
                              // (там же покупка/продажа); уникальные предметы без каталога
                              // (созданные пользователем) — управление в «Мои NFT».
                              if (hasCatalogPage) {
                                onOpenNftListing!(catalogSlug!, catalogCodeKey!);
                              } else {
                                onOpenNftHub?.();
                              }
                            }}
                            className="w-full text-left px-3 py-3 flex items-center gap-3 min-h-[64px] active:bg-white/[0.04] hover:bg-white/[0.03] transition-all duration-200 cursor-pointer"
                            aria-label={`${collectionName} ${codeDisplay}`}
                          >
                            <div className="h-12 w-12 shrink-0 rounded-xl bg-background/40 overflow-hidden relative">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-textMuted">
                                  NFT
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[14px] font-bold text-textPrimary">{codeDisplay}</span>
                                <span className="text-[10px] text-textMuted truncate">{collectionName}</span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusToneClass(statusTone)}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              <p className="text-[11px] text-textMuted font-mono mt-0.5 tabular-nums">
                                {quantityLabel} {t('portfolio_units_label')} · {price > 0 ? formatPrice(price) : '—'} {symbol}
                              </p>
                              {!hasCatalogPage && (
                                <p className="text-[10px] text-textMuted mt-0.5 truncate">{subtitle}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              <div>
                                <p className="font-mono text-[14px] font-bold text-textPrimary tabular-nums">
                                  {formatPrice(valueUsd)} {symbol}
                                </p>
                                <p className="text-[10px] text-textMuted font-mono tabular-nums">{currencyCode}</p>
                              </div>
                              <ChevronRight size={18} className="text-textMuted opacity-75" aria-hidden />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Криптоспот: карточки списком */}
                <section aria-label={t('portfolio_spot_block')}>
                  <div className="flex items-center justify-between gap-2 px-0.5 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <Coins size={18} className="text-emerald-400/90" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-bold text-textPrimary tracking-tight">{t('portfolio_spot_block')}</h3>
                        <p className="text-[10px] text-textMuted mt-0.5">{t('portfolio_spot_trade_hint')}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-textMuted shrink-0">{spotRows.length}</span>
                  </div>
                  {spotRows.length === 0 ? (
                    <div className="rounded-xl px-4 py-3 bg-surfaceElevated">
                      <p className="text-xs text-textMuted">{t('portfolio_spot_empty_hint')}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden bg-surfaceElevated divide-y divide-border">
                      {spotRows.map(({ holding, asset, price, valueUsd }) => {
                        const initials = holding.ticker.slice(0, 3).toUpperCase();
                        return (
                          <button
                            key={holding.ticker}
                            type="button"
                            onClick={() => {
                              Haptic.tap();
                              onNavigateToTrading(asset, { tradeType: 'spot', initialActiveTab: 'TRADE' });
                            }}
                            className="w-full text-left px-3 py-3.5 flex items-center gap-3 min-h-[64px] active:bg-white/[0.04] hover:bg-white/[0.03] transition-all duration-200 cursor-pointer"
                          >
                            <div className="h-11 w-11 shrink-0 rounded-xl bg-background/40 flex items-center justify-center">
                              <span className="text-[10px] font-mono font-bold text-textPrimary">{initials}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-[14px] font-bold text-textPrimary">{holding.ticker}</span>
                                <span className="text-[10px] text-textMuted truncate">{asset.name}</span>
                              </div>
                              <p className="text-[11px] text-textMuted font-mono mt-1 tabular-nums">
                                {holding.amount.toLocaleString(qtyFormatLocale, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 8,
                                })}{' '}
                                · {formatPrice(price)} {symbol}
                              </p>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              <div>
                                <p className="font-mono text-[14px] font-bold text-textPrimary tabular-nums">
                                  {formatPrice(valueUsd)} {symbol}
                                </p>
                                <p className="text-[10px] text-textMuted font-mono tabular-nums">{currencyCode}</p>
                              </div>
                              <ChevronRight size={18} className="text-textMuted opacity-75" aria-hidden />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DealsPage;
