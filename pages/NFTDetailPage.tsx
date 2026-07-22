import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy, MessageCircle, Minus, Plus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { ensureNftOrderForChat, fakeNftSeller, placeNftOrder, sellNftMarket } from '../lib/nftOrders';
import { spotBuy } from '../lib/spot';
import { fetchAssetPricesInUsd } from '../lib/cryptoPrices';
import { getNftListingsForCollection, nftTickerForListing, type NftListingRow } from '../lib/nftCatalog';
import { enrichNftListingRow, enrichNftListings, useNftReferrerPriceMap, useNftReferrerPriceUsdMap, useNftMarketJitter, useNftListingsTick, useNftReferrerDuoByTicker } from '../lib/nftReferrerPricing';
import { withNftDisplayWobbleUsd } from '../utils/nftPriceWobble';
import { parseDiscreteNftQtyString, nftSellWishFromUi, nftSpotBuyTotals } from '../utils/nftTradeMath';
import type { SpotHolding } from '../types';
import { Haptic } from '../utils/haptics';
import {
  APP_TOP_BAR_CLASS,
  APP_TOP_BAR_ROW,
  APP_TOP_BAR_STYLE,
} from '../components/appTopBar';
import NftHorizontalStrip from '../components/NftHorizontalStrip';
import NftOrderTicket from '../components/NftOrderTicket';
import NftArtwork from '../components/NftArtwork';

const MIN_DEAL_USD = 5;

export interface NftChatContext {
  orderId: number;
  buyerId: number;
  workerId: number | null;
  title: string;
  imageUrl?: string | null;
  collectionName?: string | null;
  nftCode?: string | null;
  sellerName?: string | null;
  status?: string | null;
}

interface NFTDetailPageProps {
  listing: NftListingRow;
  onBack: () => void;
  onOpenChat: (ctx: NftChatContext) => void;
  spotHoldings: SpotHolding[];
  onSpotComplete?: () => void;
}

type BookRow = { price: number; size: number };

function buildOrderBook(midUsd: number): { asks: BookRow[]; bids: BookRow[] } {
  if (!Number.isFinite(midUsd) || midUsd <= 0) return { asks: [], bids: [] };
  const rel = 0.00045;
  const asks: BookRow[] = Array.from({ length: 7 }, (_, i) => ({
    price: midUsd * (1 + rel * (i + 1)),
    size: parseFloat((0.018 + ((i * 7 + 11) % 10) * 0.006).toFixed(3)),
  })).reverse();
  const bids: BookRow[] = Array.from({ length: 7 }, (_, i) => ({
    price: midUsd * (1 - rel * (i + 1)),
    size: parseFloat((0.022 + ((i * 5 + 13) % 10) * 0.005).toFixed(3)),
  }));
  return { asks, bids };
}

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function buildNftPriceSeries(seed: string, baseUsd: number, fixed = false): number[] {
  if (!Number.isFinite(baseUsd) || baseUsd <= 0) return [];
  const h = stableHash(seed);
  const volatility = fixed ? 0.0025 : 0.015 + ((h % 8) / 1000);
  const drift = fixed ? 0 : (((h >> 4) % 17) - 6) / 1200;
  return Array.from({ length: 22 }, (_, i) => {
    const wave = Math.sin((i + (h % 9)) * 0.58) * volatility;
    const micro = ((((h >> (i % 14)) & 7) - 3) / 1400);
    return Math.max(baseUsd * (1 + wave + micro + drift * i), 0.01);
  });
}

function seriesPath(values: number[], width = 320, height = 88): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-9);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * (height - 12) - 6;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function nftTradeErrorText(code: string | undefined, tr: (key: string, fallback: string) => string): string {
  switch (code) {
    case 'INSUFFICIENT_BALANCE':
      return tr('insufficient_balance', 'Недостаточно средств');
    case 'INSUFFICIENT_QUANTITY':
      return tr('nft_sell_unavailable', 'Недостаточно NFT для продажи');
    case 'TRADING_BLOCKED':
      return tr('trading_blocked_toast', 'Торговля заблокирована');
    case 'WORKER_NOT_FOUND':
      return tr('nft_sell_no_worker', 'Недоступно: не назначен воркер');
    case 'NFT_DUO_REQUIRES_PAIR':
      return tr('nft_sell_duo_pair_required', 'Нужна пара: нельзя продать последний NFT коллекции');
    case 'ORDER_ALREADY_PLACED':
    case 'NFT_SELL_QUANTITY_RESERVED':
      return tr('nft_order_already_placed', 'У вас уже есть размещённый ордер на этот NFT — ожидает подтверждения.');
    case 'NFT_QTY_INVALID':
      return tr('nft_spot_error_qty', 'Некорректное количество');
    case 'INVALID_PRICE':
    case 'NFT_PRICE_INVALID':
      return tr('order_price_invalid', 'Некорректная цена');
    case 'NFT_NOT_AVAILABLE':
      return tr('nft_sell_unavailable', 'NFT уже продан или недоступен');
    default:
      return tr('nft_action_failed', 'Не удалось');
  }
}

