import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { CheckCircle2, Clock3, Gem, MessageCircle, Plus, Store, TrendingUp, UserRound, Wallet, XCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { Haptic } from '../utils/haptics';
import { listNftCollections, nftTickerForListing, searchNftListingsByMarketQuery, type NftCollectionSummary, type NftListingRow } from '../lib/nftCatalog';
import { useNftReferrerPriceMap } from '../lib/nftReferrerPricing';
import {
  createOwnNft,
  getMyNftOwned,
  getListedUserNfts,
  buyListedUserNft,
  sellOwnedNftMarket,
  createOwnedNftSellOrder,
  unlistOwnedNft,
  getMyNftOrders,
  fakeNftSeller,
  nftOrderStatusMeta,
  nftOwnedStatusMeta,
  type NftOrderRow,
  type NftOwnedRow,
  type NftStatusTone,
} from '../lib/nftOrders';
import { APP_TOP_BAR_CLASS, APP_TOP_BAR_STYLE } from '../components/appTopBar';
import NftOrderTicket from '../components/NftOrderTicket';
import AppInput from '../components/AppInput';
import TopSearchControl from '../components/TopSearchControl';
import { fetchAssetPricesInUsd } from '../lib/cryptoPrices';

interface NFTHubPageProps {
  onOpenCollection: (slug: string) => void;
  onOpenListing?: (slug: string, codeKey: string) => void;
  onOpenChat?: (ctx: {
    orderId: number;
    buyerId: number;
    workerId: number | null;
    title: string;
    imageUrl?: string | null;
    collectionName?: string | null;
    nftCode?: string | null;
    sellerName?: string | null;
    status?: string | null;
  }) => void;
}

type HubTab = 'market' | 'mine' | 'chats' | 'create';

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

function nftOrderTitle(order: Pick<NftOrderRow, 'collection_name' | 'nft_code'>): string {
  const collection = String(order.collection_name ?? 'NFT').trim() || 'NFT';
  const code = String(order.nft_code ?? '').trim();
  return code ? `${collection} #${code}` : collection;
}

function usd(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[№#]/g, ' ')
    .replace(/[^a-z0-9а-яёіїєґ\s._-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchBlob(parts: unknown[]): string {
  return normalizeSearch(parts.filter((part) => part != null && String(part).trim()).join(' '));
}

function listingSearchText(row: NftListingRow): string {
  return searchBlob([
    row.collectionName,
    row.collectionSlug,
    row.codeDisplay,
    row.codeKey,
    row.spotTicker,
    nftTickerForListing(row),
    row.priceEth,
    row.customPriceUsd,
  ]);
}

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function buildSparkValues(seed: string, base: number): number[] {
  const h = stableHash(seed);
  const drift = ((h % 21) - 8) / 1000;
  const volatility = 0.012 + ((h >> 5) % 9) / 1000;
  return Array.from({ length: 18 }, (_, i) => {
    const wave = Math.sin((i + (h % 7)) * 0.72) * volatility;
    const micro = ((((h >> (i % 12)) & 7) - 3) / 1000);
    return Math.max(base * (1 + drift * i + wave + micro), 0.01);
  });
}

function sparkPath(values: number[], width = 178, height = 54): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-9);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * (height - 8) - 4;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

const NftSparkChart: React.FC<{ collection: NftCollectionSummary; ethUsd: number; onOpen: () => void }> = ({ collection, ethUsd, onOpen }) => {
  const floorUsd = Math.max(collection.floorEth * Math.max(ethUsd, 0), collection.floorEth);
  const values = useMemo(() => buildSparkValues(collection.slug, floorUsd), [collection.slug, floorUsd]);
  const path = useMemo(() => sparkPath(values), [values]);
  const first = values[0] ?? floorUsd;
  const last = values[values.length - 1] ?? floorUsd;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-w-[15.5rem] flex-1 rounded-xl bg-surfaceElevated p-3 text-left app-border active:scale-[0.99] transition-transform"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-bold text-textPrimary truncate">{collection.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${up ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
              {up ? '+' : ''}{change.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1 text-[18px] font-mono font-bold text-textPrimary tabular-nums">
            ${floorUsd.toLocaleString('en-US', { maximumFractionDigits: floorUsd >= 100 ? 0 : 2 })}
          </div>
        </div>
        <div className="h-9 w-9 rounded-xl bg-background/50 overflow-hidden shrink-0">
          <img src={collection.coverUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      </div>
      <svg viewBox="0 0 178 54" className="mt-3 h-[54px] w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`nft-spark-${collection.slug}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={up ? '#21B053' : '#FF4D4D'} stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2196F3" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke={`url(#nft-spark-${collection.slug})`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`${path} L 178 54 L 0 54 Z`} fill={up ? 'rgba(33,176,83,0.08)' : 'rgba(255,77,77,0.08)'} />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[10px] text-textMuted">
        <span>Floor USD</span>
        <span className="font-mono">{collection.itemCount} items</span>
      </div>
    </button>
  );
};

const NFTHubPage: React.FC<NFTHubPageProps> = ({ onOpenCollection, onOpenListing, onOpenChat }) => {
  const { t: rawT } = useLanguage();
  // rawT возвращает сам ключ при отсутствии перевода; для паттерна `t('k') || 'fallback'`
  // нам нужен falsy-результат, поэтому маппим отсутствующий перевод в пустую строку.
  const t = (key: string) => { const v = rawT(key); return v === key ? '' : v; };
  const { user, settings, refreshUser } = useUser();
  const toast = useToast();
  const refPrices = useNftReferrerPriceMap();

  const [tab, setTab] = useState<HubTab>('market');
  const [searchQuery, setSearchQuery] = useState('');
  const [ethUsd, setEthUsd] = useState(0);
  const collections = useMemo<NftCollectionSummary[]>(() => listNftCollections(refPrices), [refPrices]);
  const searchNeedle = useMemo(() => normalizeSearch(searchQuery), [searchQuery]);
  const searchActive = searchNeedle.length >= 2;

  useEffect(() => {
    let cancelled = false;
    const loadEth = async () => {
      try {
        const prices = await fetchAssetPricesInUsd(['ETH']);
        const next = prices.ETH?.price ?? 0;
        if (!cancelled && Number.isFinite(next) && next > 0 && !prices.ETH?.unavailable) {
          setEthUsd(next);
        }
      } catch {
        /* keep previous ETH price */
      }
    };
    void loadEth();
    const intervalId = window.setInterval(loadEth, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  // ── Маркет перепродажи (листинги пользователей) ─────────────────────────────
  const [resale, setResale] = useState<NftOwnedRow[]>([]);
  const [buyingId, setBuyingId] = useState<number | null>(null);

  const reloadResale = useCallback(async () => {
    const rows = await getListedUserNfts(user?.user_id ?? null);
    setResale(rows);
  }, [user?.user_id]);

  useEffect(() => {
    if (tab === 'market') void reloadResale();
  }, [tab, reloadResale]);

  useEffect(() => {
    if (tab !== 'market') return;
    const intervalId = window.setInterval(() => {
      void reloadResale();
    }, 7000);
    return () => window.clearInterval(intervalId);
  }, [tab, reloadResale]);

  const handleBuyResale = async (row: NftOwnedRow) => {
    if (!user) { toast.show(t('nft_buy_login') || 'Войдите, чтобы купить', 'error'); return; }
    if (buyingId) return;
    const price = Number(row.list_price_usd);
    const balance = Number(user.balance ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      toast.show(t('nft_action_failed') || 'Не удалось', 'error');
      return;
    }
    if (price > balance) {
      toast.show(rawT('insufficient_balance'), 'error');
      return;
    }
    setBuyingId(row.id);
    Haptic.medium();
    try {
      const order = await buyListedUserNft(user.user_id, row);
      if (order) { toast.show(t('nft_buy_order_sent') || 'Заявка отправлена продавцу. Ожидайте подтверждения.', 'success'); void reloadResale(); }
      else toast.show(t('nft_action_failed') || 'Не удалось', 'error');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const message =
        code === 'INSUFFICIENT_BALANCE'
          ? rawT('insufficient_balance')
          : code === 'NFT_NOT_AVAILABLE'
            ? 'NFT уже снят с продажи'
            : (t('nft_action_failed') || 'Не удалось');
      toast.show(message, 'error');
    } finally {
      setBuyingId(null);
    }
  };

  const catalogSearchResults = useMemo(() => {
    if (!searchActive) return [];
    const primary = searchNftListingsByMarketQuery(searchQuery);
    const primaryKeys = new Set(primary.map((row) => `${row.collectionSlug}:${row.codeKey}`));
    const fuzzy = searchNftListingsByMarketQuery(searchNeedle)
      .filter((row) => !primaryKeys.has(`${row.collectionSlug}:${row.codeKey}`));
    return [...primary, ...fuzzy].slice(0, 16);
  }, [searchActive, searchNeedle, searchQuery]);

  const collectionSearchResults = useMemo(() => {
    if (!searchActive) return collections;
    return collections
      .filter((collection) => searchBlob([collection.name, collection.slug, collection.floorEth, collection.itemCount]).includes(searchNeedle))
      .slice(0, 8);
  }, [collections, searchActive, searchNeedle]);

  const resaleSearchResults = useMemo(() => {
    if (!searchActive) return resale;
    return resale.filter((row) => {
      const seller = fakeNftSeller({
        id: row.id,
        seller_id: row.user_id,
        worker_id: null,
        collection_name: row.collection_name,
        nft_code: row.nft_code,
      });
      const meta = nftOwnedStatusMeta(row.status);
      return searchBlob([
        row.id,
        row.collection_name,
        row.nft_code,
        row.nft_listing_id,
        row.list_price_usd,
        row.acquired_price_usd,
        row.status,
        meta.label,
        seller.name,
        seller.username,
        seller.rating,
      ]).includes(searchNeedle);
    }).slice(0, 12);
  }, [resale, searchActive, searchNeedle]);

  const openListing = useCallback((row: NftListingRow) => {
    Haptic.medium();
    if (onOpenListing) onOpenListing(row.collectionSlug, row.codeKey);
    else onOpenCollection(row.collectionSlug);
  }, [onOpenCollection, onOpenListing]);

  // ── Мои NFT ────────────────────────────────────────────────────────────────
  const [owned, setOwned] = useState<NftOwnedRow[]>([]);
  const [loadingOwned, setLoadingOwned] = useState(false);
  const [chatOrders, setChatOrders] = useState<NftOrderRow[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);

  const reloadOwned = useCallback(async (silent = false) => {
    const userId = user?.user_id;
    if (!userId) { setOwned([]); return; }
    if (!silent) setLoadingOwned(true);
    const rows = await getMyNftOwned(userId);
    setOwned(rows);
    setLoadingOwned(false);
  }, [user?.user_id]);

  useEffect(() => {
    if (tab === 'mine') void reloadOwned();
  }, [tab, reloadOwned]);

  useEffect(() => {
    if (tab !== 'mine' || !user?.user_id) return;
    const intervalId = window.setInterval(() => {
      void reloadOwned(true);
    }, 7000);
    return () => window.clearInterval(intervalId);
  }, [tab, user?.user_id, reloadOwned]);

  const reloadChats = useCallback(async (silent = false) => {
    const userId = user?.user_id;
    if (!userId) { setChatOrders([]); return; }
    if (!silent) setLoadingChats(true);
    const orders = await getMyNftOrders(userId, 50);
    setChatOrders(orders);
    setLoadingChats(false);
  }, [user?.user_id]);

  useEffect(() => {
    if (tab === 'chats') void reloadChats();
  }, [tab, reloadChats]);

  useEffect(() => {
    if (tab !== 'chats' || !user?.user_id) return;
    const intervalId = window.setInterval(() => {
      void reloadChats(true);
    }, 7000);
    return () => window.clearInterval(intervalId);
  }, [tab, user?.user_id, reloadChats]);

  const [sellTicket, setSellTicket] = useState<NftOwnedRow | null>(null);
  const [listing, setListing] = useState(false);

  const ownedSellErrorText = (code?: string): string => {
    switch (code) {
      case 'TRADING_BLOCKED':
        return t('trading_blocked_toast') || 'Торговля заблокирована';
      case 'WORKER_NOT_FOUND':
        return t('nft_sell_no_worker') || 'Продажа недоступна: не назначен воркер';
      case 'NFT_NOT_AVAILABLE':
        return t('nft_sell_unavailable') || 'NFT уже продан или недоступен';
      case 'INVALID_PRICE':
        return t('order_price_invalid') || 'Некорректная цена';
      default:
        return t('nft_action_failed') || 'Не удалось';
    }
  };

  // «Мои NFT» → продажа: рыночная (мгновенно) или ордерная (заявка + SMS воркеру).
  const handleOwnedSellSubmit = async (price: number, kind: 'market' | 'order' = 'market') => {
    if (!sellTicket || listing || !user?.user_id) return;
    setListing(true);
    try {
      if (kind === 'market') {
        const res = await sellOwnedNftMarket(user.user_id, sellTicket.id, price);
        if (res.ok) {
          Haptic.success();
          toast.show(`${t('nft_sold_ok') || 'Продано'} · +$${(res.amountUsd ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`, 'success');
          setSellTicket(null);
          void reloadOwned();
          void refreshUser();
        } else {
          toast.show(ownedSellErrorText(res.error), 'error');
        }
      } else {
        const order = await createOwnedNftSellOrder(user.user_id, sellTicket.id, price);
        if (order) {
          Haptic.success();
          toast.show(t('nft_sell_order_sent') || 'Заявка на продажу отправлена. Ожидайте подтверждения.', 'success');
          setSellTicket(null);
          void reloadOwned();
        } else {
          toast.show(ownedSellErrorText(), 'error');
        }
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.show(ownedSellErrorText(code), 'error');
    } finally {
      setListing(false);
    }
  };

  const handleUnlist = async (row: NftOwnedRow) => {
    Haptic.medium();
    const ok = await unlistOwnedNft(row.id);
    if (ok) { toast.show(t('nft_unlisted_ok') || 'Снято с продажи', 'success'); void reloadOwned(); }
    else toast.show(t('nft_action_failed') || 'Не удалось', 'error');
  };

  // ── Создание NFT ─────────────────────────────────────────────────────────
  const creationPrice = Number(settings?.nft_creation_price_usd ?? 0);
  const [cName, setCName] = useState('');
  const [cCode, setCCode] = useState('');
  const [cImage, setCImage] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!user) { toast.show(t('nft_buy_login') || 'Войдите', 'error'); return; }
    if (!cName.trim() || !cCode.trim()) { toast.show(t('nft_create_fill') || 'Заполните название и код', 'error'); return; }
    setCreating(true);
    Haptic.medium();
    const created = await createOwnNft({
      userId: user.user_id,
      collectionName: cName.trim(),
      nftCode: cCode.trim(),
      imageUrl: cImage.trim() || null,
      priceUsd: creationPrice,
    });
    setCreating(false);
    if (created) {
      toast.show(t('nft_created_ok') || 'NFT создан', 'success');
      setCName(''); setCCode(''); setCImage('');
      setTab('mine');
    } else {
      toast.show(t('nft_action_failed') || 'Не удалось', 'error');
    }
  };

  const tabs: { id: HubTab; label: string; icon: React.FC<{ size?: number }> }[] = [
    { id: 'market', label: t('nft_tab_market') || 'Маркет', icon: Store },
    { id: 'mine', label: t('nft_tab_mine') || 'Мои NFT', icon: Wallet },
    { id: 'chats', label: 'Чаты', icon: MessageCircle },
    { id: 'create', label: t('nft_tab_create') || 'Создать', icon: Plus },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className={`${APP_TOP_BAR_CLASS} z-[35] sticky top-0 bg-background/95 backdrop-blur-md border-b border-border`} style={APP_TOP_BAR_STYLE}>
        <div className="flex items-center gap-2 px-4 h-full">
          <Gem size={18} className="text-accent" />
          <span className="text-[15px] font-bold text-textPrimary">NFT</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="app-tabs px-2 overflow-x-auto no-scrollbar shrink-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { Haptic.tap(); setTab(id); }}
            className={`app-tab ${tab === id ? 'app-tab-active' : ''}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] w-full">
        <div className="px-4 lg:px-8 xl:px-12 max-w-[1440px] mx-auto py-4 lg:py-6">
        {tab === 'market' && (
          <div className="space-y-6">
            <section className="mb-4">
              <div>
                <TopSearchControl
                  variant="input"
                  size="lg"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onClear={() => setSearchQuery('')}
                  placeholder="Search collections, NFTs, accounts"
                  className="w-full"
                />
                <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {['Card Geek Hall of Fame #3208', '#3208', 'Wonky Stonks'].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => { Haptic.tap(); setSearchQuery(example); }}
                      className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] text-textMuted active:scale-[0.98] transition-transform"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {searchActive && (
                <div className="p-3 space-y-3">
                  {catalogSearchResults.length > 0 && (
                    <div>
                      <div className="text-[10px] text-textMuted uppercase tracking-wider font-semibold mb-2">Лоты каталога</div>
                      <div className="space-y-2">
                        {catalogSearchResults.map((row) => {
                          const ticker = nftTickerForListing(row);
                          const eth = Number(refPrices[ticker]);
                          const priceEth = Number.isFinite(eth) && eth > 0 ? eth : row.priceEth;
                          return (
                            <button
                              key={`${row.collectionSlug}-${row.codeKey}`}
                              type="button"
                              onClick={() => openListing(row)}
                              className="w-full text-left flex items-center gap-3 rounded-xl app-border bg-background/60 p-2.5 active:scale-[0.99] transition-transform hover:bg-surfaceElevated"
                            >
                              <div className="h-12 w-12 rounded-xl overflow-hidden bg-surface shrink-0">
                                <img src={row.imageUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-[13px] font-bold text-textPrimary shrink-0">{row.codeDisplay}</span>
                                  <span className="text-[12px] text-textSecondary truncate">{row.collectionName}</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-mono text-accent shrink-0">◆ {priceEth.toFixed(priceEth < 0.01 ? 4 : 3)}</span>
                                  <span className="text-[10px] text-textMuted truncate">{ticker}</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold text-accent shrink-0">Открыть</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {collectionSearchResults.length > 0 && (
                    <div>
                      <div className="text-[10px] text-textMuted uppercase tracking-wider font-semibold mb-2">Коллекции</div>
                      <div className="grid grid-cols-2 gap-2">
                        {collectionSearchResults.map((collection) => (
                          <button
                            key={`search-${collection.slug}`}
                            type="button"
                            onClick={() => { Haptic.medium(); onOpenCollection(collection.slug); }}
                            className="rounded-xl app-border bg-background/60 p-2 text-left active:scale-[0.99] transition-transform hover:bg-surfaceElevated"
                          >
                            <div className="aspect-[1.8] rounded-lg overflow-hidden bg-surface mb-2">
                              <img src={collection.coverUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />
                            </div>
                            <div className="text-[12px] font-semibold text-textPrimary truncate">{collection.name}</div>
                            <div className="text-[10px] text-textMuted mt-0.5">Floor ◆ {collection.floorEth.toFixed(2)} · {collection.itemCount}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {resaleSearchResults.length > 0 && (
                    <div>
                      <div className="text-[10px] text-textMuted uppercase tracking-wider font-semibold mb-2">Ресейл</div>
                      <div className="space-y-2">
                        {resaleSearchResults.map((row) => {
                          const seller = fakeNftSeller({
                            id: row.id,
                            seller_id: row.user_id,
                            worker_id: null,
                            collection_name: row.collection_name,
                            nft_code: row.nft_code,
                          });
                          return (
                            <div key={`search-resale-${row.id}`} className="flex items-center gap-3 rounded-xl bg-background/55 p-2.5">
                              <div className="w-11 h-11 rounded-xl overflow-hidden bg-surface shrink-0">
                                {row.image_url && <img src={row.image_url} alt="" className="w-full h-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-semibold text-textPrimary truncate">
                                  {row.collection_name ?? 'NFT'} {row.nft_code ? `#${row.nft_code}` : ''}
                                </div>
                                <div className="text-[10px] text-textMuted truncate mt-0.5">{seller.name} · ★ {seller.rating}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleBuyResale(row)}
                                disabled={buyingId === row.id}
                                className="shrink-0 h-9 px-4 rounded-xl text-[13px] font-bold bg-accent text-white active:scale-[0.97] transition-transform disabled:opacity-50"
                              >
                                {buyingId === row.id ? '…' : usd(row.list_price_usd)}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {catalogSearchResults.length === 0 && collectionSearchResults.length === 0 && resaleSearchResults.length === 0 && (
                    <div className="py-8 text-center">
                      <div className="text-sm font-semibold text-textPrimary">Ничего не найдено</div>
                      <p className="text-[12px] text-textMuted mt-1">Проверьте коллекцию, номер NFT или цену.</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {!searchActive && collections.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-accent" />
                      <h2 className="text-[16px] font-bold text-textPrimary">NFT price charts</h2>
                    </div>
                    <p className="mt-0.5 text-[11px] text-textMuted">Floor movement by collection, USD</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-textMuted">
                    ETH ${ethUsd > 0 ? ethUsd.toFixed(0) : '—'}
                  </span>
                </div>
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                  {collections.slice(0, 4).map((collection) => (
                    <NftSparkChart
                      key={`chart-${collection.slug}`}
                      collection={collection}
                      ethUsd={ethUsd}
                      onOpen={() => { Haptic.medium(); onOpenCollection(collection.slug); }}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Hero-баннер маркетплейса (стиль OpenSea) */}
            {!searchActive && collections[0] && (
              <button
                type="button"
                onClick={() => { Haptic.medium(); onOpenCollection(collections[0]!.slug); }}
                className="relative w-full h-36 lg:h-56 rounded-xl overflow-hidden text-left group"
              >
                <img src={collections[0]!.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                <div className="absolute left-5 bottom-4 right-5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-accent mb-1">{t('nft_featured') || 'В центре внимания'}</div>
                  <div className="text-[18px] lg:text-[24px] font-bold text-white truncate flex items-center gap-2">
                    {collections[0]!.name} <span className="text-accent flex items-center" title="Verified"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg></span>
                  </div>
                  <div className="text-[12px] text-white/70 mt-1">Floor ◆ {collections[0]!.floorEth.toFixed(2)} · {collections[0]!.itemCount} {t('nft_items') || 'шт.'}</div>
                </div>
              </button>
            )}
            <div>
              {searchActive ? (
                <>
                  <h2 className="text-xl font-bold text-textPrimary mb-4">Подходящие коллекции</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 lg:gap-4">
                    {collectionSearchResults.map((c) => (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => { Haptic.medium(); onOpenCollection(c.slug); }}
                        className="nft-card group text-left w-full"
                      >
                        <div className="aspect-square overflow-hidden relative">
                          <img src={c.coverUrl} alt="" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
                        </div>
                        <div className="p-3">
                          <div className="flex items-center gap-1 mb-2">
                            <span className="text-[13px] font-bold text-textPrimary truncate">{c.name}</span>
                            <span className="text-accent shrink-0 flex items-center" title="Verified"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg></span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="stat-cell-label">Floor</div>
                              <div className="stat-cell-value text-[12px]">{c.floorEth.toFixed(2)} ETH</div>
                            </div>
                            <div className="text-right">
                              <div className="stat-cell-label">Items</div>
                              <div className="stat-cell-value text-[12px]">{c.itemCount}</div>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-8 mt-6">
                  {/* Top Collections List */}
                  {collections.length > 1 && (
                    <div>
                      <h2 className="text-xl font-bold text-textPrimary mb-4">{t('nft_top_collections') || 'Топ коллекции'}</h2>
                      <div className="flex flex-col gap-2">
                        {collections.slice(1, 6).map((c, idx) => (
                          <button
                            key={c.slug}
                            type="button"
                            onClick={() => { Haptic.medium(); onOpenCollection(c.slug); }}
                            className="flex items-center gap-4 p-3 rounded-xl hover:bg-surfaceElevated transition-colors text-left w-full group"
                          >
                            <span className="text-sm font-bold text-textMuted w-4 text-center">{idx + 1}</span>
                            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 relative">
                              <img src={c.coverUrl} alt="" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-110" loading="lazy" referrerPolicy="no-referrer" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[15px] font-bold text-textPrimary truncate">{c.name}</span>
                                <span className="text-accent shrink-0 flex items-center" title="Verified"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg></span>
                              </div>
                              <div className="text-[12px] text-textMuted mt-0.5">Floor: <span className="font-medium text-textPrimary">{c.floorEth.toFixed(2)} ETH</span></div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-[14px] font-bold text-textPrimary">{c.itemCount}</div>
                              <div className="text-[11px] text-textMuted mt-0.5">Items</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notable Collections Grid */}
                  {collections.length > 6 && (
                    <div>
                      <h2 className="text-xl font-bold text-textPrimary mb-4">{t('nft_notable_collections') || 'Примечательные'}</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 lg:gap-4">
                        {collections.slice(6).map((c) => (
                          <button
                            key={c.slug}
                            type="button"
                            onClick={() => { Haptic.medium(); onOpenCollection(c.slug); }}
                            className="nft-card group text-left w-full"
                          >
                            <div className="aspect-square overflow-hidden relative">
                              <img src={c.coverUrl} alt="" className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
                            </div>
                            <div className="p-3">
                              <div className="flex items-center gap-1 mb-2">
                                <span className="text-[13px] font-bold text-textPrimary truncate">{c.name}</span>
                                <span className="text-accent shrink-0 flex items-center" title="Verified"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg></span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="stat-cell-label">Floor</div>
                                  <div className="stat-cell-value text-[12px]">{c.floorEth.toFixed(2)} ETH</div>
                                </div>
                                <div className="text-right">
                                  <div className="stat-cell-label">Items</div>
                                  <div className="stat-cell-value text-[12px]">{c.itemCount}</div>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!searchActive && resale.length > 0 && (
              <div className="mt-8">
                <h2 className="text-xl font-bold text-textPrimary mb-4">{t('nft_resale') || 'На продаже от пользователей'}</h2>
                <div className="app-panel overflow-hidden">
                  {resale.map((row) => {
                    const seller = fakeNftSeller({
                      id: row.id,
                      seller_id: row.user_id,
                      worker_id: null,
                      collection_name: row.collection_name,
                      nft_code: row.nft_code,
                    });
                    return (
                      <div key={row.id} className="app-row gap-4">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-background shrink-0 shadow-sm">
                          {row.image_url && <img src={row.image_url} alt="" className="w-full h-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[15px] font-bold text-textPrimary truncate">
                            {row.collection_name ?? 'NFT'} {row.nft_code ? `#${row.nft_code}` : ''}
                          </div>
                          <div className="flex items-center gap-2 mt-1 min-w-0">
                            <span className="text-[13px] text-textSecondary truncate">{seller.name}</span>
                            <span className="app-chip bg-transparent app-border px-1.5 py-0.5 text-[10px]">★ {seller.rating}</span>
                          </div>
                          <div className="text-[14px] font-bold text-accent mt-1">{usd(row.list_price_usd)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBuyResale(row)}
                          disabled={buyingId === row.id}
                          className="shrink-0 h-10 px-5 rounded-xl text-[14px] font-bold bg-accent text-white active:scale-[0.97] transition-all disabled:opacity-50 hover:bg-accent/90"
                        >
                          {buyingId === row.id ? '…' : (t('nft_buy_cta') || 'Купить')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'mine' && (
          <div className="p-3 space-y-2">
            {!user && <div className="text-center text-textMuted text-sm py-12">{t('nft_buy_login') || 'Войдите, чтобы увидеть свои NFT'}</div>}
            {user && loadingOwned && <div className="text-center text-textMuted text-sm py-12">…</div>}
            {user && !loadingOwned && owned.length === 0 && (
              <div className="text-center text-textMuted text-sm py-12">{t('nft_mine_empty') || 'У вас пока нет NFT'}</div>
            )}
            {owned.map((row) => {
              const listed = row.status === 'listed';
              const statusMeta = nftOwnedStatusMeta(row.status);
              return (
                <div key={row.id} className="flex items-center gap-4 p-3 app-border rounded-xl bg-surface">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-background shrink-0 shadow-sm">
                    {row.image_url && <img src={row.image_url} alt="" className="w-full h-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-textPrimary truncate">
                      {row.collection_name ?? 'NFT'} {row.nft_code ? `#${row.nft_code}` : ''}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2 min-w-0">
                      <span className={`app-chip ${statusToneClass(statusMeta.tone).replace('bg-', 'bg-').replace('text-', 'text-')}`}>
                        {statusMeta.label}
                      </span>
                      <span className="text-[13px] text-textSecondary truncate font-medium">
                        {listed
                          ? usd(row.list_price_usd)
                          : (row.is_user_created ? (t('nft_created_badge') || 'Создан вами') : usd(row.acquired_price_usd))}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (listed ? handleUnlist(row) : setSellTicket(row))}
                    className={`shrink-0 h-10 px-5 rounded-xl text-[14px] font-bold active:scale-[0.97] transition-transform ${
                      listed ? 'bg-surface app-border text-textPrimary hover:bg-surfaceElevated' : 'bg-accent text-white hover:bg-accent/90'
                    }`}
                  >
                    {listed ? (t('nft_unlist') || 'Снять') : (t('nft_sell') || 'Продать')}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'chats' && (
          <div className="p-3 space-y-2">
            {!user && <div className="text-center text-textMuted text-sm py-12">{t('nft_buy_login') || 'Войдите, чтобы увидеть чаты'}</div>}
            {user && loadingChats && <div className="text-center text-textMuted text-sm py-12">…</div>}
            {user && !loadingChats && chatOrders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                <div className="h-14 w-14 rounded-xl bg-surfaceElevated flex items-center justify-center mb-3">
                  <MessageCircle size={22} className="text-textMuted" />
                </div>
                <div className="text-sm font-semibold text-textPrimary">Чатов пока нет</div>
                <p className="text-[12px] text-textMuted mt-1 leading-snug">
                  Откройте NFT и напишите продавцу или создайте ордер на покупку.
                </p>
              </div>
            )}
            {chatOrders.map((order) => {
              const meta = nftOrderStatusMeta(order.status, order.side);
              const seller = fakeNftSeller(order);
              const canOpen = Boolean(onOpenChat);
              const title = nftOrderTitle(order);
              const StatusIcon =
                meta.tone === 'success'
                  ? CheckCircle2
                  : meta.tone === 'danger'
                    ? XCircle
                    : meta.tone === 'pending'
                      ? Clock3
                      : MessageCircle;
              return (
                <button
                  key={order.id}
                  type="button"
                  disabled={!canOpen}
                  onClick={() => {
                    if (!onOpenChat || !user?.user_id) return;
                    Haptic.medium();
                    onOpenChat({
                      orderId: order.id,
                      buyerId: user.user_id,
                      workerId: order.worker_id ?? user.referrer_id ?? null,
                      title,
                      imageUrl: order.image_url,
                      collectionName: order.collection_name,
                      nftCode: order.nft_code,
                      sellerName: seller.name,
                      status: order.status,
                    });
                  }}
                  className="w-full text-left rounded-xl app-border bg-surface p-3 active:scale-[0.99] transition-all hover:bg-surfaceElevated disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-surface shrink-0">
                      {order.image_url ? (
                        <img src={order.image_url} alt="" className="w-full h-full object-cover object-top" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Gem size={18} className="text-accent" />
                        </div>
                      )}
                      <div className="absolute -right-1 -bottom-1 h-6 w-6 rounded-full bg-background ring-2 ring-surfaceElevated flex items-center justify-center">
                        <UserRound size={13} className="text-accent" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-semibold text-textPrimary truncate">{seller.name}</span>
                        <span className="text-[10px] text-amber-300 shrink-0">★ {seller.rating}</span>
                      </div>
                      <div className="text-[12px] text-textSecondary truncate mt-0.5">{title}</div>
                      <div className="flex items-center gap-2 mt-2 min-w-0">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${statusToneClass(meta.tone)}`}>
                          <StatusIcon size={11} />
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-textMuted truncate">{seller.username}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-mono font-bold text-accent">{usd(order.price_usd)}</div>
                      <div className="text-[10px] text-textMuted mt-1">{order.side === 'sell' ? 'ресейл' : 'ордер'}</div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-textMuted leading-snug line-clamp-2">{meta.detail}</p>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'create' && (
          <div className="p-4 space-y-3">
            <div className="rounded-xl app-border bg-surface p-3 text-[12px] text-textSecondary">
              {t('nft_create_hint') || 'Создайте собственный NFT. Стоимость создания:'}{' '}
              <span className="font-bold text-accent">{creationPrice > 0 ? `$${creationPrice}` : (t('nft_create_free') || 'бесплатно')}</span>
            </div>
            <div className="space-y-2">
              <AppInput
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder={t('nft_create_name') || 'Название коллекции'}
              />
              <AppInput
                value={cCode}
                onChange={(e) => setCCode(e.target.value)}
                placeholder={t('nft_create_code') || 'Код / номер (напр. 1024)'}
              />
              <AppInput
                value={cImage}
                onChange={(e) => setCImage(e.target.value)}
                placeholder={t('nft_create_image') || 'URL изображения (необязательно)'}
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-3.5 rounded-full font-semibold text-sm text-black bg-accent active:scale-95 transition-transform disabled:opacity-50"
            >
              {creating ? '…' : (t('nft_create_cta') || 'Создать NFT')}
            </button>
          </div>
        )}
        </div>
      </div>

      {sellTicket && (
        <NftOrderTicket
          mode="sell"
          sellKinds
          nftLabel={`${sellTicket.collection_name ?? 'NFT'}${sellTicket.nft_code ? ` #${sellTicket.nft_code}` : ''}`}
          imageUrl={sellTicket.image_url}
          defaultPriceUsd={Number(sellTicket.list_price_usd ?? sellTicket.acquired_price_usd ?? 0)}
          submitting={listing}
          onSubmit={handleOwnedSellSubmit}
          onClose={() => setSellTicket(null)}
        />
      )}
    </div>
  );
};

export default NFTHubPage;
