import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy, MessageCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { ensureNftOrderForChat, fakeNftSeller } from '../lib/nftOrders';
import { fetchAssetPricesInUsd } from '../lib/cryptoPrices';
import { getNftListingsForCollection, nftListingToAsset, nftTickerForListing, type NftListingRow } from '../lib/nftCatalog';
import { enrichNftListingRow, enrichNftListings, useNftReferrerPriceMap, useNftReferrerPriceUsdMap, useNftMarketJitter, useNftListingsTick, useNftReferrerDuoByTicker } from '../lib/nftReferrerPricing';
import { withNftDisplayWobbleUsd } from '../utils/nftPriceWobble';
import type { Asset } from '../types';
import { Haptic } from '../utils/haptics';
import {
  APP_TOP_BAR_CLASS,
  APP_TOP_BAR_ROW,
  APP_TOP_BAR_STYLE,
} from '../components/appTopBar';
import NftHorizontalStrip from '../components/NftHorizontalStrip';

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
  onTrade: (asset: Asset) => void;
  onOpenChat: (ctx: NftChatContext) => void;
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

const NFTDetailPage: React.FC<NFTDetailPageProps> = ({ listing, onBack, onTrade, onOpenChat }) => {
  const { t } = useLanguage();
  const tr = (key: string, fallback: string) => { const v = t(key); return v === key ? fallback : v; };
  const { formatPrice, currencyCode } = useCurrency();
  const { user } = useUser();
  const toast = useToast();
  const [openingChat, setOpeningChat] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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
    [display.collectionSlug, refPrices, jitter, listingsTick]
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

  const priceUsd = useMemo(() => {
    void wobblePulse;
    return withNftDisplayWobbleUsd(Math.max(baselineUsd, 1), nftSpotTicker, Date.now());
  }, [baselineUsd, nftSpotTicker, wobblePulse]);

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

  const assetReady = nftListingToAsset(pricedRow, Math.max(priceUsd, 1));
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
              <img
                key={display.codeKey}
                src={display.imageUrl}
                alt=""
                className="w-full h-full object-contain"
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
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
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => { Haptic.medium(); onTrade(assetReady); }}
                  className="app-button-primary flex-1 text-[15px]"
                >
                  {t('nft_trade_cta') || 'Buy now'}
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="h-11 shrink-0 rounded-xl border border-border bg-surface px-3 text-[13px] font-semibold text-textPrimary transition-all active:scale-95"
                >
                  <span className="flex items-center gap-2">
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
  );
};

export default NFTDetailPage;
