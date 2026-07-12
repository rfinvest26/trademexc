import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Asset,
  Deal,
  type NavigateToTradingOptions,
  type OrderTypeUI,
  type PendingOrder,
  type TradingRiskSettings,
} from '../types';
import { Clock, Zap, Check, X, ChevronDown, ChevronRight, Info, BarChart3, FileText, Loader2, CheckCircle2, Settings2, ArrowLeftRight, Minus, Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Haptic } from '../utils/haptics';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
const usePin = () => ({
  requirePin: (userId: any, message: string, cb: () => void) => cb(),
});
import { useCurrency } from '../context/CurrencyContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebAuth } from '../context/WebAuthContext';
import { useFullscreenSheetLock } from '../context/FullscreenSheetLockContext';
import {
  getTradingViewSymbolForAsset,
  getTradingViewSymbolLabelForAsset,
} from '../utils/chartSymbol';
import { fetchAssetPricesInUsd } from '../lib/cryptoPrices';
import { fetchFinnhubQuoteInUsd, resolveUsdRate } from '../lib/finnhubStockQuotes';
import { nftDisplayUsdMultiplier, withNftDisplayWobbleUsd } from '../utils/nftPriceWobble';
import { spotBuy, spotSell } from '../lib/spot';
import { placeNftOrder } from '../lib/nftOrders';
import NftOrderTicket from '../components/NftOrderTicket';
import type { SpotHolding } from '../types';
import CoinsPage from './CoinsPage';
import { getAllNftListings, nftTickerForListing } from '../lib/nftCatalog';
import { useNftReferrerDuoByTicker } from '../lib/nftReferrerPricing';
import BottomSheet from '../components/BottomSheet';
import BottomSheetFooter from '../components/BottomSheetFooter';
import { Z_INDEX } from '../constants/zIndex';
import { getChartEmbed, type ChartProvider, type ChartInterval, type ChartStyle } from '../utils/getChartEmbed';
import AppInput from '../components/AppInput';
import {
  loadPendingOrders,
  upsertPendingOrder,
  removePendingOrder,
  createPendingOrder,
  loadRiskSettings,
  saveRiskSettings,
  shouldFillPendingOrder,
  appendOrderHistory,
  loadOrderHistory,
  type OrderHistoryEntry,
} from '../lib/tradingStore';

const MIN_DEAL_USD = 5;

function parseDiscreteNftQtyString(raw: string, fallbackMin: number): number {
  const only = raw.replace(/\D/g, '');
  if (!only) return fallbackMin;
  const n = parseInt(only, 10);
  return Number.isFinite(n) && n >= fallbackMin ? n : fallbackMin;
}

/** raw — как вводит пользователь (без ограничения); committed зажат по maxWhole для превью. */
function nftSellWishFromUi(
  raw: string,
  maxWhole: number
): { rawWish: number; committedWish: number } {
  if (maxWhole < 1) return { rawWish: 0, committedWish: 0 };
  const only = raw.replace(/\D/g, '');
  const rawWish = only === '' ? 1 : Math.max(parseInt(only, 10) || 0, 0);
  if (!Number.isFinite(rawWish) || rawWish < 1) return { rawWish: 1, committedWish: 1 };
  return { rawWish, committedWish: Math.min(rawWish, maxWhole) };
}

function nftSpotBuyTotals(liveUsd: number, balanceUsd: number, qtyRaw: string, minUsd: number) {
  const qtyWish = parseDiscreteNftQtyString(qtyRaw, 1);
  if (!Number.isFinite(liveUsd) || liveUsd <= 0) {
    return { qtyWish, maxAffordableQty: 0, amountUsd: 0, affordable: false };
  }
  const maxAffordableQty = balanceUsd >= liveUsd ? Math.floor(balanceUsd / liveUsd + 1e-9) : 0;
  const amountUsd = Math.round(qtyWish * liveUsd * 10000) / 10000;
  const affordable =
    qtyWish >= 1 &&
    amountUsd <= balanceUsd &&
    amountUsd >= minUsd &&
    (maxAffordableQty <= 0 || qtyWish <= maxAffordableQty);
  return { qtyWish, maxAffordableQty, amountUsd, affordable };
}

interface TradingPageProps {
  asset: Asset | null;
  balance: number;
  balanceLoading?: boolean;
  tradingBlocked?: boolean;
  onBack: () => void;
  onOpenDeal: (deal: Deal) => void;
  onChangeAsset?: (asset: Asset, options?: NavigateToTradingOptions) => void;
  spotHoldings?: SpotHolding[];
  onSpotComplete?: () => void;
  onReferralSpotBuy?: (ticker: string, amountUsd: number) => void;
  initialTradeType?: 'futures' | 'spot';
  initialSpotAction?: 'buy' | 'sell';
  initialActiveTab?: 'CHART' | 'TRADE';
  /** Активные фьючерсные сделки (для вкладки «Позиции»). */
  activeDeals?: Deal[];
  /** История фьючерсных сделок (для вкладки «History»). */
  dealHistory?: Deal[];
  onRequireAuth?: () => void;
}

type Tab = 'CHART' | 'TRADE';
type Side = 'UP' | 'DOWN';

const TIMEFRAMES = [
  { sec: 10 },
  { sec: 30 },
  { sec: 60 },
  { sec: 300 },
  { sec: 900 },
  { sec: 1800 },
  { sec: 3600 },
];

const CHART_TIMEFRAMES: ChartInterval[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];

const chartStyleToLabelKey: Record<ChartStyle, string> = {
  candles: 'chart_style_candles',
  bars: 'chart_style_bars',
  line: 'chart_style_line',
};