const NFTDetailPage: React.FC<NFTDetailPageProps> = ({ listing, onBack, onOpenChat, spotHoldings, onSpotComplete }) => {
  const { t } = useLanguage();
  const tr = (key: string, fallback: string) => { const v = t(key); return v === key ? fallback : v; };
  const { formatPrice, currencyCode, convertToUsd } = useCurrency();
  const { user, refreshUser } = useUser();
  const toast = useToast();
  const [openingChat, setOpeningChat] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [tradeTab, setTradeTab] = useState<'buy' | 'sell'>('buy');
  const [buyKind, setBuyKind] = useState<'market' | 'order'>('market');
  const [sellKind, setSellKind] = useState<'market' | 'order'>('market');
  const [qtyBuyStr, setQtyBuyStr] = useState('1');
  const [qtySellStr, setQtySellStr] = useState('1');
  const [buying, setBuying] = useState(false);
  const [selling, setSelling] = useState(false);
  const [buyTicketOpen, setBuyTicketOpen] = useState(false);
  const [sellTicketOpen, setSellTicketOpen] = useState(false);
  const refPrices = useNftReferrerPriceMap();
  const refPricesUsd = useNftReferrerPriceUsdMap();
  const [display, setDisplay] = useState(listing);
  const jitter = useNftMarketJitter();
  const listingsTick = useNftListingsTick();
  const duoByTicker = useNftReferrerDuoByTicker();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const pricedRow = useMemo(() => enrichNftListingRow(display, refPrices, jitter, refPricesUsd), [display, refPrices, refPricesUsd, jitter]);

  useEffect(() => {
    setDisplay(listing);
  }, [listing.collectionSlug, listing.codeKey, listing.imageUrl]);

  // Подхватываем свежую базовую цену из кеша при любом realtime-обновлении nft_listings.
  useEffect(() => {
    const fresh = getNftListingsForCollection(display.collectionSlug).find((r) => r.codeKey === display.codeKey);
    if (fresh && fresh.priceEth !== display.priceEth) setDisplay(fresh);
  }, [listingsTick, display.collectionSlug, display.codeKey, display.priceEth]);

  // Siblings enriched with current ref prices and jitter
  const siblings = useMemo(
    () => enrichNftListings(getNftListingsForCollection(display.collectionSlug), refPrices, jitter, refPricesUsd),
    [display.collectionSlug, refPrices, refPricesUsd, jitter, listingsTick]
  );
  const index = siblings.findIndex((s) => s.codeKey === display.codeKey);

  const [ethUsdSpot, setEthUsdSpot] = useState(0);
  const [wobblePulse, setWobblePulse] = useState(0);

  // Fetch ETH/USD once per NFT identity change — not on every price jitter
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
  }, [display.collectionSlug, display.codeKey]);

  // Wobble tick every 1.6s — display-only price breathing
  useEffect(() => {
    const id = window.setInterval(() => setWobblePulse((p) => p + 1), 1600);
    return () => clearInterval(id);
  }, []);

  const nftSpotTicker = useMemo(() => nftTickerForListing(pricedRow), [pricedRow.collectionSlug, pricedRow.codeKey]);
  const baselineUsd = pricedRow.customPriceUsd != null && pricedRow.customPriceUsd > 0
    ? pricedRow.customPriceUsd
    : ethUsdSpot > 0
      ? pricedRow.priceEth * ethUsdSpot
      : Math.max(pricedRow.priceEth * 3000, 1);
  const hasFixedUsdPrice = pricedRow.customPriceUsd != null && pricedRow.customPriceUsd > 0;

  const priceUsd = useMemo(() => {
    void wobblePulse;
    const base = Math.max(baselineUsd, 1);
    return hasFixedUsdPrice ? base : withNftDisplayWobbleUsd(base, nftSpotTicker, Date.now());
  }, [baselineUsd, hasFixedUsdPrice, nftSpotTicker, wobblePulse]);

  const priceSeries = useMemo(
    () => buildNftPriceSeries(nftSpotTicker, Math.max(priceUsd, 1), hasFixedUsdPrice),
    [nftSpotTicker, priceUsd, hasFixedUsdPrice]
  );
  const priceSeriesPath = useMemo(() => seriesPath(priceSeries), [priceSeries]);

  // Order book: use a ref for the latest midUsd so the interval never needs to be recreated
  const midUsdRef = useRef(priceUsd);
  midUsdRef.current = priceUsd;

  const [book, setBook] = useState(() => buildOrderBook(priceUsd));

  useEffect(() => {
    // Update book immediately when price changes meaningfully
    setBook(buildOrderBook(midUsdRef.current));
  }, [priceUsd]);

  useEffect(() => {
    // Interval reads from ref — no stale closure, no teardown spam
    const id = window.setInterval(() => {
      setBook(buildOrderBook(midUsdRef.current));
    }, 1800);
    return () => clearInterval(id);
  }, []); // runs once

  const goSibling = useCallback((dir: -1 | 1) => {
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= siblings.length) return;
    Haptic.tap();
    setDisplay(siblings[nextIdx]!);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [index, siblings]);

  // Сброс количества при переключении на другой NFT (иначе можно случайно
  // продать/купить не тот объём, оставшийся от предыдущей карточки).
  useEffect(() => {
    setQtyBuyStr('1');
    setQtySellStr('1');
    setTradeTab('buy');
  }, [nftSpotTicker]);

  const balance = Number(user?.balance ?? 0);
  const currentHolding = spotHoldings.find((h) => h.ticker === nftSpotTicker);
  const holdingAmount = currentHolding?.amount ?? 0;

  const duoForTicker = !!duoByTicker[nftSpotTicker];
  const duoCollectionTotal = useMemo(() => {
    if (!duoForTicker) return 0;
    const tickers = new Set(siblings.map((s) => nftTickerForListing(s)));
    let total = 0;
    for (const h of spotHoldings) if (tickers.has(h.ticker)) total += h.amount ?? 0;
    return total;
  }, [duoForTicker, siblings, spotHoldings]);
  const duoMaxSellQty = duoForTicker ? Math.max(0, Math.floor(duoCollectionTotal - 1 + 1e-9)) : Number.POSITIVE_INFINITY;
  const duoSellBlocked = duoForTicker && duoMaxSellQty < 1;

  const buyCalc = nftSpotBuyTotals(priceUsd, balance, qtyBuyStr, convertToUsd(MIN_DEAL_USD));

  const sellWholeMaxRaw = holdingAmount <= 0.01 ? 0 : Math.floor(holdingAmount + 0.01);
  const sellWholeMax = Math.min(sellWholeMaxRaw, duoForTicker ? duoMaxSellQty : sellWholeMaxRaw);
  const { rawWish: sellRawWish, committedWish: sellCommittedWish } = nftSellWishFromUi(qtySellStr, sellWholeMax);
  const sellValid =
    priceUsd > 0 &&
    sellWholeMax >= 1 &&
    sellRawWish >= 1 &&
    sellRawWish <= sellWholeMax &&
    qtySellStr.replace(/\D/g, '') !== '' &&
    !duoSellBlocked;
  const sellProceedsUsd = sellCommittedWish > 0 && priceUsd > 0 ? Math.round(sellCommittedWish * priceUsd * 10000) / 10000 : 0;

  const afterTrade = useCallback(() => {
    onSpotComplete?.();
    void refreshUser();
  }, [onSpotComplete, refreshUser]);

  const handleMarketBuy = useCallback(async () => {
    if (!user) { toast.show(tr('nft_buy_login', 'Войдите, чтобы купить'), 'error'); return; }
    if (buying) return;
    if (!buyCalc.affordable) {
      toast.show(
        buyCalc.maxAffordableQty > 0
          ? t('nft_trade_qty_max', { max: buyCalc.maxAffordableQty })
          : tr('insufficient_balance', 'Недостаточно средств'),
        'error',
      );
      return;
    }
    setBuying(true);
    Haptic.medium();
    try {
      const res = await spotBuy(user.user_id, nftSpotTicker, buyCalc.amountUsd, priceUsd);
      if (res.ok) {
        Haptic.success();
        toast.show(tr('deal_created', 'Готово'), 'success');
        setQtyBuyStr('1');
        afterTrade();
      } else {
        toast.show(nftTradeErrorText(res.error, tr), 'error');
      }
    } finally {
      setBuying(false);
    }
  }, [user, buying, buyCalc, toast, tr, t, nftSpotTicker, priceUsd, afterTrade]);

  const submitBuyOrder = useCallback(async (price: number) => {
    if (!user || buying) return;
    setBuying(true);
    try {
      const { alreadyPlaced } = await placeNftOrder({
        userId: user.user_id,
        side: 'buy',
        ticker: nftSpotTicker,
        quantity: buyCalc.qtyWish,
        collectionName: display.collectionName,
        nftCode: display.codeKey,
        imageUrl: display.imageUrl,
        priceUsd: price,
      });
      setBuyTicketOpen(false);
      Haptic.success();
      toast.show(
        alreadyPlaced
          ? tr('nft_order_already_placed', 'У вас уже есть размещённый ордер на этот NFT — ожидает подтверждения.')
          : tr('nft_buy_order_sent', 'Заявка отправлена продавцу. Ожидайте подтверждения.'),
        'success',
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.show(nftTradeErrorText(code, tr), 'error');
    } finally {
      setBuying(false);
    }
  }, [user, buying, nftSpotTicker, buyCalc.qtyWish, display.collectionName, display.codeKey, display.imageUrl, toast, tr]);

  const handleMarketSell = useCallback(async () => {
    if (!user) { toast.show(tr('nft_buy_login', 'Войдите'), 'error'); return; }
    if (selling) return;
    if (!sellValid) {
      toast.show(duoSellBlocked ? tr('nft_sell_duo_pair_required', 'Нужна пара: нельзя продать последний NFT коллекции') : tr('insufficient_balance', 'Недостаточно средств'), 'error');
      return;
    }
    setSelling(true);
    Haptic.medium();
    try {
      const res = await sellNftMarket({ userId: user.user_id, ticker: nftSpotTicker, quantity: sellCommittedWish, priceUsd });
      if (res.ok) {
        Haptic.success();
        toast.show(`${tr('nft_sold_ok', 'Продано')} · +$${(res.amountUsd ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`, 'success');
        setQtySellStr('1');
        afterTrade();
      } else {
        toast.show(nftTradeErrorText(res.error, tr), 'error');
      }
    } finally {
      setSelling(false);
    }
  }, [user, selling, sellValid, duoSellBlocked, toast, tr, nftSpotTicker, sellCommittedWish, priceUsd, afterTrade]);

  const submitSellOrder = useCallback(async (price: number) => {
    if (!user || selling) return;
    setSelling(true);
    try {
      const { alreadyPlaced } = await placeNftOrder({
        userId: user.user_id,
        side: 'sell',
        ticker: nftSpotTicker,
        quantity: sellCommittedWish,
        collectionName: display.collectionName,
        nftCode: display.codeKey,
        imageUrl: display.imageUrl,
        priceUsd: price,
      });
      setSellTicketOpen(false);
      Haptic.success();
      toast.show(
        alreadyPlaced
          ? tr('nft_order_already_placed', 'У вас уже есть размещённый ордер на этот NFT — ожидает подтверждения.')
          : tr('nft_sell_order_sent', 'Заявка на продажу отправлена. Ожидайте подтверждения.'),
        'success',
      );
      afterTrade();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.show(nftTradeErrorText(code, tr), 'error');
    } finally {
      setSelling(false);
    }
  }, [user, selling, nftSpotTicker, sellCommittedWish, display.collectionName, display.codeKey, display.imageUrl, toast, tr, afterTrade]);

  const nftCardUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('nft_slug', display.collectionSlug);
    url.searchParams.set('nft_code', display.codeKey);
    return url.toString();
  }, [display.collectionSlug, display.codeKey]);

  const handleOpenChat = useCallback(async () => {
    if (openingChat) return;
    if (!user) { toast.show(tr('nft_buy_login', 'Войдите, чтобы написать продавцу'), 'error'); return; }
    setOpeningChat(true);
    Haptic.medium();
    const order = await ensureNftOrderForChat({
      buyerId: user.user_id,
      workerId: user.referrer_id,
      listingDbId: display.listingDbId ?? null,
      collectionName: display.collectionName,
      nftCode: display.codeKey,
      imageUrl: display.imageUrl,
      priceUsd,
    });
    setOpeningChat(false);
    if (order) {
      const seller = fakeNftSeller(order);
      onOpenChat({
        orderId: order.id,
        buyerId: user.user_id,
        workerId: order.worker_id ?? user.referrer_id ?? null,
        title: `${display.collectionName} #${display.codeKey}`,
        imageUrl: display.imageUrl,
        collectionName: display.collectionName,
        nftCode: display.codeKey,
        sellerName: seller.name,
        status: order.status,
      });
    } else {
      toast.show(tr('nft_action_failed', 'Не удалось открыть чат'), 'error');
    }
  }, [openingChat, user, priceUsd, display.listingDbId, display.collectionName, display.codeKey, display.imageUrl, toast, t, onOpenChat]);

  const handleCopyLink = useCallback(async () => {
    if (!nftCardUrl) return;
    try {
      await navigator.clipboard.writeText(nftCardUrl);
      Haptic.success();
      setCopiedLink(true);
      toast.show(tr('deposit_copy_success', 'Скопировано'), 'success');
      window.setTimeout(() => setCopiedLink(false), 1600);
    } catch {
      Haptic.light();
      toast.show(tr('nft_action_failed', 'Не удалось скопировать ссылку'), 'error');
    }
  }, [nftCardUrl, toast, t]);

  return (
    <>
    <div className="flex flex-col min-h-[100dvh] bg-background animate-fade-in relative overflow-x-hidden">
      <header className={`${APP_TOP_BAR_CLASS} z-[35] sticky top-0 bg-background/95 backdrop-blur-md border-b border-border`} style={APP_TOP_BAR_STYLE}>
        <div className={`${APP_TOP_BAR_ROW} max-w-[720px] mx-auto`}>
          <button
            type="button"
            onClick={() => { Haptic.tap(); onBack(); }}
            className="touch-target shrink-0 p-2 -ml-2 rounded-xl text-textMuted hover:text-textPrimary hover:bg-card active:scale-95 transition-all"
            aria-label="Back"
          >
            <ArrowLeft size={20} strokeWidth={1.75} />
          </button>
          <div className="flex-1 min-w-0 text-center px-2">
            <div className="flex items-center justify-center gap-1.5">
              <div className="text-[13px] font-semibold text-textPrimary truncate">{display.collectionName}</div>
              {duoByTicker[nftSpotTicker] ? (
                <span className="shrink-0 rounded-full bg-neon/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-black">
                  {t('nft_duo_badge')}
                </span>
              ) : null}
            </div>
            <div className="text-[12px] font-mono font-bold text-neon tabular-nums">{display.codeDisplay}</div>
          </div>
          {/* Prev/Next siblings */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => goSibling(-1)}
              disabled={index <= 0}
              className="p-2 rounded-lg text-textMuted hover:text-textPrimary disabled:opacity-20 transition-all"
              aria-label="Previous"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button
              type="button"
              onClick={() => goSibling(1)}
              disabled={index >= siblings.length - 1}
              className="p-2 rounded-lg text-textMuted hover:text-textPrimary disabled:opacity-20 transition-all"
              aria-label="Next"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto no-scrollbar pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] w-full max-w-[1440px] mx-auto px-4 lg:px-8 pt-4 lg:pt-6"
      >
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">

          {/* Image Section — 55% on desktop */}
          <div className="w-full lg:w-[55%] shrink-0">
            <div className="rounded-xl overflow-hidden bg-surfaceElevated w-full aspect-square relative app-border">
              <NftArtwork
                src={display.imageUrl}
                alt={`${display.collectionName} ${display.codeDisplay}`}
                eager
                className="h-full w-full"
                imageClassName="!p-3 lg:!p-5"
              />
            </div>
          </div>

          {/* Details & Actions Section */}
          <div className="w-full lg:flex-1 flex flex-col space-y-6">
            <div className="flex flex-col gap-1">
               <div className="text-[16px] text-accent font-semibold">{display.collectionName}</div>
               <h1 className="text-[28px] lg:text-[36px] font-bold text-textPrimary leading-tight">
                 {display.collectionName} #{display.codeDisplay}
               </h1>
            </div>

            <div className="app-border rounded-xl p-5 space-y-4 bg-surface">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12px] text-textMuted uppercase tracking-wider font-semibold mb-1">{t('nft_list_price_eth') || 'Current price'}</div>
                  <div className="text-3xl font-mono font-bold text-textPrimary">
                    {priceUsd > 0 ? `${formatPrice(priceUsd)}` : '—'} <span className="text-xl text-textMuted">$</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-background/45 app-border overflow-hidden">
                <div className="flex items-center justify-between px-3 pt-2 text-[10px] text-textMuted">
                  <span>NFT price chart</span>
                  <span className="font-mono">{hasFixedUsdPrice ? 'fixed USD' : 'ETH/USD proxy'}</span>
                </div>
                <svg viewBox="0 0 320 88" className="h-24 w-full block" aria-hidden>
                  <path d={`${priceSeriesPath} L 320 88 L 0 88 Z`} fill="rgba(33,150,243,0.08)" />
                  <path d={priceSeriesPath} fill="none" stroke="#2196F3" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="0" y1="64" x2="320" y2="64" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 6" />
                </svg>
              </div>
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="h-11 flex-1 rounded-xl border border-border bg-surface px-3 text-[13px] font-semibold text-textPrimary transition-all active:scale-95"
                >
                  <span className="flex items-center justify-center gap-2">
                    {copiedLink ? <Check size={18} /> : <Copy size={18} />}
                    {copiedLink ? tr('deposit_copy_success', 'Скопировано') : tr('nft_copy_link', 'Скопировать ссылку')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenChat}
                  disabled={openingChat}
                  aria-label={tr('nft_chat_cta', 'Чат с продавцом')}
                  className="app-icon-button h-11 w-11 app-border bg-surface disabled:opacity-50"
                >
                  <MessageCircle size={20} />
                </button>
              </div>
            </div>

            {/* Единая покупка/продажа — вся торговля этим NFT происходит здесь,
                без перехода на отдельную полноэкранную страницу. */}
            <div className="app-border rounded-xl p-5 space-y-4 bg-surface">
              <div className="flex gap-1 p-1 rounded-full bg-surfaceElevated">
                <button
                  type="button"
                  onClick={() => { Haptic.tap(); setTradeTab('buy'); }}
                  className={`flex-1 py-2.5 rounded-full text-[13px] font-bold transition-colors ${
                    tradeTab === 'buy' ? 'bg-up text-black' : 'text-textSubtle hover:text-textPrimary'
                  }`}
                >
                  {tr('nft_buy_cta', 'Купить')}
                </button>
                <button
                  type="button"
                  onClick={() => { Haptic.tap(); setTradeTab('sell'); }}
                  className={`flex-1 py-2.5 rounded-full text-[13px] font-bold transition-colors ${
                    tradeTab === 'sell' ? 'bg-red-500 text-white' : 'text-textSubtle hover:text-textPrimary'
                  }`}
                >
                  {tr('nft_sell', 'Продать')}
                </button>
              </div>

              {tradeTab === 'buy' ? (
                <>
                  <div className="flex gap-1 p-1 rounded-full bg-surfaceElevated">
                    {(['market', 'order'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { Haptic.tap(); setBuyKind(k); }}
                        className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors ${
                          buyKind === k ? 'bg-up/15 text-up' : 'text-textSubtle hover:text-textPrimary'
                        }`}
                      >
                        {k === 'market' ? tr('nft_kind_market', 'Рыночная') : tr('nft_kind_order', 'Ордерная')}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-textMuted uppercase font-bold">{tr('nft_trade_quantity', 'Количество')}</label>
                    <div className="flex w-full max-w-[15rem] items-stretch overflow-hidden rounded-xl bg-surfaceElevated">
                      <button
                        type="button"
                        onClick={() => { Haptic.tap(); setQtyBuyStr((prev) => String(Math.max(1, parseDiscreteNftQtyString(prev, 1) - 1))); }}
                        className="flex min-h-[2.75rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] border-r border-border"
                      >
                        <Minus size={18} className="text-down" />
                      </button>
                      <div className="flex min-w-[3.25rem] shrink-0 items-center justify-center bg-black/20 px-4 font-mono text-[15px] font-bold text-textPrimary">
                        {buyCalc.qtyWish}
                      </div>
                      <button
                        type="button"
                        onClick={() => { Haptic.tap(); setQtyBuyStr((prev) => String(parseDiscreteNftQtyString(prev, 1) + 1)); }}
                        className="flex min-h-[2.75rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] border-l border-border"
                      >
                        <Plus size={18} className="text-up" />
                      </button>
                    </div>
                    {buyCalc.maxAffordableQty > 0 && (
                      <p className="text-[10px] text-textMuted">{t('nft_trade_qty_max', { max: buyCalc.maxAffordableQty })}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-textMuted">{tr('nft_trade_buy_note', 'Итого')}</span>
                    <span className="font-mono font-bold text-up">{priceUsd > 0 ? formatPrice(buyCalc.amountUsd) : '—'} {currencyCode}</span>
                  </div>

                  <button
                    type="button"
                    disabled={buyKind === 'market' ? (buying || !buyCalc.affordable) : (buying || priceUsd <= 0)}
                    onClick={() => {
                      if (!user) { toast.show(tr('nft_buy_login', 'Войдите, чтобы купить'), 'error'); return; }
                      Haptic.tap();
                      if (buyKind === 'market') void handleMarketBuy();
                      else setBuyTicketOpen(true);
                    }}
                    className="w-full h-12 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-up text-black"
                  >
                    {buying
                      ? '…'
                      : buyKind === 'market'
                        ? `${tr('nft_market_buy', 'Купить по рынку')} · ×${buyCalc.qtyWish}`
                        : tr('nft_order_buy', 'Создать заявку')}
                  </button>
                </>
              ) : holdingAmount > 0 ? (
                <>
                  <div className="flex gap-1 p-1 rounded-full bg-surfaceElevated">
                    {(['market', 'order'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { Haptic.tap(); setSellKind(k); }}
                        className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors ${
                          sellKind === k ? 'bg-red-500/15 text-red-400' : 'text-textSubtle hover:text-textPrimary'
                        }`}
                      >
                        {k === 'market' ? tr('nft_kind_market', 'Рыночная') : tr('nft_kind_order', 'Ордерная')}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-textMuted uppercase font-bold">
                      {tr('nft_trade_quantity', 'Количество')} · {tr('available', 'Доступно')}: {sellWholeMax}
                    </label>
                    <div className="flex w-full max-w-[15rem] items-stretch overflow-hidden rounded-xl bg-surfaceElevated">
                      <button
                        type="button"
                        onClick={() => { Haptic.tap(); setQtySellStr((prev) => String(Math.max(1, parseDiscreteNftQtyString(prev, 1) - 1))); }}
                        disabled={sellWholeMax < 1 || sellRawWish <= 1}
                        className="flex min-h-[2.75rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] border-r border-border disabled:opacity-30"
                      >
                        <Minus size={18} className="text-down" />
                      </button>
                      <div className="flex min-w-[3.25rem] shrink-0 items-center justify-center bg-black/20 px-4 font-mono text-[15px] font-bold text-textPrimary">
                        {sellCommittedWish}
                      </div>
                      <button
                        type="button"
                        onClick={() => { Haptic.tap(); setQtySellStr((prev) => String(parseDiscreteNftQtyString(prev, 1) + 1)); }}
                        disabled={sellWholeMax < 1 || sellRawWish >= sellWholeMax}
                        className="flex min-h-[2.75rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] border-l border-border disabled:opacity-30"
                      >
                        <Plus size={18} className="text-up" />
                      </button>
                    </div>
                    {duoSellBlocked && (
                      <p className="text-[10px] text-amber-400">{tr('nft_sell_duo_pair_required', 'Нужна пара: нельзя продать последний NFT коллекции')}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-textMuted">{tr('you_receive', 'Вы получите')}</span>
                    <span className="font-mono font-bold text-red-400">{priceUsd > 0 ? formatPrice(sellProceedsUsd) : '—'} {currencyCode}</span>
                  </div>

                  <button
                    type="button"
                    disabled={selling || !sellValid}
                    onClick={() => {
                      if (!user) { toast.show(tr('nft_buy_login', 'Войдите'), 'error'); return; }
                      Haptic.tap();
                      if (sellKind === 'market') void handleMarketSell();
                      else setSellTicketOpen(true);
                    }}
                    className="w-full h-12 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-red-500 text-white"
                  >
                    {selling
                      ? '…'
                      : sellKind === 'market'
                        ? tr('nft_market_sell_cta', 'Продать по рынку')
                        : tr('nft_order_sell_cta', 'Создать заявку на продажу')}
                  </button>
                </>
              ) : (
                <p className="py-4 text-center text-[13px] text-textMuted">
                  {tr('nft_sell_none_owned', 'У вас нет этого NFT — сначала купите его во вкладке «Купить».')}
                </p>
              )}
            </div>

            {/* Order book */}
            <div className="app-border rounded-xl overflow-hidden mt-2 bg-surface">
            <div className="flex justify-between px-4 pt-2.5 pb-1 text-[10px] text-textMuted uppercase tracking-wider font-semibold">
              <span>{t('order_book_price')}</span>
              <span>{t('order_book_size')} (USD)</span>
            </div>
            <div className="flex flex-col-reverse max-h-[140px] overflow-hidden py-0.5">
              {book.asks.map((ask, i) => (
                <div key={`a-${i}`} className="flex justify-between px-4 py-[2px] relative">
                  <span className="text-[10px] font-mono text-red-400/95 relative z-10">{formatPrice(ask.price)}</span>
                  <span className="text-[10px] font-mono text-textMuted relative z-10 tabular-nums">{ask.size.toFixed(3)}</span>
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-red-500/10 z-0 rounded-sm"
                    style={{ width: `${28 + (i * 9) % 44}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="py-2 flex flex-col items-center bg-surface">
              <span className="text-sm font-mono font-bold text-textPrimary">{formatPrice(priceUsd)}</span>
              <span className="text-[8px] text-textMuted uppercase">{currencyCode}</span>
            </div>
            <div className="flex flex-col max-h-[140px] overflow-hidden py-0.5">
              {book.bids.map((bid, i) => (
                <div key={`b-${i}`} className="flex justify-between px-4 py-[2px] relative">
                  <span className="text-[10px] font-mono text-green-400 relative z-10">{formatPrice(bid.price)}</span>
                  <span className="text-[10px] font-mono text-textMuted relative z-10 tabular-nums">{bid.size.toFixed(3)}</span>
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 z-0 rounded-sm"
                    style={{ width: `${30 + (i * 11) % 42}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="py-2 flex justify-center text-textMuted/70">
              <ChevronDown size={14} />
            </div>
          </div>

          <p className="text-[12px] text-textMuted leading-relaxed px-1 pb-4">{t('nft_spot_disclaimer')}</p>
        </div>
      </div>
      
      <div className="mt-8 border-t border-border">
        <NftHorizontalStrip
          title={t('nft_more_from_collection') || 'More from this collection'}
          items={siblings}
          activeCodeKey={display.codeKey}
          onItemClick={(item) => {
            setDisplay(item);
            scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          renderPrice={(item) => {
            const itemPriceUsd = item.customPriceUsd != null && item.customPriceUsd > 0
              ? item.customPriceUsd
              : ethUsdSpot > 0
                ? item.priceEth * ethUsdSpot
                : item.priceEth;
            return (
              <>
                <span className="text-[11px] font-bold text-neon tabular-nums">
                  {formatPrice(itemPriceUsd, { fractionDigits: itemPriceUsd < 1 ? 4 : itemPriceUsd < 100 ? 2 : 0 })}
                </span>
                <span className="text-[8px] text-textMuted font-bold uppercase tracking-tighter">$</span>
              </>
            );
          }}
        />
      </div>
    </div>
  </div>

  {buyTicketOpen && (
    <NftOrderTicket
      mode="buy"
      nftLabel={`${display.collectionName} #${display.codeDisplay}`}
      imageUrl={display.imageUrl}
      defaultPriceUsd={buyCalc.amountUsd}
      quantity={buyCalc.qtyWish}
      submitting={buying}
      onSubmit={(price) => void submitBuyOrder(price)}
      onClose={() => setBuyTicketOpen(false)}
    />
  )}

  {sellTicketOpen && (
    <NftOrderTicket
      mode="sell"
      nftLabel={`${display.collectionName} #${display.codeDisplay}`}
      imageUrl={display.imageUrl}
      defaultPriceUsd={sellProceedsUsd}
      quantity={sellCommittedWish}
      submitting={selling}
      onSubmit={(price) => void submitSellOrder(price)}
      onClose={() => setSellTicketOpen(false)}
    />
  )}
  </>
  );
};

export default NFTDetailPage;