function ChartToolbar(props: {
  asset: Asset;
  ticker: string;
  price: string;
  change24h: number;
  chartStyle: ChartStyle;
  onChartStyleChange: (next: ChartStyle) => void;
  provider: ChartProvider;
  onProviderChange: (next: ChartProvider) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onCloseFullscreen: () => void;
}) {
  const {
    asset,
    ticker,
    price,
    change24h,
    chartStyle,
    onChartStyleChange,
    provider,
    onProviderChange,
    isFullscreen,
    onFullscreenToggle,
    onCloseFullscreen,
  } = props;

  const changeColor = (change24h ?? 0) >= 0 ? '#10b981' : '#f87171';
  const changeText = `${(change24h ?? 0) >= 0 ? '+' : ''}${(change24h ?? 0).toFixed(2)}%`;

  const providerOptions: ChartProvider[] = ['TV'];
  const canRenderChartTypes = true;
  const { t } = useLanguage();

  const iconStrokeProps = {
    stroke: 'currentColor',
    strokeWidth: 1.5,
    fill: 'none',
  } as const;

  const CandlesIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <rect x="3" y="4" width="3" height="6" rx="0.5" />
      <line x1="4.5" y1="1" x2="4.5" y2="4" />
      <line x1="4.5" y1="10" x2="4.5" y2="13" />
      <rect x="8" y="2" width="3" height="8" rx="0.5" />
      <line x1="9.5" y1="1" x2="9.5" y2="2" />
      <line x1="9.5" y1="10" x2="9.5" y2="12" />
    </svg>
  );

  const BarsIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <line x1="3" y1="2" x2="3" y2="12" />
      <line x1="3" y1="4" x2="5" y2="4" />
      <line x1="8" y1="3" x2="8" y2="11" />
      <line x1="8" y1="8" x2="10" y2="8" />
      <line x1="2" y1="6" x2="2" y2="7" opacity={0.0} />
    </svg>
  );

  const LineIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <polyline points="1,10 4,5 7,8 10,3 13,6" />
    </svg>
  );

  const ExpandIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <path d="M1 5 L1 1 L5 1" />
      <path d="M9 1 L13 1 L13 5" />
      <path d="M1 9 L1 13 L5 13" />
      <path d="M9 13 L13 13 L13 9" />
    </svg>
  );

  const CloseXIcon = () => (
    <svg viewBox="0 0 14 14" {...iconStrokeProps} width={14} height={14} aria-hidden>
      <path d="M3 3 L11 11" />
      <path d="M11 3 L3 11" />
    </svg>
  );

  return (
    <div
      className={`bg-background/72 backdrop-blur-xl border-b border-border/60 px-4 py-2 flex items-center gap-2 transition-all duration-300 ${
        isFullscreen ? 'fixed top-0 left-0 right-0' : 'relative z-20'
      }`}
      style={isFullscreen ? { zIndex: Z_INDEX.fullscreen + 1 } : undefined}
    >
      {/* a) Ticker + price + change */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm font-bold text-white truncate">{ticker}</span>
        <span className="font-mono text-xs text-neon truncate max-w-[90px]">{price}</span>
        <span className="text-xs" style={{ color: changeColor }}>
          {changeText}
        </span>
      </div>

      {/* b) divider */}
      <div className="w-px h-4 bg-border/60 mx-1" />

      {/* e) Chart style */}
      <div className="hidden md:flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChartStyleChange('candles')}
          className={`p-1.5 rounded border transition-colors ${
            chartStyle === 'candles'
              ? 'bg-card text-neon border-neon/30'
              : 'text-textMuted border-transparent hover:text-textPrimary'
          }`}
          aria-label={t(chartStyleToLabelKey.candles)}
          title={t(chartStyleToLabelKey.candles)}
          disabled={!canRenderChartTypes}
        >
          <CandlesIcon />
        </button>
        <button
          type="button"
          onClick={() => onChartStyleChange('bars')}
          className={`p-1.5 rounded border transition-colors ${
            chartStyle === 'bars'
              ? 'bg-card text-neon border-neon/30'
              : 'text-textMuted border-transparent hover:text-textPrimary'
          }`}
          aria-label={t(chartStyleToLabelKey.bars)}
          title={t(chartStyleToLabelKey.bars)}
          disabled={!canRenderChartTypes}
        >
          <BarsIcon />
        </button>
        <button
          type="button"
          onClick={() => onChartStyleChange('line')}
          className={`p-1.5 rounded border transition-colors ${
            chartStyle === 'line'
              ? 'bg-card text-neon border-neon/30'
              : 'text-textMuted border-transparent hover:text-textPrimary'
          }`}
          aria-label={t(chartStyleToLabelKey.line)}
          title={t(chartStyleToLabelKey.line)}
          disabled={!canRenderChartTypes}
        >
          <LineIcon />
        </button>
      </div>

      {/* f) flex-grow divider */}
      <div className="flex-1" />

      {/* g) provider buttons */}
      <div className="flex items-center gap-1">
        {providerOptions.map((p) => {
          const active = provider === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onProviderChange(p)}
              className={`whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                active ? 'text-neon border-neon/40 bg-neon/5' : 'text-textMuted border-transparent hover:text-textPrimary'
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* h) fullscreen button */}
      <button
        type="button"
        onClick={() => (isFullscreen ? onCloseFullscreen() : onFullscreenToggle())}
        className={`ml-1 p-1.5 rounded border transition-colors ${
          isFullscreen
            ? 'bg-card text-neon border-neon/30'
            : 'text-textMuted border-transparent hover:text-textPrimary'
        }`}
        aria-label={isFullscreen ? t('close') : t('chart_toggle_aria')}
        title={isFullscreen ? t('close') : t('chart_toggle_aria')}
      >
        {isFullscreen ? <CloseXIcon /> : <ExpandIcon />}
      </button>
    </div>
  );
}

function ChartEmbed(props: {
  asset: Asset;
  provider: ChartProvider;
  interval: ChartInterval;
  chartStyle: ChartStyle;
  chartLoaded: boolean;
  setChartLoaded: (v: boolean) => void;
  isFullscreen: boolean;
}) {
  const { t } = useLanguage();
  const { asset, provider, interval, chartStyle, setChartLoaded } = props;
  const embed = getChartEmbed(asset, { provider, interval, chartStyle });
  const embedKey = `${provider}-${interval}-${chartStyle}-${asset.ticker}`;

  if (embed.kind === 'iframe') {
    return (
      <iframe
        key={embedKey}
        title={t('chart_title')}
        className="w-full h-full border-0 rounded-none"
        style={{ border: 'none', outline: 'none' }}
        src={embed.src}
        scrolling="no"
        loading="lazy"
        onLoad={() => setChartLoaded(true)}
      />
    );
  }

  // CoinGecko (GCK) — отключён по ТЗ, не рендерим web-component.
  if (embed.kind === 'gck') return null;

  return null;
}

const TradingPage: React.FC<TradingPageProps> = ({
  asset,
  balance,
  balanceLoading = false,
  tradingBlocked = false,
  onBack,
  onOpenDeal,
  onChangeAsset,
  spotHoldings = [],
  onSpotComplete,
  onReferralSpotBuy,
  initialTradeType,
  initialSpotAction,
  initialActiveTab,
  activeDeals = [],
  dealHistory = [],
  onRequireAuth,
}) => {
  const toast = useToast();
  const { user, tgid } = useUser();
  const { webUserId } = useWebAuth();
  const { requirePin } = usePin();
  const { formatPrice, convertFromUsd, convertToUsd, symbol, currencyCode, baseCurrency, rates } = useCurrency();
  const { t } = useLanguage();
  // t() возвращает сам ключ при отсутствии перевода — этот guard даёт fallback.
  const tr = (key: string, fallback: string) => { const v = t(key); return v === key ? fallback : v; };
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (initialActiveTab === 'CHART') return 'CHART';
    if (initialActiveTab === 'TRADE') return 'TRADE';
    return (asset?.category ?? 'crypto') === 'nft' ? 'TRADE' : 'CHART';
  });
  const [tradeType, setTradeType] = useState<'futures' | 'spot'>(initialTradeType ?? 'futures');
  const [spotAction, setSpotAction] = useState<'buy' | 'sell'>(initialSpotAction ?? 'buy');
  /** Сумма покупки спот в валюте баланса — вводится в той же валюте, что и баланс (RUB, USD и т.д.) */
  const [spotAmount, setSpotAmount] = useState<string>(() =>
    baseCurrency === 'rub' ? '1000' : baseCurrency === 'usd' ? '50' : baseCurrency === 'eur' ? '50' : '100'
  );
  const [spotQuantity, setSpotQuantity] = useState<string>('');
  /** Целые лоты при покупке / продаже NFT (спот). */
  const [nftQtyBuyStr, setNftQtyBuyStr] = useState('1');
  const [nftQtySellStr, setNftQtySellStr] = useState('1');
  const [spotLoading, setSpotLoading] = useState(false);
  const [leverage, setLeverage] = useState(10);
  const [amount, setAmount] = useState<string>('1000');
  const [duration, setDuration] = useState<number>(30);
  const [side, setSide] = useState<Side>('UP');
  const [livePrice, setLivePrice] = useState(asset?.price ?? 0);
  /** Актуальность котировки с API (шапка, стакан, FX); обновляется опросом цены. */
  const [quoteUnavailable, setQuoteUnavailable] = useState(asset?.priceUnavailable ?? false);
  const [displayChange24h, setDisplayChange24h] = useState(asset?.change24h ?? 0);
  const [showAssetSearch, setShowAssetSearch] = useState(false);

  const prevLivePriceRef = useRef<number | null>(null);
  /** Последний курс 1 ETH в RUB (для серверной проверки spot_buy NFT). */
  const lastNftEthUsdRef = useRef<number>(0);
  /** Последний валидный USD/RUB для Finnhub (акции), чтобы не сбрасывать цену при кратком отсутствии курса). */
  const stockPriceFallbackRef = useRef<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'flat'>('flat');
  /** Flash effect для стакана: сбрасывается через 300ms после смены направления */
  const [flashDirection, setFlashDirection] = useState<'up' | 'down' | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSpotConfirm, setShowSpotConfirm] = useState<'buy' | 'sell' | null>(null);
  const [orderTypeUI, setOrderTypeUI] = useState<OrderTypeUI>('market');
  const [limitPriceStr, setLimitPriceStr] = useState('');
  const [stopTriggerStr, setStopTriggerStr] = useState('');
  const [riskSettings, setRiskSettings] = useState<TradingRiskSettings>(() => loadRiskSettings());
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>(() => loadPendingOrders());
  const [orderHistory, setOrderHistory] = useState<OrderHistoryEntry[]>(() => loadOrderHistory());
  const [proPanelTab, setProPanelTab] = useState<'positions' | 'open_orders' | 'history'>('positions');
  const [showProSettings, setShowProSettings] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [interval, setInterval] = useState<ChartInterval>('5m');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('candles');
  const [provider, setProvider] = useState<ChartProvider>('TV');
  const [tpPrice, setTpPrice] = useState<string>('');
  const [slPrice, setSlPrice] = useState<string>('');
  const [marginMode, setMarginMode] = useState<'isolated' | 'cross'>('isolated');
  const [showMarginSheet, setShowMarginSheet] = useState(false);
  const [nftOrdering, setNftOrdering] = useState(false);
  const [orderTicketOpen, setOrderTicketOpen] = useState(false);
  const [nftSellTicketOpen, setNftSellTicketOpen] = useState(false);
  const [nftBuyKind, setNftBuyKind] = useState<'market' | 'order'>('market');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartAnimMode, setChartAnimMode] = useState<'fade' | 'slide'>('fade');

  const { acquire: chartFullscreenAcquire, release: chartFullscreenRelease } = useFullscreenSheetLock();
  useEffect(() => {
    if (!isFullscreen) return undefined;
    chartFullscreenAcquire();
    return () => chartFullscreenRelease();
  }, [isFullscreen, chartFullscreenAcquire, chartFullscreenRelease]);

  const [asks, setAsks] = useState<{price: number, size: number}[]>([]);
  const [bids, setBids] = useState<{price: number, size: number}[]>([]);
  const [orderBookBase, setOrderBookBase] = useState(0);

  const advanced = riskSettings.showAdvancedFields;

  const userIdNum = user?.user_id ?? (tgid ? Number(tgid) : webUserId ?? 0);
  const currentHolding = spotHoldings.find((h) => {
    if (h.ticker === asset?.ticker) return true;
    if (asset?.category === 'nft' && asset.nft) {
      const codeOnly = asset.nft.codeKey.replace(/[^A-Z0-9]/gi, '');
      if (codeOnly && h.ticker.endsWith(codeOnly)) return true;
    }
    return false;
  });
  const holdingAmount = currentHolding?.amount ?? 0;

  const refNftDuoByTicker = useNftReferrerDuoByTicker();
  const nftCollectionSlugForDuo = asset?.nft?.collectionSlug ?? null;
  const nftDuoCollectionTotal = useMemo(() => {
    if (!nftCollectionSlugForDuo) return 0;
    const tickers = new Set(
      getAllNftListings()
        .filter((r) => r.collectionSlug === nftCollectionSlugForDuo)
        .map((r) => nftTickerForListing(r))
    );
    let s = 0;
    for (const h of spotHoldings) {
      if (tickers.has(h.ticker)) s += h.amount ?? 0;
    }
    return s;
  }, [nftCollectionSlugForDuo, spotHoldings]);

  const refreshOrderStore = useCallback(() => {
    setPendingOrders(loadPendingOrders());
    setOrderHistory(loadOrderHistory());
  }, []);

  useEffect(() => {
    const rs = loadRiskSettings();
    setRiskSettings(rs);
    setOrderTypeUI(rs.defaultOrderType);
  }, []);

  useEffect(() => {
    setLeverage((l) => Math.min(l, riskSettings.maxLeverage));
  }, [riskSettings.maxLeverage]);

  useEffect(() => {
    if (orderTypeUI === 'limit' && livePrice > 0 && !limitPriceStr) {
      setLimitPriceStr(livePrice.toFixed(2));
    }
    if (orderTypeUI === 'stop' && livePrice > 0 && !stopTriggerStr) {
      setStopTriggerStr(livePrice.toFixed(2));
    }
  }, [orderTypeUI, livePrice, limitPriceStr, stopTriggerStr]);

  // Начальные tradeType/spotAction применяем ОДИН РАЗ на каждый новый ассет.
  // Раньше эффект зависел от currentHolding?.amount и asset и повторно форсил
  // spotAction=initialSpotAction, из-за чего ручное переключение «Купить→Продать»
  // тут же откатывалось обратно на «Купить». Теперь — только при смене тикера.
  const initialsAppliedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!asset) return;
    const key = asset.ticker;
    if (initialsAppliedForRef.current === key) return;
    initialsAppliedForRef.current = key;
    if (initialTradeType) setTradeType(initialTradeType);
    if (initialSpotAction) setSpotAction(initialSpotAction);
    if (initialSpotAction === 'sell' && currentHolding) {
      setSpotQuantity(String(currentHolding.amount));
    }
  }, [asset?.ticker, initialTradeType, initialSpotAction, currentHolding]);

  useEffect(() => {
    if (!asset) return;
    if ((asset.category ?? 'crypto') === 'nft') {
      setActiveTab('TRADE');
      return;
    }
    if (initialActiveTab === 'CHART') setActiveTab('CHART');
    else if (initialActiveTab === 'TRADE') setActiveTab('TRADE');
  }, [asset?.ticker, asset?.category, initialActiveTab]);

  useEffect(() => {
    if ((asset?.category ?? 'crypto') !== 'nft') return;
    setTradeType('spot');
    setActiveTab('TRADE');
    setOrderTypeUI('market');
  }, [asset?.category, asset?.ticker]);

  useEffect(() => {
    if ((asset?.category ?? 'crypto') === 'nft') {
      setNftQtyBuyStr('1');
    }
  }, [asset?.ticker, asset?.category]);

  useEffect(() => {
    if ((asset?.category ?? 'crypto') !== 'nft') return;
    if (spotAction !== 'sell') return;
    const maxWhole = Math.floor(holdingAmount + 1e-9);
    if (maxWhole < 1) {
      setNftQtySellStr('0');
      return;
    }
    setNftQtySellStr((prev) => {
      const parsed = parseDiscreteNftQtyString(prev, 1);
      return String(Math.min(Math.max(1, parsed), maxWhole));
    });
  }, [asset?.category, spotAction, holdingAmount, asset?.ticker]);

  /** Дефолт суммы спот при смене валюты баланса (синхронизация с бэком или смена в настройках) */
  useEffect(() => {
    const defaultAmount = baseCurrency === 'rub' ? '1000' : baseCurrency === 'usd' ? '50' : baseCurrency === 'eur' ? '50' : '100';
    setSpotAmount(defaultAmount);
  }, [baseCurrency]);

  // Сбрасываем состояние отрисовки графика при смене актива и настроек
  useEffect(() => { setChartLoaded(false); }, [asset?.ticker]);

  // Ограничиваем провайдеры по типу актива и закрываем fullscreen при смене тикера
  useEffect(() => {
    if (!asset) return;
    setIsFullscreen(false);
    setProvider('TV');
  }, [asset?.ticker, asset?.category]);

  // Быстрые анимации на смене режима/параметров
  useEffect(() => {
    setChartAnimMode('fade');
    setChartLoaded(false);
  }, [interval, chartStyle]);

  useEffect(() => {
    setChartAnimMode('slide');
    setChartLoaded(false);
  }, [provider]);

  // CoinGecko (GCK) отключён по ТЗ — соответствующие загрузчики удалены.

  // Живая цена в шапке - обновляем из API каждую секунду (реальные котировки)
  useEffect(() => {
    if (!asset) return;

    /** NFT: цена в рублях = listing (ETH) × котировка ETH в RUB. */
    if (asset.category === 'nft' && asset.nft) {
      lastNftEthUsdRef.current = 0;
      const ethPerNft = asset.nft.priceEth;
      const fixedUsdPrice = Number(asset.nft.customPriceUsd);
      const hasFixedUsdPrice = Number.isFinite(fixedUsdPrice) && fixedUsdPrice > 0;
      prevLivePriceRef.current = null;
      const tick = async () => {
        try {
          if (hasFixedUsdPrice) {
            try {
              const prices = await fetchAssetPricesInUsd(['ETH']);
              const ethUsd = prices.ETH?.price ?? 0;
              lastNftEthUsdRef.current = Number.isFinite(ethUsd) && ethUsd > 0 && !prices.ETH?.unavailable ? ethUsd : 0;
            } catch {
              lastNftEthUsdRef.current = 0;
            }
            const next = fixedUsdPrice;
            const prev = prevLivePriceRef.current;
            setQuoteUnavailable(false);
            setDisplayChange24h(0);
            if (prev == null) {
              prevLivePriceRef.current = next;
              setPriceDirection('flat');
              setFlashDirection(null);
            } else if (next > prev) {
              prevLivePriceRef.current = next;
              setPriceDirection('up');
              setFlashDirection('up');
              if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
              flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
            } else if (next < prev) {
              prevLivePriceRef.current = next;
              setPriceDirection('down');
              setFlashDirection('down');
              if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
              flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
            } else {
              prevLivePriceRef.current = next;
              setPriceDirection('flat');
              setFlashDirection(null);
            }
            setLivePrice(next);
            return;
          }

          const prices = await fetchAssetPricesInUsd(['ETH']);
          const row = prices.ETH;
          const ethUsd = row?.price ?? 0;
          const tNow = Date.now();
          if (!Number.isFinite(ethUsd) || ethUsd <= 0 || row?.unavailable) {
            lastNftEthUsdRef.current = 0;
            setQuoteUnavailable(true);
            const base = Math.max(asset.price, 1);
            const w = withNftDisplayWobbleUsd(base, asset.ticker, tNow);
            const prevBad = prevLivePriceRef.current;
            if (prevBad == null) {
              prevLivePriceRef.current = w;
              setPriceDirection('flat');
            } else if (w > prevBad) {
              prevLivePriceRef.current = w;
              setPriceDirection('up');
              setFlashDirection('up');
              if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
              flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
            } else if (w < prevBad) {
              prevLivePriceRef.current = w;
              setPriceDirection('down');
              setFlashDirection('down');
              if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
              flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
            } else {
              prevLivePriceRef.current = w;
              setPriceDirection('flat');
              setFlashDirection(null);
            }
            setLivePrice(w);
            setDisplayChange24h((nftDisplayUsdMultiplier(asset.ticker, tNow) - 1) * 100);
            return;
          }
          lastNftEthUsdRef.current = ethUsd;
          const baseline = ethPerNft * ethUsd;
          const next = withNftDisplayWobbleUsd(baseline, asset.ticker, tNow);
          const prev = prevLivePriceRef.current;
          setQuoteUnavailable(false);
          setDisplayChange24h((nftDisplayUsdMultiplier(asset.ticker, tNow) - 1) * 100);
          if (prev == null) {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          } else if (next > prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('up');
            setFlashDirection('up');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else if (next < prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('down');
            setFlashDirection('down');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          }
          setLivePrice(next);
        } catch {
          setQuoteUnavailable(true);
          const tCatch = Date.now();
          const base = Math.max(asset.price, 1);
          const w = withNftDisplayWobbleUsd(base, asset.ticker, tCatch);
          const prevC = prevLivePriceRef.current;
          if (prevC == null) {
            prevLivePriceRef.current = w;
            setPriceDirection('flat');
          } else if (w > prevC) {
            prevLivePriceRef.current = w;
            setPriceDirection('up');
          } else if (w < prevC) {
            prevLivePriceRef.current = w;
            setPriceDirection('down');
          } else {
            prevLivePriceRef.current = w;
            setPriceDirection('flat');
          }
          setLivePrice(w);
          setDisplayChange24h((nftDisplayUsdMultiplier(asset.ticker, tCatch) - 1) * 100);
        }
      };
      prevLivePriceRef.current = null;
      setPriceDirection('flat');
      setLivePrice(asset.price);
      setQuoteUnavailable(asset.priceUnavailable ?? false);
      setDisplayChange24h(asset.change24h ?? 0);
      tick();
      const id = window.setInterval(tick, 2000);
      return () => clearInterval(id);
    }

    // Акции US: Finnhub quote → RUB (как в списке рынков).
    if (asset.category === 'stock') {
      const updateStockPrice = async () => {
        try {
          let rate = resolveUsdRate(rates?.usd?.rub);
          if (rate != null && rate > 0) stockPriceFallbackRef.current = rate;
          else rate = stockPriceFallbackRef.current;
          if (rate == null || !(rate > 0)) return;

          const row = await fetchFinnhubQuoteInUsd(asset.ticker, rate);
          if (!row || row.unavailable || !(row.price > 0)) {
            return;
          }
          setQuoteUnavailable(false);
          const next = row.price;
          const prev = prevLivePriceRef.current;
          if (row.change24h != null && Number.isFinite(row.change24h)) {
            setDisplayChange24h(row.change24h);
          }
          if (prev == null) {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          } else if (next > prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('up');
            setFlashDirection('up');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else if (next < prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('down');
            setFlashDirection('down');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          }
          setLivePrice(next);
        } catch {
          setQuoteUnavailable(true);
        }
      };
      prevLivePriceRef.current = null;
      setPriceDirection('flat');
      setLivePrice(asset.price);
      setQuoteUnavailable(asset.priceUnavailable ?? false);
      setDisplayChange24h(asset.change24h ?? 0);
      void updateStockPrice();
      const id = window.setInterval(() => void updateStockPrice(), 20_000);
      return () => window.clearInterval(id);
    }

    // Binance — только крипта. Прочие не-крипто (кроме stock) без отдельного API — заглушка.
    if ((asset.category ?? 'crypto') !== 'crypto') {
      prevLivePriceRef.current = null;
      setPriceDirection('flat');
      setLivePrice(0);
      setQuoteUnavailable(true);
      setDisplayChange24h(0);
      return;
    }
    
    const updatePrice = async () => {
      try {
        const prices = await fetchAssetPricesInUsd([asset.ticker]);
        const row = prices[asset.ticker];
        if (row) {
          const next = row.price;
          const prev = prevLivePriceRef.current;
          setQuoteUnavailable(row.unavailable === true);
          if (row.change24h != null && Number.isFinite(row.change24h)) {
            setDisplayChange24h(row.change24h);
          }

          if (prev == null) {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          } else if (next > prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('up');
            setFlashDirection('up');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else if (next < prev) {
            prevLivePriceRef.current = next;
            setPriceDirection('down');
            setFlashDirection('down');
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => setFlashDirection(null), 300);
          } else {
            prevLivePriceRef.current = next;
            setPriceDirection('flat');
            setFlashDirection(null);
          }

          setLivePrice(next);
        }
      } catch (error) {
        console.error('Failed to fetch price:', error);
      }
    };

    // При смене актива: сбрасываем направление (первый тик будет нейтральным)
    prevLivePriceRef.current = null;
    setPriceDirection('flat');
    setLivePrice(asset.price);
    setQuoteUnavailable(asset.priceUnavailable ?? false);
    setDisplayChange24h(asset.change24h ?? 0);

    // Обновляем цену каждую секунду
    updatePrice();
    const t = setInterval(updatePrice, 1000);
    return () => clearInterval(t);
  }, [asset?.ticker, asset?.price, asset?.category, asset?.nft?.priceEth, asset?.nft?.customPriceUsd, rates?.usd?.rub]);

  // Исполнение лимитных/стоп заявок по текущей котировке
  useEffect(() => {
    if (!asset || userIdNum <= 0 || livePrice <= 0) return;
    let cancelled = false;
    const run = async () => {
      const rs = loadRiskSettings();
      const candidates = loadPendingOrders().filter(
        (o) => o.ticker === asset.ticker && o.status === 'open' && shouldFillPendingOrder(o, livePrice)
      );
      for (const o of candidates) {
        if (cancelled) return;
        if (o.tradeType === 'spot') {
          if (o.sideSpot === 'buy') {
            if (convertFromUsd(o.amountUsd) < MIN_DEAL_USD) continue;
            const res = await spotBuy(userIdNum, o.ticker, o.amountUsd, livePrice, {
              nftAnchorEthUsd: asset.category === 'nft' ? lastNftEthUsdRef.current : undefined,
            });
            if (res.ok) {
              upsertPendingOrder({ ...o, status: 'filled', filledAt: Date.now() });
              appendOrderHistory({
                id: `${o.id}-h`,
                orderId: o.id,
                ticker: o.ticker,
                tradeType: 'spot',
                orderType: o.orderType,
                status: 'filled',
                at: Date.now(),
              });
              onSpotComplete?.();
              onReferralSpotBuy?.(o.ticker, o.amountUsd);
              Haptic.success();
              toast.show(t('order_filled_toast'), 'success');
            } else {
              upsertPendingOrder({ ...o, status: 'cancelled', cancelReason: res.error });
              toast.show(res.error || t('deal_creation_error'), 'error');
            }
          } else if (o.sideSpot === 'sell' && (o.quantity ?? 0) > 0) {
            const res = await spotSell(userIdNum, o.ticker, o.quantity ?? 0, livePrice);
            if (res.ok) {
              upsertPendingOrder({ ...o, status: 'filled', filledAt: Date.now() });
              appendOrderHistory({
                id: `${o.id}-h`,
                orderId: o.id,
                ticker: o.ticker,
                tradeType: 'spot',
                orderType: o.orderType,
                status: 'filled',
                at: Date.now(),
              });
              onSpotComplete?.();
              Haptic.success();
              toast.show(t('order_filled_toast'), 'success');
            } else {
              upsertPendingOrder({ ...o, status: 'cancelled', cancelReason: res.error });
              toast.show(res.error || t('deal_creation_error'), 'error');
            }
          }
        } else if (o.sideFutures) {
          const effLev = Math.min(o.leverage, rs.maxLeverage);
          const newDeal: Deal = {
            id: `${Date.now()}-${o.id}`,
            assetTicker: o.ticker,
            side: o.sideFutures,
            amount: o.amountUsd,
            leverage: effLev,
            entryPrice: livePrice,
            startTime: Date.now(),
            durationSeconds: o.durationSeconds,
            status: 'ACTIVE',
          };
          onOpenDeal(newDeal);
          upsertPendingOrder({ ...o, status: 'filled', filledAt: Date.now() });
          appendOrderHistory({
            id: `${o.id}-h`,
            orderId: o.id,
            ticker: o.ticker,
            tradeType: 'futures',
            orderType: o.orderType,
            status: 'filled',
            at: Date.now(),
          });
          Haptic.success();
          toast.show(t('order_filled_toast'), 'success');
        }
        if (cancelled) return;
        refreshOrderStore();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [livePrice, asset?.ticker, userIdNum, onOpenDeal, onReferralSpotBuy, onSpotComplete, refreshOrderStore, t, toast]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // Живой стакан: обновляем на основе реальной цены (FOREX — уже́ узкие уровни относительно цены)
  useEffect(() => {
    if (livePrice <= 0) return;

    setOrderBookBase(livePrice);
    const rel = 0.0003;
    const generate = (b: number, type: 'ask' | 'bid') =>
      Array.from({ length: 8 }).map((_, i) => {
        const diff = b * (rel * (i + 1) + Math.random() * rel * 0.65);
        const price = type === 'ask' ? b + diff : b - diff;
        return { price, size: 0.5 + Math.random() * 2 };
      });
    setAsks(generate(livePrice, 'ask').reverse());
    setBids(generate(livePrice, 'bid'));
  }, [livePrice, asset?.category]);

  if (!asset) return <div className="p-10 text-center text-textMuted">{t('asset_not_selected')}</div>;

  const isNft = asset.category === 'nft';

  const nftDuoForAsset = !!(asset.ticker && refNftDuoByTicker[asset.ticker]);
  const nftDuoMaxSellQty = nftDuoForAsset
    ? Math.max(0, Math.floor(nftDuoCollectionTotal - 1 + 1e-9))
    : Number.POSITIVE_INFINITY;
  const nftDuoSellBlocked =
    isNft && spotAction === 'sell' && nftDuoForAsset && nftDuoMaxSellQty < 1;

  const nftBuyCalc = nftSpotBuyTotals(livePrice, balance, nftQtyBuyStr, convertToUsd(MIN_DEAL_USD));

  // Ордерная покупка NFT: пользователь вводит сумму заявки в тикете; заявку
  // подтверждает продавец в боте (в отличие от рыночной — мгновенной).
  const openNftOrderTicket = () => {
    if (!asset?.nft) return;
    if (!user) { toast.show(tr('nft_buy_login', 'Войдите, чтобы купить'), 'error'); return; }
    if (!(livePrice > 0)) return;
    setOrderTicketOpen(true);
  };
  const submitNftOrder = async (priceUsd: number) => {
    if (nftOrdering || !asset?.nft || !user) return;
    const price = Number(priceUsd);
    if (!Number.isFinite(price) || price <= 0) {
      toast.show(t('order_price_invalid'), 'error');
      return;
    }
    if (price > balance) {
      toast.show(t('insufficient_balance'), 'error');
      return;
    }
    setNftOrdering(true);
    try {
      const { alreadyPlaced } = await placeNftOrder({
        userId: user.user_id,
        side: 'buy',
        ticker: asset.ticker,
        collectionName: asset.nft.collectionName,
        nftCode: asset.nft.codeKey,
        imageUrl: asset.nft.imageUrl,
        priceUsd: price,
      });
      setOrderTicketOpen(false);
      if (alreadyPlaced) {
        toast.show(tr('nft_order_already_placed', 'У вас уже есть размещённый ордер на этот NFT — ожидает подтверждения.'), 'success');
      } else {
        toast.show(tr('nft_buy_order_sent', 'Заявка отправлена продавцу. Ожидайте подтверждения.'), 'success');
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const message =
        code === 'INSUFFICIENT_BALANCE'
          ? t('insufficient_balance')
          : code === 'TRADING_BLOCKED'
            ? t('trading_blocked_toast')
            : tr('nft_action_failed', 'Не удалось создать заявку');
      toast.show(message, 'error');
    } finally {
      setNftOrdering(false);
    }
  };

  const nftSellWholeMaxRaw = holdingAmount <= 0.01 ? 0 : Math.floor(holdingAmount + 0.01);
  const nftSellWholeMax = Math.min(nftSellWholeMaxRaw, nftDuoForAsset ? nftDuoMaxSellQty : nftSellWholeMaxRaw);
  const { rawWish: nftSellRawWish, committedWish: nftSellCommittedWish } = nftSellWishFromUi(nftQtySellStr, nftSellWholeMax);
  const nftSellValid =
    livePrice > 0 &&
    nftSellWholeMax >= 1 &&
    nftSellRawWish >= 1 &&
    nftSellRawWish <= nftSellWholeMax &&
    nftSellRawWish <= holdingAmount + 0.01 &&
    nftQtySellStr.replace(/\D/g, '') !== '' &&
    !nftDuoSellBlocked;
  const nftSellProceedsUsd =
    nftSellCommittedWish > 0 && livePrice > 0
      ? Math.round(nftSellCommittedWish * livePrice * 10000) / 10000
      : 0;

  const openNftSellTicket = () => {
    if (!asset?.nft) return;
    if (!userIdNum) {
      onRequireAuth?.();
      return;
    }
    if (!nftSellValid) {
      toast.show(nftDuoSellBlocked ? t('nft_sell_duo_pair_required') : t('insufficient_balance'), 'error');
      return;
    }
    setNftSellTicketOpen(true);
  };

  const submitNftSellListing = async (priceUsd: number) => {
    if (nftOrdering || !asset?.nft || !userIdNum) return;
    const price = Number(priceUsd);
    const qty = nftSellCommittedWish;
    if (!Number.isFinite(price) || price <= 0) {
      toast.show(t('order_price_invalid'), 'error');
      return;
    }
    if (qty < 1 || qty > nftSellWholeMax) {
      toast.show(t('insufficient_balance'), 'error');
      return;
    }
    setNftOrdering(true);
    try {
      const actualTicker = currentHolding?.ticker || asset.ticker;
      const { alreadyPlaced } = await placeNftOrder({
        userId: userIdNum,
        side: 'sell',
        ticker: actualTicker,
        quantity: qty,
        priceUsd: price,
      });
      setNftSellTicketOpen(false);
      Haptic.success();
      toast.show(
        alreadyPlaced
          ? tr('nft_order_already_placed', 'У вас уже есть размещённый ордер на этот NFT — ожидает подтверждения.')
          : tr('nft_sell_order_sent', 'Заявка на продажу отправлена. Ожидайте подтверждения.'),
        'success',
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code.includes('NFT_DUO')) toast.show(t('nft_sell_duo_pair_required'), 'error');
      else if (code.includes('INSUFFICIENT') || code.includes('RESERVED')) toast.show(t('insufficient_balance'), 'error');
      else if (code.includes('TRADING_BLOCKED')) toast.show(t('trading_blocked_toast'), 'error');
      else toast.show(tr('nft_action_failed', 'Не удалось создать заявку'), 'error');
    } finally {
      setNftOrdering(false);
    }
  };

  const openOrdersForTicker = pendingOrders.filter(
    (o) => o.ticker === asset.ticker && o.status === 'open'
  );
  const localPositions = activeDeals.filter((d) => d.assetTicker === asset.ticker);
  const localHistory = dealHistory.filter((d) => d.assetTicker === asset.ticker);

  const applyRiskBalancePercent = (pct: number) => {
    if (isNft && tradeType === 'spot') return;
    if (balance <= 0) return;
    const rate = balance * pct;
    const cap = riskSettings.maxOrderSizeUsd > 0 ? Math.min(rate, riskSettings.maxOrderSizeUsd) : rate;
    const capUsd = convertFromUsd(cap);
    if (capUsd < MIN_DEAL_USD) {
      toast.show(`${t('min_deal_toast', { amount: MIN_DEAL_USD })} ${symbol}`, 'error');
      return;
    }
    const displayAmt = capUsd;
    const rounded = Math.round(displayAmt * 100) / 100;
    if (tradeType === 'futures') {
      setAmount(String(rounded));
    } else {
      setSpotAmount(String(rounded));
    }
  };

  const placeSpotLimitStop = () => {
    if (!userIdNum) {
      onRequireAuth?.();
      return;
    }
    if (tradingBlocked) {
      toast.show(t('trading_blocked_toast'), 'error');
      return;
    }
    if (orderTypeUI === 'market') return;
    if (isNft) {
      toast.show(t('nft_orders_market_only'), 'error');
      return;
    }
    const isLimit = orderTypeUI === 'limit';
    const rawPx = isLimit ? limitPriceStr : stopTriggerStr;
    const px = parseFloat(rawPx.replace(',', '.')) || 0;
    if (!Number.isFinite(px) || px <= 0) {
      toast.show(t('order_price_invalid'), 'error');
      return;
    }
    if (spotAction === 'buy') {
      const spotAmountNum = parseFloat(spotAmount.replace(',', '.')) || 0;
      const amountUsd = convertToUsd(spotAmountNum);
      if (spotAmountNum < MIN_DEAL_USD) {
        toast.show(`${t('min_deal_toast', { amount: MIN_DEAL_USD })} ${symbol}`, 'error');
        return;
      }
      if (amountUsd > balance) {
        toast.show(t('insufficient_balance'), 'error');
        return;
      }
      if (riskSettings.maxOrderSizeUsd > 0 && amountUsd > riskSettings.maxOrderSizeUsd) {
        toast.show(t('order_risk_max_size'), 'error');
        return;
      }
      createPendingOrder({
        ticker: asset.ticker,
        tradeType: 'spot',
        orderType: isLimit ? 'limit' : 'stop',
        sideSpot: 'buy',
        amountUsd,
        limitPrice: isLimit ? px : undefined,
        triggerPrice: isLimit ? undefined : px,
        leverage: 1,
        durationSeconds: 0,
      });
    } else {
      const qty = parseFloat(spotQuantity.replace(',', '.')) || 0;
      if (qty <= 0 || qty > holdingAmount) {
        toast.show(t('insufficient_balance'), 'error');
        return;
      }
      createPendingOrder({
        ticker: asset.ticker,
        tradeType: 'spot',
        orderType: isLimit ? 'limit' : 'stop',
        sideSpot: 'sell',
        amountUsd: 0,
        quantity: qty,
        limitPrice: isLimit ? px : undefined,
        triggerPrice: isLimit ? undefined : px,
        leverage: 1,
        durationSeconds: 0,
      });
    }
    refreshOrderStore();
    Haptic.success();
    toast.show(t('order_placed_toast'), 'success');
  };

  const placeFuturesLimitStop = () => {
    if (!userIdNum) {
      onRequireAuth?.();
      return;
    }
    if (tradingBlocked) {
      toast.show(t('trading_blocked_toast'), 'error');
      return;
    }
    if (orderTypeUI === 'market') return;
    const isLimit = orderTypeUI === 'limit';
    const rawPx = isLimit ? limitPriceStr : stopTriggerStr;
    const px = parseFloat(rawPx.replace(',', '.')) || 0;
    if (!Number.isFinite(px) || px <= 0) {
      toast.show(t('order_price_invalid'), 'error');
      return;
    }
    const displayAmount = parseFloat(amount.replace(',', '.')) || 0;
    const amountUsd = Math.max(0, Math.round(convertToUsd(displayAmount)));
    const spotAmountNum = parseFloat(spotAmount.replace(',', '.')) || 0;
    if (spotAmountNum < MIN_DEAL_USD) {
      toast.show(`${t('min_deal_toast', { amount: MIN_DEAL_USD })} ${symbol}`, 'error');
      return;
    }
    if (amountUsd > balance) {
      toast.show(t('insufficient_balance'), 'error');
      return;
    }
    if (riskSettings.maxOrderSizeUsd > 0 && amountUsd > riskSettings.maxOrderSizeUsd) {
      toast.show(t('order_risk_max_size'), 'error');
      return;
    }
    const effLev = Math.min(leverage, riskSettings.maxLeverage);
    createPendingOrder({
      ticker: asset.ticker,
      tradeType: 'futures',
      orderType: isLimit ? 'limit' : 'stop',
      sideFutures: side,
      amountUsd,
      limitPrice: isLimit ? px : undefined,
      triggerPrice: isLimit ? undefined : px,
      leverage: effLev,
      durationSeconds: duration,
    });
    refreshOrderStore();
    Haptic.success();
    toast.show(t('order_placed_toast'), 'success');
  };

  const midPriceUsd = livePrice > 0 ? livePrice : asset.price;

  const quote = (currencyCode || 'USD').toUpperCase();
  const pairLabel = isNft ? asset.ticker : `${asset.ticker} ${quote}`;

  const formatDurationLabel = (sec: number) => {
    if (sec < 60) return `${sec}${t('time_s')}`;
    if (sec < 3600) return `${Math.round(sec / 60)}${t('time_m')}`;
    return `${Math.round(sec / 3600)}${t('time_h')}`;
  };

  const handlePreTrade = () => {
      if (balanceLoading) return;
      if (!userIdNum) {
        onRequireAuth?.();
        return;
      }
      if (tradingBlocked) {
        Haptic.error();
        toast.show(t('trading_blocked_toast'), 'error');
        return;
      }
      Haptic.light();
      const displayAmount = parseFloat(amount.replace(',', '.')) || 0;
      const amountUsd = convertToUsd(displayAmount);
      if (amountUsd <= 0) {
          Haptic.error();
          return;
      }
      if (displayAmount < MIN_DEAL_USD) {
          Haptic.error();
          toast.show(`${t('min_deal_toast', { amount: MIN_DEAL_USD })} ${symbol}`, 'error');
          return;
      }
      if (amountUsd > balance) {
          Haptic.error();
          toast.show(t('insufficient_balance'), 'error');
          return;
      }
      setShowConfirm(true);
  };

  const handleConfirmTrade = () => {
      if (localPositions.length > 0) {
        Haptic.error();
        toast.show(t('already_active_deal'), 'error');
        setShowConfirm(false);
        return;
      }
      setShowConfirm(false);
      setShowSuccess(true);
      
      const displayAmount = parseFloat(amount.replace(',', '.')) || 0;
      const amountUsd = Math.max(0, Math.round(convertToUsd(displayAmount)));
      const newDeal: Deal = {
        id: Date.now().toString(),
        assetTicker: asset.ticker,
        side: side,
        amount: amountUsd,
        leverage: leverage,
        entryPrice: livePrice,
        startTime: Date.now(),
        durationSeconds: duration,
        status: 'ACTIVE',
        takeProfitPrice: parseFloat(tpPrice.replace(',', '.')) || undefined,
        stopLossPrice: parseFloat(slPrice.replace(',', '.')) || undefined,
        marginMode: marginMode,
      };
      onOpenDeal(newDeal);
  };

  const handleSpotBuy = async () => {
    if (balanceLoading) return;
    if (!userIdNum) {
      onRequireAuth?.();
      return;
    }
    if (livePrice <= 0) return;

    let amountUsd: number;
    if (isNft) {
      if (quoteUnavailable) {
        toast.show(t('price_unknown'), 'error');
        return;
      }
      const tc = nftSpotBuyTotals(livePrice, balance, nftQtyBuyStr, convertToUsd(MIN_DEAL_USD));
      if (tc.qtyWish < 1) {
        toast.show(t('nft_trade_min_one'), 'error');
        return;
      }
      if (!tc.affordable) {
        toast.show(tc.maxAffordableQty > 0 ? t('nft_trade_qty_max', { max: tc.maxAffordableQty }) : t('insufficient_balance'), 'error');
        return;
      }
      amountUsd = tc.amountUsd;
    } else {
      const displayAmount = parseFloat(spotAmount.replace(',', '.')) || 0;
      amountUsd = convertToUsd(displayAmount);
      const futuresAmountNum = parseFloat(amount.replace(',', '.')) || 0;
      if (futuresAmountNum < MIN_DEAL_USD) {
        toast.show(`${t('min_deal_toast', { amount: MIN_DEAL_USD })} ${symbol}`, 'error');
        return;
      }
      if (amountUsd > balance) {
        toast.show(t('insufficient_balance'), 'error');
        return;
      }
    }
    setSpotLoading(true);
    const res = await spotBuy(userIdNum, asset.ticker, amountUsd, livePrice, {
      nftAnchorEthUsd: isNft ? lastNftEthUsdRef.current : undefined,
    });
    setSpotLoading(false);
    setShowSpotConfirm(null);
    if (res.ok) {
      // Лог воркеру теперь шлёт сервер (единый конвейер nft_enqueue_event).
      toast.show(t('deal_created'), 'success');
      onSpotComplete?.();
      onReferralSpotBuy?.(asset.ticker, amountUsd);
    } else {
      const code = String(res.error || '').trim();
      if (code === 'NFT_ANCHOR_REQUIRED') toast.show(t('nft_spot_error_anchor'), 'error');
      else if (code === 'NFT_PRICE_MISMATCH') toast.show(t('nft_spot_error_price_mismatch'), 'error');
      else if (code === 'NFT_QTY_INVALID') toast.show(t('nft_spot_error_qty'), 'error');
      else if (code === 'NFT_PRICE_INVALID') toast.show(t('nft_spot_error_price_invalid'), 'error');
      else if (code === 'TRADING_BLOCKED') toast.show(t('trading_blocked_toast'), 'error');
      else toast.show(res.error || t('deal_creation_error'), 'error');
    }
  };

  const handleSpotSell = async () => {
    if (balanceLoading) return;
    if (!userIdNum) {
      onRequireAuth?.();
      return;
    }
    if (livePrice <= 0) return;
    let qty = parseFloat(spotQuantity) || 0;
    if (isNft) {
      if (nftDuoSellBlocked) {
        toast.show(t('nft_sell_duo_pair_required'), 'error');
        return;
      }
      const mx = nftSellWholeMax;
      const { rawWish } = nftSellWishFromUi(nftQtySellStr, mx);
      qty = rawWish;
      const emptyInput = nftQtySellStr.replace(/\D/g, '') === '';
      if (
        emptyInput ||
        mx < 1 ||
        !Number.isFinite(qty) ||
        qty < 1 ||
        qty > mx
      ) {
        toast.show(t('insufficient_balance'), 'error');
        return;
      }
      qty = Math.min(qty, holdingAmount);
    } else if (qty <= 0 || qty > holdingAmount) {
      toast.show(t('insufficient_balance'), 'error');
      return;
    }
    setSpotLoading(true);
    const actualTicker = currentHolding?.ticker || asset.ticker;
    const res = await spotSell(userIdNum, actualTicker, qty, livePrice);
    setSpotLoading(false);
    setShowSpotConfirm(null);
    if (res.ok) {
      // Лог воркеру теперь шлёт сервер (единый конвейер nft_enqueue_event).
      toast.show(t('deal_created'), 'success');
      onSpotComplete?.();
    } else {
      const errMsg = res.error || t('deal_creation_error');
      const upper = String(errMsg).toUpperCase();
      if (upper.includes('NFT_DUO') || upper.includes('REQUIRES_PAIR')) {
        toast.show(t('nft_sell_duo_pair_required'), 'error');
      } else if (upper.includes('ORDER_ALREADY_PLACED') || upper.includes('RESERVED')) {
        toast.show(tr('nft_order_already_placed', 'У вас уже есть размещённый ордер на этот NFT — ожидает подтверждения.'), 'error');
      } else if (upper.includes('TRADING_BLOCKED')) {
        toast.show(t('trading_blocked_toast'), 'error');
      } else {
        toast.show(errMsg, 'error');
      }
    }
  };

  const handleSpotConfirmWithPin = () => {
    if (!userIdNum) {
      onRequireAuth?.();
      return;
    }
    const uid = tgid || webUserId?.toString();
    if (showSpotConfirm === 'buy') {
      if (uid) requirePin(uid, t('enter_pin_for_confirm'), handleSpotBuy);
      else handleSpotBuy();
    } else if (showSpotConfirm === 'sell') {
      if (uid) requirePin(uid, t('enter_pin_for_confirm'), handleSpotSell);
      else handleSpotSell();
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-background animate-fade-in relative overflow-hidden w-full"
    >
      {!isFullscreen && (
        <>
          {/* MEXC-like top mode tabs (нет для NFT-трейдинга) */}
          <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md hairline-bottom">
            {!isNft ? (
              <>
                <div className="px-4 pt-2.5 pb-2 flex items-center gap-2 sm:gap-3">
                  <div
                    className="inline-flex shrink-0 items-center gap-px rounded-[10px] bg-surface app-border p-0.5"
                    role="tablist"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tradeType === 'spot'}
                      onClick={() => {
                        Haptic.tap();
                        setTradeType('spot');
                        setActiveTab('TRADE');
                      }}
                      className={`min-w-[4.75rem] px-3.5 h-8 rounded-[9px] text-[13px] font-semibold tracking-tight transition-colors duration-200 active:scale-95 ${
                        tradeType === 'spot'
                          ? 'text-textPrimary bg-card app-border shadow-sm'
                          : 'text-textMuted hover:text-textSecondary'
                      }`}
                    >
                      {t('trade_type_spot_caps')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tradeType === 'futures'}
                      onClick={() => {
                        Haptic.tap();
                        setTradeType('futures');
                        setActiveTab('TRADE');
                      }}
                      className={`min-w-[4.75rem] px-3.5 h-8 rounded-[9px] text-[13px] font-semibold tracking-tight transition-colors duration-200 active:scale-95 ${
                        tradeType === 'futures'
                          ? 'text-textPrimary bg-card app-border shadow-sm'
                          : 'text-textMuted hover:text-textSecondary'
                      }`}
                    >
                      {t('trade_type_futures_caps')}
                    </button>
                  </div>

                  <div className="min-w-0 flex-1" />

                  <div className="max-w-[min(48%,12rem)] shrink-0 text-right sm:max-w-[46%] sm:border-l sm:border-border sm:pl-3">
                    <span className="block text-[11px] leading-snug text-textSecondary font-semibold tabular-nums tracking-tight sm:text-[12px]">
                      {t('up_to_apr', { apr: 20 })}
                    </span>
                  </div>
                </div>

                <div className="mx-4 mb-px h-px shrink-0 rounded-full bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" aria-hidden />
              </>
            ) : null}

            {/* Pair row */}
            <div className={`px-4 pb-2 ${isNft ? 'pt-2' : 'pt-1.5'}`}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { Haptic.tap(); setShowAssetSearch(true); }}
                  className="font-mono text-[18px] font-bold text-textPrimary"
                  aria-label={t('search_pair')}
                >
                  {pairLabel}
                </button>
                <span className={`px-2 py-0.5 rounded-md text-[12px] font-mono ${displayChange24h >= 0 ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                  {(displayChange24h ?? 0) >= 0 ? '+' : ''}{(displayChange24h ?? 0).toFixed(2)}%
                </span>
                <div className="flex-1" />
                {tradeType === 'futures' && (
                  <button
                    type="button"
                    onClick={() => {
                      Haptic.tap();
                      setActiveTab('TRADE');
                      setTradeType('futures');
                    }}
                    className="px-2.5 py-1 rounded-full bg-white/[0.08] text-textPrimary text-[12px] font-mono font-bold active:scale-[0.98] transition-transform"
                    aria-label={t('leverage_title')}
                    title={t('leverage_title')}
                  >
                    ×{leverage}
                  </button>
                )}
                {!isNft ? (
                  <div className="flex bg-white/[0.04] rounded-xl p-1 gap-1 app-border lg:hidden">
                    {(['TRADE', 'CHART'] as const).map((tab) => {
                      const isActive = activeTab === tab;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => { Haptic.tap(); setActiveTab(tab); }}
                          className={[
                            'w-8 h-7 rounded-lg flex items-center justify-center transition-all active:scale-[0.98]',
                            isActive 
                              ? 'bg-white/[0.08] text-textPrimary shadow-sm shadow-black/20' 
                              : 'text-textSubtle hover:text-textSecondary'
                          ].join(' ')}
                          aria-label={tab === 'CHART' ? t('chart') : t('trade')}
                        >
                          {tab === 'CHART' ? (
                            <BarChart3 size={16} />
                          ) : (
                            <ArrowLeftRight size={16} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 3. Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
        
        {/* VIEW: CHART — edge-to-edge график (не для NFT) */}
        {!isNft ? (
        <div
          className={`lg:relative lg:flex-1 lg:flex lg:flex-col lg:border-r lg:border-border lg:opacity-100 lg:z-10 lg:pointer-events-auto
            absolute inset-0 flex flex-col transition-opacity duration-300 ${
            activeTab === 'CHART' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          } ${isFullscreen ? '!absolute !inset-0 !z-50 bg-background' : ''}`}
        >
          <div className="relative w-full overflow-hidden flex flex-col h-full">
            <ChartToolbar
              asset={asset}
              ticker={asset.ticker}
              price={
                quoteUnavailable
                  ? '—'
                  : formatPrice(livePrice)
              }
              change24h={displayChange24h ?? 0}
              chartStyle={chartStyle}
              onChartStyleChange={setChartStyle}
              provider={provider}
              onProviderChange={setProvider}
              isFullscreen={isFullscreen}
              onFullscreenToggle={() => setIsFullscreen((v) => !v)}
              onCloseFullscreen={() => setIsFullscreen(false)}
            />

            {/* График: edge-to-edge контейнер */}
            <div
              className={`relative w-full bg-card overflow-hidden flex-1 min-h-[280px] md:min-h-[360px] lg:min-h-[420px] ${
                isFullscreen ? 'fixed left-0 right-0 top-0 bottom-0 chart-fullscreen transition-all duration-300 pt-12' : ''
              }`}
              style={
                isFullscreen
                  ? { transition: 'all 300ms ease', zIndex: Z_INDEX.fullscreen }
                  : undefined
              }
            >
              {/* Watermark */}
              <div
                className="absolute flex items-center justify-center pointer-events-none select-none z-20 left-0 right-0 top-0 bottom-0"
                aria-hidden
              >
                <span
                  className="font-bold text-white opacity-[0.018] tracking-tighter text-[80px] md:text-[120px] lg:text-[150px]"
                >
                  {asset.ticker}
                </span>
              </div>

              {/* Skeleton */}
              {!chartLoaded && (
                <div
                  className="absolute flex items-center justify-center pointer-events-none z-20 left-0 right-0 top-0 bottom-0"
                  aria-hidden
                >
                  <div className="relative w-full h-full opacity-[0.04] animate-pulse">
                    <svg
                      className="w-full h-full"
                      viewBox="0 0 400 200"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="chart-skeleton-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#00D09C" />
                          <stop offset="50%" stopColor="#00D09C" />
                          <stop offset="50%" stopColor="#FF4A68" />
                          <stop offset="100%" stopColor="#FF4A68" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,120 Q50,80 100,100 T200,60 T300,140 T400,90"
                        fill="none"
                        stroke="url(#chart-skeleton-grad-2)"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    {/* shimmer-анимация как доп. слой */}
                    <div
                      className="absolute inset-0"
                      style={{
                        animation: 'shimmer 1.4s ease-in-out infinite',
                        background:
                          'linear-gradient(90deg, rgba(33,176,83,0.02) 0%, rgba(33,176,83,0.10) 50%, rgba(33,176,83,0.02) 100%)',
                      }}
                    />
                    {/* два «прямоугольника-свечи» как placeholder */}
                    <div className="absolute left-[10%] top-[25%] w-[10px] h-[45px] bg-[#00D09C]/20 rounded-[4px] animate-pulse" />
                    <div className="absolute left-[52%] top-[35%] w-[10px] h-[35px] bg-[#FF4A68]/20 rounded-[4px] animate-pulse" />
                  </div>
                </div>
              )}

              {/* Embed */}
              <div
                className={`absolute z-10 transition-all left-0 right-0 top-0 bottom-0 ${
                  chartAnimMode === 'fade' ? 'duration-150' : 'duration-200'
                } ease-[cubic-bezier(0.4,0,0.2,1)] ${
                  chartAnimMode === 'slide' ? 'translate-y-[8px]' : ''
                } ${chartLoaded ? 'opacity-100 translate-y-0' : 'opacity-0'}`}
              >
                <ChartEmbed
                  asset={asset}
                  provider={provider}
                  interval={interval}
                  chartStyle={chartStyle}
                  chartLoaded={chartLoaded}
                  setChartLoaded={setChartLoaded}
                  isFullscreen={isFullscreen}
                />
              </div>
            </div>

            {/* Combined bottom section with grid layout */}
            {!isFullscreen && (
              <div className="relative z-40 lg:hidden">
                <div
                  className="pointer-events-auto nav-glass"
                  style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))' }}
                >
                  <div className="px-3 py-2">
                    {/* Info row */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <div className="text-[9px] text-textMuted uppercase font-bold">{t('ticker')}</div>
                        <div className="text-xs font-mono text-white font-bold truncate">{getTradingViewSymbolLabelForAsset(asset)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-textMuted uppercase font-bold">{t('price')}</div>
                        <div className="text-xs font-mono text-neon font-bold truncate">
                          {quoteUnavailable ? '—' : formatPrice(livePrice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-textMuted uppercase font-bold">{t('change_24h_val')}</div>
                        <div className={`text-xs font-mono font-bold ${(displayChange24h ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                          {(displayChange24h ?? 0) >= 0 ? '+' : ''}{(displayChange24h ?? 0).toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-textMuted uppercase font-bold">{t('volume_24h')}</div>
                        <div className="text-xs text-textSecondary truncate">
                          {asset.volume24h >= 1e9
                            ? (convertFromUsd(asset.volume24h) / 1e9).toFixed(2) + ' ' + t('vol_b')
                            : asset.volume24h >= 1e6
                              ? (convertFromUsd(asset.volume24h) / 1e6).toFixed(2) + ' ' + t('vol_m')
                              : asset.volume24h >= 1e3
                                ? (convertFromUsd(asset.volume24h) / 1e3).toFixed(1) + ' ' + t('vol_k')
                                : formatPrice(asset.volume24h)}{' '}
                          {symbol}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-textMuted uppercase font-bold">{t('min_deal')}</div>
                        <div className="text-xs text-textSecondary">
                          {MIN_DEAL_USD} {symbol}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-textMuted uppercase font-bold">{t('provider')}</div>
                        <div className="text-xs text-neon">{provider}</div>
                      </div>
                    </div>
                    {/* Button row */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          Haptic.tap();
                          setActiveTab('TRADE');
                          setTradeType('futures');
                          setSide('UP');
                        }}
                        className="flex-1 h-9 rounded-full bg-up text-black font-bold text-[12px] active:scale-95 transition-all shadow-elevation-2"
                      >
                        {t('open_long')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          Haptic.tap();
                          setActiveTab('TRADE');
                          setTradeType('futures');
                          setSide('DOWN');
                        }}
                        className="flex-1 h-9 rounded-full bg-down text-white font-bold text-[12px] active:scale-95 transition-all shadow-elevation-2"
                      >
                        {t('open_short')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { Haptic.tap(); setActiveTab('TRADE'); }}
                        className="h-9 w-12 rounded-full bg-surface app-border text-textPrimary text-[11px] font-semibold active:scale-95 transition-all"
                      >
                        {t('show')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        ) : null}

        {/* VIEW: TRADE (MEXC-like split: form + order book) */}
        <div
          className={`lg:relative lg:flex lg:flex-row-reverse lg:shrink-0 lg:opacity-100 lg:z-10 lg:pointer-events-auto ${isNft ? 'lg:w-[360px]' : 'lg:w-[620px]'}
            absolute inset-0 flex flex-row transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isFullscreen
              ? '!hidden'
              : isNft || activeTab === 'TRADE'
                ? 'opacity-100 z-10'
                : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
            
            {/* LEFT COLUMN: форма; для NFT — на всю ширину без «пустого» стакана справа */}
            <div
              className={`h-full min-h-0 flex flex-col p-4 overflow-y-auto no-scrollbar bg-background gap-4 ${
                isNft ? 'w-full' : 'w-[56%] lg:w-[320px] lg:shrink-0 lg:border-l lg:border-border'
              }`}
            >
                {/* tradeType переключается сверху (MEXC tabs) */}

                {advanced && !isNft && <div className="flex items-center gap-2">
                  <div className="flex bg-surface/40 rounded-full p-0.5 flex-1 min-w-0">
                    {(['market', 'limit', 'stop'] as const).map((ot) => {
                      const labelKey =
                        ot === 'market' ? 'order_type_market' : ot === 'limit' ? 'order_type_limit' : 'order_type_stop';
                      return (
                        <button
                          key={ot}
                          type="button"
                          onClick={() => { Haptic.tap(); setOrderTypeUI(ot); }}
                          className={`flex-1 py-1.5 text-[10px] font-medium rounded-full transition-all truncate ${
                            orderTypeUI === ot ? 'bg-surfaceElevated text-white' : 'text-textMuted hover:text-textPrimary'
                          }`}
                        >
                          {t(labelKey)}
                        </button>
                      );
                    })}
                  </div>
                  {openOrdersForTicker.length > 0 && (
                    <span className="text-[10px] font-mono text-neon tabular-nums shrink-0">
                      {openOrdersForTicker.length} {t('order_open_badge')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { Haptic.tap(); setShowProSettings(true); }}
                    className="p-2 rounded-full bg-surface/40 text-textSecondary hover:bg-surfaceElevated hover:text-neon shrink-0"
                    aria-label={t('trading_pro_settings')}
                  >
                    <Settings2 size={18} />
                  </button>
                </div>}

                {advanced && !isNft && orderTypeUI !== 'market' && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-textMuted uppercase font-bold">
                      {orderTypeUI === 'limit' ? t('order_limit_price') : t('order_stop_trigger')}
                    </label>
                    <div className="bg-surface/30 rounded-xl px-3 py-2 flex items-center focus-within:bg-surface/60 transition-colors">
	                      <AppInput
	                        type="text"
	                        inputMode="decimal"
	                        value={orderTypeUI === 'limit' ? limitPriceStr : stopTriggerStr}
                        onChange={(e) =>
                          orderTypeUI === 'limit' ? setLimitPriceStr(e.target.value) : setStopTriggerStr(e.target.value)
                        }
	                        borderless
	                        className="font-mono text-base font-semibold"
	                        placeholder="0"
	                      />
                    </div>
                    <p className="text-[9px] text-textMuted leading-tight px-0.5">{t('order_price_hint_usd')}</p>
                  </div>
                )}

                {advanced && !isNft && <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-textMuted uppercase font-bold w-full">{t('risk_presets')}</span>
                  {[0.01, 0.02, 0.05, 0.1].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { Haptic.tap(); applyRiskBalancePercent(p); }}
                      className="px-2 py-1 rounded-full text-[10px] font-mono bg-surface/40 text-textSecondary hover:bg-surface/80 hover:text-neon active:scale-95"
                    >
                      {Math.round(p * 100)}%
                    </button>
                  ))}
                </div>}

                {/* SPOT: Купить / Продать — в стиле фьючерсов */}
                {tradeType === 'spot' && (
                    <div className="space-y-3">
                        {isNft && asset.nft && (
                          <button
                            type="button"
                            onClick={() => {
                              Haptic.tap();
                              onBack();
                            }}
                            className="group w-full rounded-xl overflow-hidden bg-surfaceElevated text-left active:scale-[0.99] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-neon/30"
                          >
                            <div className="flex gap-3 p-3 items-center">
                              <div className="h-16 w-16 rounded-xl overflow-hidden bg-black/40 shrink-0">
                                <img
                                  src={asset.nft.imageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] text-textMuted uppercase tracking-wider font-semibold truncate">
                                  {asset.nft.collectionName}
                                </div>
                                <div className="font-mono text-[15px] font-bold text-textPrimary">{asset.nft.codeDisplay}</div>
                                <div className="text-[11px] text-textSubtle mt-1">
                                  {t('nft_list_price_eth')}:{' '}
                                  <span className="font-mono tabular-nums">
                                    {asset.nft.priceEth.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH
                                  </span>
                                </div>
                              </div>
                              <ChevronRight
                                size={20}
                                className="shrink-0 text-textMuted opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                                aria-hidden
                              />
                            </div>
                          </button>
                        )}
                        {/* Направление: Купить / Продать */}
                        <div className="flex gap-1.5 p-1 rounded-full bg-white/5 app-border">
                                <button
                                    type="button"
                                    onClick={() => { Haptic.tap(); setSpotAction('buy'); }}
                                    className={`flex-1 h-9 rounded-full font-bold text-[12px] transition-all
                                        ${spotAction === 'buy'
                                            ? 'bg-up text-black shadow-elevation-1'
                                            : 'text-textSecondary'
                                        }`}
                                >
                                    {t('spot_buy')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { Haptic.tap(); setSpotAction('sell'); }}
                                    className={`flex-1 h-9 rounded-full font-bold text-[12px] transition-all
                                        ${spotAction === 'sell'
                                            ? 'bg-down text-black shadow-elevation-1'
                                            : 'text-textSecondary'
                                        }`}
                                >
                                    {t('spot_sell')}
                                </button>
                        </div>

                        {spotAction === 'buy' &&
                          (isNft ? (
                            <>
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2 px-0.5">
                                  <span className="text-[10px] text-textMuted uppercase font-bold leading-snug">{t('nft_trade_unit_price')}</span>
                                  <div className="text-right min-w-0">
                                    <span className="block font-mono text-sm font-bold text-neon tabular-nums truncate">
                                      {quoteUnavailable ? '—' : `${formatPrice(livePrice)} ${symbol}`}
                                    </span>
                                    {asset.nft && (
                                      <span className="text-[10px] text-textMuted font-mono block mt-0.5 tabular-nums">
                                        · {asset.nft.priceEth.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-textMuted uppercase font-bold">{t('nft_trade_quantity')}</label>
                                  <div
                                    className="flex w-full max-w-[min(100%,15rem)] mx-auto items-stretch overflow-hidden rounded-xl bg-surfaceElevated"
                                    role="group"
                                    aria-label={t('nft_trade_quantity')}
                                  >
                                    <button
                                      type="button"
                                      aria-label="-1 NFT"
                                      onClick={() => {
                                        Haptic.tap();
                                        setNftQtyBuyStr((prev) =>
                                          String(Math.max(1, parseDiscreteNftQtyString(prev, 1) - 1))
                                        );
                                      }}
                                      className="flex min-h-[2.875rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] active:bg-white/[0.11] disabled:pointer-events-none disabled:opacity-[0.28] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/35 focus-visible:ring-inset border-r border-border"
                                      disabled={nftBuyCalc.qtyWish <= 1}
                                    >
                                      <Minus size={20} strokeWidth={2.25} className="text-textSecondary" />
                                    </button>
                                    <div
                                      className="flex min-w-[3.25rem] shrink-0 items-center justify-center bg-black/30 px-4 py-2.5"
                                      aria-live="polite"
                                      aria-atomic="true"
                                    >
                                      <span className="font-mono text-[18px] font-bold tabular-nums leading-none tracking-tight text-textPrimary">
                                        {nftBuyCalc.qtyWish}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      aria-label="+1 NFT"
                                      onClick={() => {
                                        Haptic.tap();
                                        setNftQtyBuyStr((prev) => String(parseDiscreteNftQtyString(prev, 1) + 1));
                                      }}
                                      className="flex min-h-[2.875rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] active:bg-white/[0.11] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/35 focus-visible:ring-inset border-l border-border"
                                    >
                                      <Plus size={20} strokeWidth={2.25} className="text-neon" />
                                    </button>
                                  </div>
                                  {nftBuyCalc.maxAffordableQty > 0 ? (
                                    <p className="text-[9px] text-textMuted px-0.5">
                                      {t('nft_trade_qty_max', { max: nftBuyCalc.maxAffordableQty })}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="flex items-center justify-between gap-2 px-0.5 pt-1">
                                    <span className="text-[10px] text-textSubtle">{t('min_deal')}: {MIN_DEAL_USD} {symbol}</span>
                                  <span className="font-mono text-base font-bold text-neon tabular-nums">
                                    {livePrice <= 0 || quoteUnavailable
                                      ? '—'
                                      : `${formatPrice(nftBuyCalc.amountUsd)} ${symbol}`}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 px-0.5">
                                  <span className="text-[10px] text-textSubtle font-semibold whitespace-nowrap">{t('you_receive')}</span>
                                  <span className="text-[12px] font-mono font-bold text-textPrimary text-right truncate">
                                    {livePrice <= 0 || quoteUnavailable ? '—' : t('nft_trade_you_receive_coin', { qty: nftBuyCalc.qtyWish })}
                                  </span>
                                </div>

                                <div className="text-[9px] text-textMuted px-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                                  <span>
                                    {t('available')}: {balanceLoading ? '—' : `${formatPrice(balance)} ${symbol}`}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <Info size={9} /> {t('min')}: {MIN_DEAL_USD} {symbol}
                                  </span>
                                </div>
                                <p className="text-[9px] text-textMuted px-0.5 leading-tight">{t('nft_trade_buy_note')}</p>
                              </div>
                              {/* Выбор типа: Рыночная / Ордерная */}
                              <div className="flex gap-1 p-1 rounded-full bg-surfaceElevated mb-2">
                                {(['market', 'order'] as const).map((k) => (
                                  <button
                                    key={k}
                                    type="button"
                                    onClick={() => { Haptic.tap(); setNftBuyKind(k); }}
                                    className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors ${
                                      nftBuyKind === k ? 'bg-up text-black' : 'text-textSubtle hover:text-textPrimary'
                                    }`}
                                  >
                                    {k === 'market' ? tr('nft_kind_market', 'Рыночная') : tr('nft_kind_order', 'Ордерная')}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[9px] text-textMuted px-0.5 leading-tight mb-2">
                                {nftBuyKind === 'market'
                                  ? tr('nft_kind_market_hint', 'Мгновенно по текущей цене.')
                                  : tr('nft_kind_order_hint', 'Заявка по вашей цене — подтверждает продавец.')}
                              </p>
                              <button
                                type="button"
                                disabled={
                                  nftBuyKind === 'market'
                                    ? (spotLoading || tradingBlocked || balanceLoading || quoteUnavailable || livePrice <= 0 || !nftBuyCalc.affordable)
                                    : (nftOrdering || tradingBlocked || livePrice <= 0)
                                }
                                onClick={() => {
                                  Haptic.tap();
                                  if (nftBuyKind === 'market') setShowSpotConfirm('buy');
                                  else openNftOrderTicket();
                                }}
                                className="w-full h-12 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-up text-black shadow-elevation-2"
                              >
                                {nftBuyKind === 'market'
                                  ? (spotLoading ? '...' : `${tr('nft_market_buy', 'Купить по рынку')} · ×${nftBuyCalc.qtyWish}`)
                                  : (nftOrdering ? '...' : tr('nft_order_buy', 'Создать заявку'))}
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="space-y-0.5">
                                <label className="text-[10px] text-textMuted uppercase font-bold">
                                  {t('amount_label')} ({symbol})
                                </label>
                                <div className="bg-surface/30 rounded-xl px-3 py-2 flex items-center justify-between focus-within:bg-surface/60 transition-colors">
	                                  <AppInput
	                                    type="text"
	                                    inputMode="decimal"
	                                    value={spotAmount}
	                                    onChange={(e) => setSpotAmount(e.target.value)}
	                                    borderless
	                                    className="font-mono text-base font-semibold"
	                                    placeholder="0"
	                                  />
                                </div>
                                <div className="text-[9px] text-textMuted px-1 flex items-center gap-2 flex-wrap">
                                  <span>{t('available')}: {balanceLoading ? '—' : `${formatPrice(balance)} ${symbol}`}</span>
                                  <span className="flex items-center gap-0.5">
                                    <Info size={9} /> {t('min')}: {MIN_DEAL_USD} {symbol}
                                  </span>
                                </div>
                              </div>
                              {livePrice > 0 && (parseFloat(spotAmount.replace(',', '.')) || 0) >= MIN_DEAL_USD && (
                                <div className="flex items-center justify-between gap-2 px-1">
                                  <span className="text-[10px] text-textSubtle font-semibold whitespace-nowrap">{t('you_receive')}</span>
                                  <span className="text-[11px] font-mono font-semibold text-textSecondary truncate text-right">
                                    ≈ {(() => {
                                      const displayAmount = parseFloat(spotAmount.replace(',', '.')) || 0;
                                      const base = livePrice > 0 ? convertToUsd(displayAmount) / livePrice : 0;
                                      const value = base > 0 ? base.toFixed(8) : '0';
                                      return `${value} ${asset.ticker}`;
                                    })()}
                                  </span>
                                </div>
                              )}
                              <p className="text-[9px] text-textMuted px-0.5 leading-tight">{t('spot_buy_note')}</p>
                              {orderTypeUI === 'market' ? (
                                <button
                                  type="button"
                                  disabled={
                                    spotLoading ||
                                    tradingBlocked ||
                                    (parseFloat(spotAmount.replace(',', '.')) || 0) < MIN_DEAL_USD
                                  }
                                  onClick={() => {
                                    Haptic.tap();
                                    setShowSpotConfirm('buy');
                                  }}
                                  className="w-full h-12 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-up text-black shadow-elevation-2"
                                >
                                  {spotLoading ? '...' : `${t('spot_buy')} ${asset.ticker}`}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={tradingBlocked}
                                  onClick={() => {
                                    Haptic.tap();
                                    placeSpotLimitStop();
                                  }}
                                  className="w-full py-3.5 rounded-full font-bold text-sm uppercase tracking-wide active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-neon text-black hover:opacity-90"
                                >
                                  {t('place_order_btn')}
                                </button>
                              )}
                            </>
                          ))}

                        {spotAction === 'sell' &&
                          (isNft ? (
                            <>
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2 px-0.5">
                                  <span className="text-[10px] text-textMuted uppercase font-bold">{t('nft_trade_unit_price')}</span>
                                  <span className="font-mono text-sm font-bold text-neon tabular-nums text-right truncate">
                                    {quoteUnavailable ? '—' : `${formatPrice(livePrice)} ${symbol}`}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-textMuted uppercase font-bold">{t('nft_trade_quantity')}</label>
                                  <div
                                    className="flex w-full max-w-[min(100%,15rem)] mx-auto items-stretch overflow-hidden rounded-xl bg-surfaceElevated"
                                    role="group"
                                    aria-label={t('nft_trade_quantity')}
                                  >
                                    <button
                                      type="button"
                                      aria-label="-1 NFT"
                                      onClick={() => {
                                        Haptic.tap();
                                        setNftQtySellStr((prev) =>
                                          String(Math.max(1, parseDiscreteNftQtyString(prev, 1) - 1))
                                        );
                                      }}
                                      className="flex min-h-[2.875rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] active:bg-white/[0.11] disabled:pointer-events-none disabled:opacity-[0.28] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/35 focus-visible:ring-inset border-r border-border"
                                      disabled={nftSellWholeMax < 1 || nftSellRawWish <= 1}
                                    >
                                      <Minus size={20} strokeWidth={2.25} className="text-down" />
                                    </button>
                                    <div
                                      className="flex min-w-[3.25rem] shrink-0 items-center justify-center bg-black/30 px-4 py-2.5"
                                      aria-live="polite"
                                      aria-atomic="true"
                                    >
                                      <span className="font-mono text-[18px] font-bold tabular-nums leading-none tracking-tight text-textPrimary">
                                        {nftSellWholeMax < 1 ? '—' : nftSellRawWish}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      aria-label="+1 NFT"
                                      onClick={() => {
                                        Haptic.tap();
                                        setNftQtySellStr((prev) =>
                                          String(
                                            Math.min(
                                              parseDiscreteNftQtyString(prev, 1) + 1,
                                              Math.max(nftSellWholeMax, 1)
                                            )
                                          )
                                        );
                                      }}
                                      disabled={nftSellWholeMax < 1 || nftSellRawWish >= nftSellWholeMax}
                                      className="flex min-h-[2.875rem] min-w-[2.75rem] flex-1 items-center justify-center text-textPrimary transition-colors hover:bg-white/[0.07] active:bg-white/[0.11] disabled:pointer-events-none disabled:opacity-[0.28] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/35 focus-visible:ring-inset border-l border-border"
                                    >
                                      <Plus size={20} strokeWidth={2.25} className="text-textSecondary" />
                                    </button>
                                  </div>
                                  <div className="text-[9px] text-textMuted px-0.5">
                                    <span>{t('available')} — {nftSellWholeMax}</span>{' '}
                                    {asset.nft ? <span className="text-textMuted">({asset.nft.codeDisplay})</span> : null}
                                  </div>
                                </div>
                                {livePrice > 0 && nftSellValid ? (
                                  <div className="flex items-center justify-between gap-2 px-0.5">
                                    <span className="text-[10px] text-textSubtle font-semibold whitespace-nowrap">{t('nft_trade_you_receive_currency')}</span>
                                    <span className="text-[13px] font-mono font-bold text-textSecondary truncate text-right tabular-nums">
                                      ≈ {formatPrice(nftSellProceedsUsd)} {symbol}
                                    </span>
                                  </div>
                                ) : null}
                                <p className="text-[9px] text-textMuted px-0.5 leading-tight">{t('spot_sell_note')}</p>
                                {nftDuoSellBlocked ? (
                                  <p className="text-[9px] text-textSecondary px-0.5 leading-tight">{t('nft_sell_duo_pair_required')}</p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                disabled={
                                  nftOrdering ||
                                  tradingBlocked ||
                                  balanceLoading ||
                                  !nftSellValid ||
                                  nftSellWholeMax < 1
                                }
                                onClick={() => {
                                  Haptic.tap();
                                  openNftSellTicket();
                                }}
                                className="w-full h-12 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-down text-white shadow-elevation-2"
                              >
                                {nftOrdering ? '...' : `${tr('nft_order_sell', 'Выставить на продажу')} · ×${nftSellRawWish}`}
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="space-y-0.5">
                                <label className="text-[10px] text-textMuted uppercase font-bold">
                                  {asset.ticker} — {t('amount_label')}
                                </label>
                                <div className="bg-surface/30 rounded-xl px-3 py-2 flex items-center justify-between gap-2 focus-within:bg-surface/60 transition-colors">
	                                  <AppInput
	                                    type="text"
	                                    inputMode="decimal"
	                                    value={spotQuantity}
	                                    onChange={(e) => setSpotQuantity(e.target.value)}
	                                    borderless
	                                    className="flex-1 font-mono text-base font-semibold"
	                                    placeholder="0"
	                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      Haptic.tap();
                                      setSpotQuantity(holdingAmount > 0 ? holdingAmount.toFixed(8) : '0');
                                    }}
                                    className="px-2.5 py-1 rounded-full bg-neon/15 text-neon text-xs font-mono font-bold hover:bg-neon/25 active:scale-95"
                                  >
                                    {t('max')}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {[0.25, 0.5, 0.75, 1].map((pct) => (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() => {
                                        Haptic.tap();
                                        if (pct === 1) setSpotQuantity(holdingAmount > 0 ? holdingAmount.toFixed(8) : '0');
                                        else setSpotQuantity(String((holdingAmount * pct).toFixed(8)));
                                      }}
                                      className="px-2.5 py-1 rounded-full bg-surface/40 text-textSecondary text-xs font-mono hover:bg-surface/80 hover:text-textPrimary active:scale-95"
                                    >
                                      {pct === 1 ? t('max') : pct * 100 + '%'}
                                    </button>
                                  ))}
                                </div>
                                <div className="text-[9px] text-textMuted px-1 flex items-center gap-2 flex-wrap">
                                  <span>
                                    {t('available')}: {holdingAmount.toFixed(8)} {asset.ticker}
                                  </span>
                                  {currentHolding ? (
                                    <span className="text-textMuted">
                                      ≈ {formatPrice(holdingAmount * currentHolding.avgPriceRub)} {symbol}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {livePrice > 0 && parseFloat(spotQuantity) > 0 && parseFloat(spotQuantity) <= holdingAmount && (
                                <div className="flex items-center justify-between gap-2 px-1">
                                  <span className="text-[10px] text-textSubtle font-semibold whitespace-nowrap">{t('you_receive')}</span>
                                  <span className="text-[11px] font-mono font-semibold text-textSecondary truncate text-right">
                                    ≈ {formatPrice((parseFloat(spotQuantity) || 0) * livePrice)} {symbol}
                                  </span>
                                </div>
                              )}
                              <p className="text-[9px] text-textMuted px-0.5 leading-tight">{t('spot_sell_note')}</p>
                              {orderTypeUI === 'market' ? (
                                <button
                                  type="button"
                                  disabled={
                                    spotLoading ||
                                    tradingBlocked ||
                                    balanceLoading ||
                                    holdingAmount <= 0 ||
                                    (parseFloat(spotQuantity) || 0) <= 0
                                  }
                                  onClick={() => {
                                    Haptic.tap();
                                    setShowSpotConfirm('sell');
                                  }}
                                  className="w-full h-12 rounded-full font-bold text-base active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-down text-white shadow-elevation-2"
                                >
                                  {spotLoading ? '...' : `${t('spot_sell')} ${asset.ticker}`}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={tradingBlocked}
                                  onClick={() => {
                                    Haptic.tap();
                                    placeSpotLimitStop();
                                  }}
                                  className="w-full py-3.5 rounded-full font-bold text-sm uppercase tracking-wide active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-down text-white hover:opacity-90"
                                >
                                  {t('place_order_btn')}
                                </button>
                              )}
                            </>
                          ))}

                        {tradingBlocked && (
                            <div className="p-2 rounded-lg bg-white/[0.03] app-border text-textSecondary text-[10px]">
                                {t('trading_blocked')}.
                            </div>
                        )}
                        <p className="text-[9px] text-textMuted mt-1 px-0.5 leading-tight">{t('trading_risk_note')}</p>
                    </div>
                )}

                {/* FUTURES: сумма, плечо, время, Long/Short */}
                {tradeType === 'futures' && (
                <>
                {/* Margin Mode & Leverage Indicators (MEXC Header style) */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => { Haptic.tap(); setShowMarginSheet(true); }}
                    className="h-7 px-3 rounded-full bg-surface/50 text-textPrimary text-[11px] font-bold uppercase tracking-wider active:scale-95 transition-all flex items-center gap-1.5 hover:bg-surface"
                  >
                    {marginMode === 'isolated' ? t('margin_isolated') : t('margin_cross')}
                    <ChevronDown size={10} className="text-textSubtle" />
                  </button>
                  <div className="h-7 px-3 rounded-full bg-surface/50 text-neon text-[11px] font-bold flex items-center">
                    {leverage}X
                  </div>
                </div>

                {/* Direction (move up, MEXC-like) */}
                <div className="mb-3">
                  <div className="flex gap-1 p-0.5 rounded-full bg-surface/40">
                    <button
                      type="button"
                      onClick={() => { Haptic.tap(); setSide('UP'); }}
                      className={`flex-1 h-8.5 rounded-full font-bold text-[12px] transition-all ${
                        side === 'UP' ? 'bg-up text-black' : 'text-textSecondary hover:text-textPrimary'
                      }`}
                    >
                      {t('long')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { Haptic.tap(); setSide('DOWN'); }}
                      className={`flex-1 h-8.5 rounded-full font-bold text-[12px] transition-all ${
                        side === 'DOWN' ? 'bg-down text-white' : 'text-textSecondary hover:text-textPrimary'
                      }`}
                    >
                      {t('short')}
                    </button>
                  </div>
                </div>
                {/* Inputs */}
                <div className="space-y-4">
                    
                    {/* Amount */}
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-textMuted uppercase font-bold">
                            {t('amount_label')} ({currencyCode})
                          </label>
                          <div className="bg-surface/30 rounded-xl px-3 py-2 flex items-center justify-between focus-within:bg-surface/60 transition-colors">
	                            <AppInput
	                              type="text"
	                              inputMode="decimal"
	                              value={amount}
	                              onChange={(e) => setAmount(e.target.value)}
	                              borderless
	                              className="font-mono text-base font-semibold"
	                              placeholder="0"
	                            />
                          </div>
                          <div className="text-[9px] text-textMuted px-1 flex items-center gap-2 flex-wrap">
                            <span>{t('available')}: {balanceLoading ? '—' : `${formatPrice(balance)} ${symbol}`}</span>
                            <span className="flex items-center gap-0.5">
                              <Info size={9} /> {t('min')}: {MIN_DEAL_USD} {symbol}
                            </span>
                          </div>
                        </div>

                    {/* Leverage */}
                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-textMuted uppercase font-bold flex items-center">
                                <Zap size={10} className="mr-1 text-neon" /> {t('leverage')}
                            </label>
                            <span className="text-xs font-mono font-bold text-neon">×{leverage}</span>
                        </div>
                        {React.createElement('input', {
                            type: 'range',
                            min: '1',
                            max: Math.max(1, riskSettings.maxLeverage),
                            step: '1',
                            value: leverage,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => { Haptic.tap(); setLeverage(parseInt(e.target.value, 10)); },
                            className: 'w-full h-1.5 rounded-full appearance-none cursor-pointer accent-neon mt-1',
                            style: {
                              background: `linear-gradient(to right, #21B053 ${
                                (Math.max(1, riskSettings.maxLeverage) <= 1
                                  ? 0
                                  : ((leverage - 1) / (Math.max(1, riskSettings.maxLeverage) - 1)) * 100)
                              }%, rgba(255,255,255,0.1) 0%)`,
                            },
                        })}
                        <div className="flex gap-1 pt-0.5">
                            {[1, 5, 10, 25, 50, 75, 100].filter((v) => v <= riskSettings.maxLeverage).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => { Haptic.tap(); setLeverage(v); }}
                                    className="flex-1 text-[9px] font-mono py-0.5 rounded transition-etoro active:scale-95"
                                    style={{
                                        background: leverage === v ? 'rgba(33,176,83,0.18)' : 'rgba(255,255,255,0.03)',
                                        color: leverage === v ? '#21B053' : '#6E7A8C',
                                        borderRadius: '999px',
                                    }}
                                >
                                    ×{v}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Duration */}
                    <div className="space-y-0.5">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] text-textMuted uppercase font-bold flex items-center">
                                <Clock size={10} className="mr-1 text-neon" /> {t('time')}
                            </label>
                            <span className="text-xs font-mono font-bold text-neon">
                              {formatDurationLabel(duration)}
                            </span>
                        </div>
                        {React.createElement('input', {
                            type: 'range',
                            min: '0',
                            max: TIMEFRAMES.length - 1,
                            step: '1',
                            value: TIMEFRAMES.findIndex(tf => tf.sec === duration).toString() === '-1' ? '1' : TIMEFRAMES.findIndex(tf => tf.sec === duration).toString(),
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => { Haptic.tap(); setDuration(TIMEFRAMES[parseInt(e.target.value)].sec); },
                            className: 'w-full h-1.5 rounded-full appearance-none cursor-pointer accent-neon mt-1',
                            style: { background: `linear-gradient(to right, #21B053 ${TIMEFRAMES.findIndex(tf => tf.sec === duration) / (TIMEFRAMES.length - 1) * 100}%, rgba(255,255,255,0.1) 0%)` },
                        })}
                    </div>



                    {/* Direction moved up */}
                </div>

                {tradingBlocked && (
                  <div className="mt-1.5 p-2 rounded-lg bg-white/[0.03] app-border text-textSecondary text-[10px]">
                    {t('trading_blocked')}.
                  </div>
                )}
                <p className="text-[9px] text-textMuted mt-1 px-0.5 leading-tight">{t('trading_risk_note')}</p>

                {/* Create Deal / place limit-stop */}
                {orderTypeUI === 'market' ? (
                <button
                    onClick={handlePreTrade}
                    disabled={tradingBlocked || balanceLoading}
                    className={`w-full h-12 rounded-full font-bold text-base shadow-elevation-2 active:scale-95 transition-all mt-3
                    ${tradingBlocked ? 'bg-surfaceElevated text-textMuted cursor-not-allowed' : side === 'UP' ? 'bg-up text-black' : 'bg-down text-white'}`}
                >
                    {tradingBlocked ? t('trading_blocked') : side === 'UP' ? t('open_long') : t('open_short')}
                </button>
                ) : (
                <button
                    type="button"
                    onClick={() => { Haptic.tap(); placeFuturesLimitStop(); }}
                    disabled={tradingBlocked}
                    className={`w-full py-3.5 rounded-full font-bold text-sm uppercase tracking-wide shadow-lg active:scale-95 transition-all mt-3
                    ${tradingBlocked ? 'bg-surfaceElevated text-textMuted cursor-not-allowed' : side === 'UP' ? 'bg-neon text-black hover:opacity-90' : 'bg-down text-white hover:opacity-90'}`}
                >
                    {t('place_order_btn')}
                </button>
                )}
                </>
                )}

                {/* Pro: positions / open orders / history */}
                <div className="mt-3 pt-3 hairline-top space-y-2">
                  <div className="flex rounded-full bg-surface/30 p-0.5">
                    {(
                      [
                        ['positions', t('trading_tab_positions')],
                        ['open_orders', t('trading_tab_open_orders')],
                        ['history', t('trading_tab_history')],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { Haptic.tap(); setProPanelTab(id); }}
                        className={`flex-1 py-2 text-[10px] font-semibold rounded-full transition-colors ${
                          proPanelTab === id ? 'bg-surfaceElevated text-white' : 'text-textMuted hover:text-textSecondary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {proPanelTab === 'positions' && (
                    <div className="text-xs space-y-2 max-h-32 overflow-y-auto no-scrollbar">
                      {tradeType === 'futures' && localPositions.length === 0 && (
                        <div className="py-2 text-center">
                          <p className="text-textMuted">{t('trading_no_positions')}</p>
                          <p className="text-[10px] text-textSubtle mt-1">
                            {t('going_to_portfolio')}
                          </p>
                        </div>
                      )}
                      {tradeType === 'futures' &&
                        localPositions.map((d) => {
                          const timeLeftSec = Math.max(
                            0,
                            Math.ceil((d.startTime + d.durationSeconds * 1000 - Date.now()) / 1000)
                          );
                          const mm = Math.floor(timeLeftSec / 60).toString().padStart(2, '0');
                          const ss = Math.floor(timeLeftSec % 60).toString().padStart(2, '0');
                          const pnl = typeof d.pnl === 'number' ? d.pnl : 0;
                          const pnlText = `${pnl >= 0 ? '+' : ''}${formatPrice(pnl)} ${symbol}`;
                          return (
                            <div key={d.id} className="rounded-xl bg-surface/30 px-2.5 py-2">
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span className={`font-semibold ${d.side === 'UP' ? 'text-up' : 'text-down'}`}>
                                  {d.side === 'UP' ? t('long') : t('short')} · ×{d.leverage}
                                </span>
                                <span className="text-textSubtle">{mm}:{ss}</span>
                              </div>
                              <div className="flex items-center justify-between font-mono text-[10px] mt-1">
                                <span className="text-textSecondary">
                                  {t('entry')}: {formatPrice(d.entryPrice)}
                                </span>
                                <span className={pnl >= 0 ? 'text-up' : 'text-down'}>{pnlText}</span>
                              </div>
                            </div>
                          );
                        })}
                      {tradeType === 'spot' && (
                        <div className="flex justify-between text-[11px] font-mono list-row py-1">
                          <span className="text-textSecondary">{asset.ticker}</span>
                          <span className="text-white">{holdingAmount > 0 ? holdingAmount.toFixed(6) : '0'}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {proPanelTab === 'open_orders' && (
                    <div className="text-xs space-y-1.5 max-h-32 overflow-y-auto">
                      {openOrdersForTicker.length === 0 && (
                        <p className="text-textMuted text-center py-2">{t('trading_no_open_orders')}</p>
                      )}
                      {openOrdersForTicker.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-1 hairline-bottom pb-1 text-[10px]">
                          <span className="font-mono text-textSecondary">
                            {o.orderType} {o.tradeType} {o.tradeType === 'spot' ? o.sideSpot : o.sideFutures}
                          </span>
                          <button
                            type="button"
                            className="text-red-400 shrink-0"
                            onClick={() => {
                              Haptic.tap();
                              removePendingOrder(o.id);
                              appendOrderHistory({
                                id: `${o.id}-c`,
                                orderId: o.id,
                                ticker: o.ticker,
                                tradeType: o.tradeType,
                                orderType: o.orderType,
                                status: 'cancelled',
                                at: Date.now(),
                              });
                              refreshOrderStore();
                              toast.show(t('order_cancelled_toast'), 'success');
                            }}
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {proPanelTab === 'history' && (
                    <div className="text-[10px] space-y-1 max-h-32 overflow-y-auto text-textSecondary">
                      {tradeType === 'futures' && localHistory.length === 0 && (
                        <p className="text-textMuted text-center py-2">{t('trading_no_history')}</p>
                      )}
                      {tradeType === 'futures' &&
                        localHistory.slice(0, 20).map((d) => (
                          <div key={d.id} className="flex items-center justify-between hairline-bottom pb-0.5 font-mono">
                            <span className={d.status === 'WIN' ? 'text-up' : d.status === 'LOSS' ? 'text-down' : 'text-textSecondary'}>
                              {d.status}
                            </span>
                            <span className="text-textSecondary">
                              {typeof d.pnl === 'number' ? `${d.pnl >= 0 ? '+' : ''}${formatPrice(d.pnl)} ${symbol}` : '—'}
                            </span>
                          </div>
                        ))}
                      {tradeType === 'spot' && (
                        <>
                          {orderHistory.length === 0 && (
                            <p className="text-textMuted text-center py-2">{t('trading_no_history')}</p>
                          )}
                          {orderHistory.slice(0, 30).map((h) => (
                            <div key={h.id} className="flex justify-between hairline-bottom pb-0.5">
                              <span>
                                {h.ticker} · {h.orderType} · {h.status}
                              </span>
                              <span className="font-mono text-[9px]">
                                {new Date(h.at).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
            </div>

            {!isNft ? (
              /* RIGHT COLUMN: стакан только для крипто/акций — у NFT убираем пустые flex-блоки */
              <div className="flex w-[44%] lg:flex-1 min-h-0 flex-col bg-surface overflow-y-auto no-scrollbar">
                <div className="flex justify-between px-2 py-2 text-[9px] text-textSubtle uppercase tracking-wider shrink-0">
                  <span>{t('order_book_price')}</span>
                  <span>{t('order_book_size')}</span>
                </div>

                <div className="flex flex-col-reverse justify-end flex-1 overflow-hidden">
                  {asks.map((ask, i) => (
                    <div key={`ask-${i}`} className="flex justify-between px-2 py-0.5 relative group cursor-pointer hover-row">
                      <span className="text-[11px] font-mono font-medium text-down relative z-10">{formatPrice(ask.price)}</span>
                      <span className="text-[11px] font-mono text-textMuted relative z-10">{ask.size.toFixed(3)}</span>
                      <div className="absolute right-0 top-0 bottom-0 bg-down/10 z-0 transition-all duration-300" style={{ width: `${Math.random() * 80 + 10}%` }} />
                    </div>
                  ))}
                </div>

                <div
                  className={`py-2 flex flex-col items-center bg-surface/50 my-1 shrink-0 transition-colors duration-200 ${
                    flashDirection === 'up' ? 'animate-flash-up' : flashDirection === 'down' ? 'animate-flash-down' : ''
                  }`}
                >
                  <span
                    className={`text-[15px] font-mono font-bold leading-none ${
                      priceDirection === 'up' ? 'text-up' : priceDirection === 'down' ? 'text-down' : 'text-textPrimary'
                    }`}
                  >
                    {quoteUnavailable ? '—' : formatPrice(orderBookBase > 0 ? orderBookBase : livePrice)}
                  </span>
                  <span className="text-[9px] text-textSubtle mt-0.5">{currencyCode}</span>
                </div>

                <div className="flex flex-col flex-1 overflow-hidden">
                  {bids.map((bid, i) => (
                    <div key={`bid-${i}`} className="flex justify-between px-2 py-0.5 relative group cursor-pointer hover-row">
                      <span className="text-[11px] font-mono font-medium text-up relative z-10">{formatPrice(bid.price)}</span>
                      <span className="text-[11px] font-mono text-textMuted relative z-10">{bid.size.toFixed(3)}</span>
                      <div className="absolute right-0 top-0 bottom-0 bg-up/10 z-0 transition-all duration-300" style={{ width: `${Math.random() * 80 + 10}%` }} />
                    </div>
                  ))}
                </div>

                <div className="p-1 flex justify-center shrink-0">
                  <ChevronDown size={14} className="text-textSubtle opacity-50" />
                </div>
              </div>
            ) : null}
        </div>
      </div>

      {/* Pro trading: risk & defaults */}
      <BottomSheet
        open={showProSettings}
        onClose={() => setShowProSettings(false)}
        title={t('trading_pro_settings')}
        closeOnBackdrop
        variant="expandable"
      >
        <div className="px-4 space-y-4 pb-4">
          <div>
            <div className="text-[10px] text-textMuted uppercase font-bold mb-1">{t('settings_max_leverage')}</div>
            {React.createElement('input', {
              type: 'range',
              min: 1,
              max: 125,
              value: riskSettings.maxLeverage,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                setRiskSettings((s) => ({ ...s, maxLeverage: parseInt(e.target.value, 10) || 1 })),
              className: 'w-full accent-neon',
            })}
            <p className="text-xs font-mono text-right text-neon">×{riskSettings.maxLeverage}</p>
          </div>
          <div>
            <div className="text-[10px] text-textMuted uppercase font-bold mb-1">{t('settings_max_order_usd')}</div>
            <AppInput
              type="text"
              inputMode="numeric"
              className="text-sm font-mono"
              value={String(riskSettings.maxOrderSizeUsd || '')}
              onChange={(e) => {
                const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
                setRiskSettings((s) => ({ ...s, maxOrderSizeUsd: Number.isFinite(v) ? v : 0 }));
              }}
              placeholder="0"
            />
          </div>
          <div>
            <div className="text-[10px] text-textMuted uppercase font-bold mb-1">{t('settings_default_order_type')}</div>
            <div className="flex bg-surface/50 rounded-lg p-0.5 app-border-soft">
              {(['market', 'limit', 'stop'] as const).map((ot) => {
                const key =
                  ot === 'market' ? 'order_type_market' : ot === 'limit' ? 'order_type_limit' : 'order_type_stop';
                return (
                  <button
                    key={ot}
                    type="button"
                    onClick={() => setRiskSettings((s) => ({ ...s, defaultOrderType: ot }))}
                    className={`flex-1 py-2 text-[10px] rounded-md ${
                      riskSettings.defaultOrderType === ot ? 'bg-card text-white' : 'text-textMuted'
                    }`}
                  >
                    {t(key)}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-textSecondary cursor-pointer">
            {React.createElement('input', {
              type: 'checkbox',
              className: 'rounded border-border',
              checked: riskSettings.confirmMarketOrders,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                setRiskSettings((s) => ({ ...s, confirmMarketOrders: e.target.checked })),
            })}
            {t('settings_confirm_market')}
          </label>
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              saveRiskSettings(riskSettings);
              setOrderTypeUI(riskSettings.defaultOrderType);
              setShowProSettings(false);
            }}
            className="w-full py-3 rounded-xl bg-neon text-black font-bold"
          >
            {t('settings_save')}
          </button>
        </div>
      </BottomSheet>

      {/* CONFIRMATION MODAL */}
      <BottomSheet
        open={!!showConfirm}
        onClose={() => { setShowConfirm(false); }}
        title={t('confirm_title')}
        closeOnBackdrop
      >
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('asset')}</span>
            <span className="font-bold text-textPrimary">{asset.ticker}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('direction')}</span>
            <span className={`font-bold ${side === 'UP' ? 'text-up' : 'text-down'}`}>
              {side === 'UP' ? `${t('long')} (${t('up')})` : `${t('short')} (${t('down')})`}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('amount_leverage')}</span>
            <div className="text-right">
              <span className="font-mono text-textPrimary block">
                {formatPrice(convertToUsd(parseFloat(amount.replace(',', '.')) || 0))} {symbol} x{leverage}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('duration')}</span>
            <span className="font-mono text-textPrimary">{duration} {t('sec')}</span>
          </div>
        </div>
        <BottomSheetFooter
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => {
            const userId = tgid || webUserId?.toString();
            if (userId) {
              requirePin(userId, t('enter_pin_for_confirm'), handleConfirmTrade);
            } else {
              handleConfirmTrade();
            }
          }}
          confirmLabel={t('confirm')}
        />
      </BottomSheet>

      {/* SPOT CONFIRMATION MODAL */}
      <BottomSheet
        open={!!showSpotConfirm}
        onClose={() => setShowSpotConfirm(null)}
        title={
          showSpotConfirm === 'buy' ? `${t('confirm_title')} — ${t('spot_buy')}` : `${t('confirm_title')} — ${t('spot_sell')}`
        }
        closeOnBackdrop
      >
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-textSecondary">{t('asset')}</span>
            <span className="font-bold text-textPrimary">{asset.ticker}</span>
          </div>
          {showSpotConfirm === 'buy' &&
            (isNft ? (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('nft_trade_quantity')}</span>
                  <span className="font-mono text-textPrimary">× {nftBuyCalc.qtyWish}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('nft_trade_unit_price')}</span>
                  <span className="font-mono text-textPrimary tabular-nums">
                    {quoteUnavailable ? '—' : `${formatPrice(livePrice)} ${symbol}`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('nft_trade_total')}</span>
                  <span className="font-mono text-neon tabular-nums">
                    {quoteUnavailable ? '—' : `${formatPrice(nftBuyCalc.amountUsd)} ${symbol}`}
                  </span>
                </div>
                {livePrice > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-textSecondary">{t('you_receive')}</span>
                    <span className="font-mono text-textPrimary">
                      {t('nft_trade_you_receive_coin', { qty: nftBuyCalc.qtyWish })}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('amount_label')}</span>
                  <span className="font-mono text-textPrimary">
                    {formatPrice(convertToUsd(parseFloat(spotAmount.replace(',', '.')) || 0))} {symbol}
                  </span>
                </div>
                {livePrice > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-textSecondary">{t('you_receive')}</span>
                    <span className="font-mono text-neon">
                      ≈ {(convertToUsd(parseFloat(spotAmount.replace(',', '.')) || 0) / livePrice).toFixed(8)} {asset.ticker}
                    </span>
                  </div>
                )}
              </>
            ))}
          {showSpotConfirm === 'sell' &&
            (isNft ? (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">{t('nft_trade_quantity')}</span>
                  <span className="font-mono text-textPrimary">× {nftSellRawWish}</span>
                </div>
                {livePrice > 0 ? (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-textSecondary">{t('you_receive')}</span>
                    <span className="font-mono text-neon tabular-nums">
                      ≈ {formatPrice(nftSellProceedsUsd)} {symbol}
                    </span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-textSecondary">
                    {asset.ticker} — {t('amount_label')}
                  </span>
                  <span className="font-mono text-textPrimary">{spotQuantity || '0'}</span>
                </div>
                {livePrice > 0 ? (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-textSecondary">{t('you_receive')}</span>
                    <span className="font-mono text-neon">
                      ≈ {formatPrice((parseFloat(spotQuantity) || 0) * livePrice)} {symbol}
                    </span>
                  </div>
                ) : null}
              </>
            ))}
        </div>
        <BottomSheetFooter
          onCancel={() => setShowSpotConfirm(null)}
          onConfirm={handleSpotConfirmWithPin}
          confirmLabel={t('confirm')}
          confirmLoading={spotLoading}
        />
      </BottomSheet>

      {/* SUCCESS ANIMATION OVERLAY */}
      {showSuccess && (
        <div
          className="fixed left-0 right-0 top-0 bottom-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          style={{ zIndex: Z_INDEX.modal }}
          role="dialog"
          aria-live="polite"
        >
          <div
            className="flex flex-col items-center px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center justify-center h-24 w-24 rounded-full bg-up/20 mb-4 animate-deal-success">
              <div className="absolute inset-0 rounded-full border-2 border-up animate-ping opacity-20" />
              <CheckCircle2 size={52} className="text-up" strokeWidth={3} />
            </div>
            <h3 className="text-xl font-bold text-textPrimary tracking-wide">{t('deal_created')}</h3>
            <p className="text-textMuted mt-2 text-sm font-mono">{t('going_to_portfolio')}</p>
            <button
              type="button"
              onClick={() => {
                setShowSuccess(false);
                onBack();
              }}
              className="mt-6 px-6 py-3 rounded-xl bg-neon text-black font-bold active:scale-95"
            >
              {t('view_positions')}
            </button>
          </div>
        </div>
      )}

      {/* ASSET SEARCH OVERLAY */}
      {showAssetSearch && (
        <div className="fixed left-0 right-0 top-0 bottom-0 z-[60] bg-background animate-fade-in">
          <div className="h-full w-full max-w-md mx-auto flex flex-col">
            <PageHeader
              title={t('search_pair')}
              onBack={() => {
                Haptic.tap();
                setShowAssetSearch(false);
              }}
            />
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar scroll-app">
              <CoinsPage
                onNavigateToTrading={(a, opts) => {
                  Haptic.light();
                  onChangeAsset?.(a, opts);
                  setShowAssetSearch(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* MARGIN MODE BOTTOM SHEET */}
      {showMarginSheet && (
        <BottomSheet
          open
          onClose={() => setShowMarginSheet(false)}
          title={t('margin_mode_title')}
        >
          <div className="space-y-4 pb-4">
            <div className="flex gap-2 p-1 bg-surface rounded-full app-border">
              {(['isolated', 'cross'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { Haptic.tap(); setMarginMode(mode); }}
                  className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 ${
                    marginMode === mode ? 'bg-neon text-black border border-transparent' : 'text-textSecondary hover:bg-white/[0.04]'
                  }`}
                >
                  {mode === 'isolated' ? t('margin_isolated') : t('margin_cross')}
                </button>
              ))}
            </div>

            <div className="space-y-3 px-1">
              <div className="p-3 rounded-xl bg-surface app-border">
                <h4 className="text-xs font-bold text-textPrimary mb-1 uppercase tracking-wider">{t('margin_isolated')}</h4>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  {t('margin_isolated_desc')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface app-border">
                <h4 className="text-xs font-bold text-textPrimary mb-1 uppercase tracking-wider">{t('margin_cross')}</h4>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  {t('margin_cross_desc')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { Haptic.tap(); setShowMarginSheet(false); }}
              className="w-full h-12 rounded-full bg-neon text-black font-bold active:scale-95 transition-transform mt-2"
            >
              {t('confirm')}
            </button>
          </div>
        </BottomSheet>
      )}

      {orderTicketOpen && isNft && asset.nft && (
        <NftOrderTicket
          mode="buy"
          nftLabel={`${asset.nft.collectionName} ${asset.nft.codeDisplay}`}
          imageUrl={asset.nft.imageUrl}
          defaultPriceUsd={livePrice}
          submitting={nftOrdering}
          onSubmit={submitNftOrder}
          onClose={() => setOrderTicketOpen(false)}
        />
      )}

      {nftSellTicketOpen && isNft && asset.nft && (
        <NftOrderTicket
          mode="sell"
          nftLabel={`${asset.nft.collectionName} ${asset.nft.codeDisplay}${nftSellCommittedWish > 1 ? ` ×${nftSellCommittedWish}` : ''}`}
          imageUrl={asset.nft.imageUrl}
          defaultPriceUsd={nftSellProceedsUsd || livePrice}
          quantity={nftSellCommittedWish}
          submitting={nftOrdering}
          onSubmit={submitNftSellListing}
          onClose={() => setNftSellTicketOpen(false)}
        />
      )}

    </div>
  );
};

export default TradingPage;
