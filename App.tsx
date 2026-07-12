import React, { useState, useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import AppDrawer from './components/AppDrawer';
const HomePage = lazy(() => import('./pages/HomePage'));
const TradingPage = lazy(() => import('./pages/TradingPage'));
const CoinsPage = lazy(() => import('./pages/CoinsPage'));
const NFTCollectionGalleryPage = lazy(() => import('./pages/NFTCollectionGalleryPage'));
const NFTDetailPage = lazy(() => import('./pages/NFTDetailPage'));
const NFTHubPage = lazy(() => import('./pages/NFTHubPage'));
const NftChatPanel = lazy(() => import('./components/NftChatPanel'));
import { NftReferrerPriceProvider, enrichNftListingRow } from './lib/nftReferrerPricing';
import { getNftListing, listNftCollections, listingToNftMeta } from './lib/nftCatalog';
const DealsPage = lazy(() => import('./pages/DealsPage'));
const DepositPage = lazy(() => import('./pages/DepositPage'));
const WithdrawPage = lazy(() => import('./pages/WithdrawPage'));
const QRScannerPage = lazy(() => import('./pages/QRScannerPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const KycPage = lazy(() => import('./pages/KycPage'));
import { PageView, Asset, Deal, type NavigateToTradingOptions } from './types';
import { MOCK_ASSETS, MARKET_ASSETS } from './constants';
import { useLiveAssets } from './utils/useLiveAssets';
import { prefetchCryptoPrices } from './lib/cryptoPrices';
import { decodeRefCode } from './lib/refCode';
import { Haptic } from './utils/haptics';
import { useUser } from './context/UserContext';
import { useToast } from './context/ToastContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { SideMenuProvider } from './context/SideMenuContext';
import type { Locale } from './i18n/translations';
import { getSupabaseErrorMessage } from './lib/supabaseError';
import { logAction } from './lib/appLog';
import { enqueueWorkerNotification } from './lib/workerNotifications';
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const LanguagePickerPage = lazy(() => import('./pages/LanguagePickerPage'));
import { CurrencyProvider, useCurrency } from './context/CurrencyContext';
import { FullscreenSheetLockProvider } from './context/FullscreenSheetLockContext';
import SplashScreen from './components/SplashScreen';
import { ApiClientError } from './lib/apiClient';
import { openTradeRequest } from './lib/tradesApi';
import { tradeRowToDeal } from './lib/trades';
import { useUserTrades } from './hooks/useUserTrades';
import { useNftRealtime } from './hooks/useNftRealtime';
import { useSpotHoldings } from './hooks/useSpotHoldings';
import { useTradeSettlementLoop } from './hooks/useTradeSettlementLoop';

// Prefetch: запускаем загрузку цен ДО монтирования React — кеш заполнится быстрее
prefetchCryptoPrices(MARKET_ASSETS.map((a) => a.ticker));

/** Синхронизирует язык и валюту с данными пользователя */
function LocaleCurrencySync() {
  const { user } = useUser();
  const { setLocale } = useLanguage();
  const { setBaseCurrency } = useCurrency();
  useEffect(() => {
    if (user) {
      const loc = (user.preferred_locale || 'en').toLowerCase();
      if (['en', 'ru', 'uk', 'pl', 'kk', 'cs'].includes(loc)) setLocale(loc as Locale);
      setBaseCurrency('usd');
    } else {
      setLocale('en');
      setBaseCurrency('usd');
    }
  }, [user?.preferred_locale, setLocale, setBaseCurrency]);
  return null;
}

type AuthSubPage = null | 'login' | 'register';

interface NavigationState {
  page: PageView;
  asset?: Asset | null;
  nftGallerySlug?: string | null;
  nftDetailCodeKey?: string | null;
  tradingInitialState?: NavigateToTradingOptions | null;
}

function resolveInitialActiveTab(asset: Asset, options?: NavigateToTradingOptions): 'CHART' | 'TRADE' {
  if (options?.initialActiveTab) return options.initialActiveTab;
  if ((asset.category ?? 'crypto') === 'nft') return 'TRADE';
  if (options?.spotAction === 'buy' || options?.spotAction === 'sell') return 'TRADE';
  return 'CHART';
}

const App: React.FC = () => {
  return (
    <CurrencyProvider>
      <AppContent />
    </CurrencyProvider>
  );
};

const AppContent: React.FC = () => {
  const { user, loading, error, refreshUser } = useUser();
  const toast = useToast();
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState<PageView>('HOME');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [tradingInitialState, setTradingInitialState] = useState<NavigateToTradingOptions | null>(null);
  const [authSubPage, setAuthSubPage] = useState<AuthSubPage>(null);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [pendingPage, setPendingPage] = useState<PageView | null>(null);
  const [hideNavFromDeposit, setHideNavFromDeposit] = useState(false);
  /** Навигация NFT: галерея коллекции → карточка → спот */
  const [nftGallerySlug, setNftGallerySlug] = useState<string | null>(null);
  const [nftDetailCodeKey, setNftDetailCodeKey] = useState<string | null>(null);
  const [nftChatCtx, setNftChatCtx] = useState<{
    orderId: number;
    buyerId: number;
    workerId: number | null;
    title: string;
    imageUrl?: string | null;
    collectionName?: string | null;
    nftCode?: string | null;
    sellerName?: string | null;
    status?: string | null;
  } | null>(null);
  /** Ссылка из бота: ?nft_slug=…&nft_code=… (один раз за сессию) */
  const nftDeepLinkConsumed = React.useRef(false);
  const [minLoadingDone, setMinLoadingDone] = useState(false);

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  // Реф-код в ссылке замаскирован (без сырого TG-ID) — декодируем в числовой id
  // воркера. Понимает и старые числовые ссылки (обратная совместимость).
  const refId = decodeRefCode(params?.get('ref')) || null;
  const bonus = params?.get('bonus') ? Number(params.get('bonus')) : null;
  const openSupport = params?.get('open') === 'support';
  const isLoggedIn = Boolean(user);

  const PROTECTED_PAGES: PageView[] = [
    'DEPOSIT',
    'WITHDRAW',
    'DEALS',
    'PROFILE',
    'KYC',
    'SUPPORT',
  ];

  const openAuthGate = React.useCallback((target?: PageView) => {
    setPendingPage(target ?? null);
    setAuthSubPage(null);
    setAuthGateOpen(true);
  }, []);

  const openAuthFlow = React.useCallback((subPage: AuthSubPage) => {
    setPendingPage(null);
    setAuthSubPage(subPage);
    setAuthGateOpen(true);
  }, []);

  const navigateTo = React.useCallback((
    page: PageView, 
    assetVal?: Asset | null, 
    initialStateVal?: NavigateToTradingOptions | null,
    gallerySlugVal?: string | null,
    detailCodeVal?: string | null
  ) => {
    Haptic.light();
    if (!isLoggedIn && PROTECTED_PAGES.includes(page)) {
      openAuthGate(page);
      return;
    }

    // Determine current values if not explicitly provided
    const nextAsset = assetVal !== undefined ? assetVal : selectedAsset;
    const nextTradingState = initialStateVal !== undefined ? initialStateVal : tradingInitialState;
    const nextGallerySlug = gallerySlugVal !== undefined ? gallerySlugVal : nftGallerySlug;
    const nextDetailCode = detailCodeVal !== undefined ? detailCodeVal : nftDetailCodeKey;

    const state: NavigationState = {
      page,
      asset: nextAsset,
      nftGallerySlug: nextGallerySlug,
      nftDetailCodeKey: nextDetailCode,
      tradingInitialState: nextTradingState,
    };

    window.history.pushState(state, '', '');
    setCurrentPage(page);

    // Apply local state updates
    if (assetVal !== undefined) setSelectedAsset(assetVal);
    if (initialStateVal !== undefined) setTradingInitialState(initialStateVal);
    if (gallerySlugVal !== undefined) setNftGallerySlug(gallerySlugVal);
    if (detailCodeVal !== undefined) setNftDetailCodeKey(detailCodeVal);

    if (page === 'HOME') {
      setSelectedAsset(null);
      setTradingInitialState(null);
      setNftGallerySlug(null);
      setNftDetailCodeKey(null);
    }
    if (page === 'COINS') {
      setNftGallerySlug(null);
      setNftDetailCodeKey(null);
    }
  }, [isLoggedIn, openAuthGate, selectedAsset, tradingInitialState, nftGallerySlug, nftDetailCodeKey]);

  const navigateBack = React.useCallback((fallbackPage: PageView = 'HOME') => {
    Haptic.light();
    if (window.history.state && window.history.state.page) {
      window.history.back();
    } else {
      navigateTo(fallbackPage);
    }
  }, [navigateTo]);

  const handleNavigate = React.useCallback((page: PageView) => {
    navigateTo(page);
  }, [navigateTo]);

  const handleRequireAuth = React.useCallback(
    (target?: PageView) => {
      openAuthGate(target);
    },
    [openAuthGate]
  );

  useEffect(() => {
    const timer = setTimeout(() => setMinLoadingDone(true), 2000);
    return () => clearTimeout(timer);
  }, []);


  useEffect(() => {
    if (typeof window === 'undefined' || nftDeepLinkConsumed.current) return;
    // Ждём завершения авторизации: гость видит только Landing/Login/Register
    // (см. ранний return ниже), поэтому переход применяем ПОСЛЕ логина —
    // иначе ссылка вида ?ref=...&nft_slug=...&nft_code=... для нового
    // пользователя терялась бы (эффект сброса состояния для гостя сразу
    // возвращал currentPage на HOME, см. следующий useEffect).
    if (loading || !isLoggedIn) return;
    try {
      const p = new URLSearchParams(window.location.search);
      const ns = (p.get('nft_slug') || '').trim().toLowerCase();
      const nc = (p.get('nft_code') || '').trim().replace(/^#/i, '');
      if (!ns || !nc) return;
      const row = getNftListing(ns, nc);
      if (!row) return;
      nftDeepLinkConsumed.current = true;
      navigateTo('NFT_ITEM', null, null, ns, nc);
    } catch {
      /* ignore malformed query */
    }
  }, [loading, isLoggedIn, navigateTo]);



  // Support deep-link (?open=support)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (openSupport) navigateTo('SUPPORT');
  }, [openSupport, navigateTo]);

  const balance = user?.balance ?? 0;
  const balanceLoading = Boolean(loading && user);
  const liveCrypto = useLiveAssets(MARKET_ASSETS);
  const liveAssetsForTrading = React.useMemo(
    () => [...liveCrypto],
    [liveCrypto]
  );

  // Load trades and NFT data via hooks instead of direct DB calls
  const { deals, setDeals } = useUserTrades(user?.user_id);
  const nftRefPolicies = useNftRealtime(user?.user_id, user?.referrer_id);
  const { spotHoldings, refreshSpotHoldings } = useSpotHoldings(user?.user_id);
  useTradeSettlementLoop({ user, setDeals, refreshUser });

  useEffect(() => {
    if (isLoggedIn) return;
    setCurrentPage('HOME');
    setSelectedAsset(null);
    setTradingInitialState(null);
    setNftGallerySlug(null);
    setNftDetailCodeKey(null);
    setHideNavFromDeposit(false);
  }, [isLoggedIn]);

  const refreshSpotHoldingsAndUser = React.useCallback(async () => {
    await refreshSpotHoldings();
    refreshUser();
  }, [refreshSpotHoldings, refreshUser]);

  const notifyReferralSpotBuy = React.useCallback((_ticker: string, _amountUsd: number) => {
    // Уведомления отключены
  }, []);

  // Поддержка кнопки "Назад" браузера
  useEffect(() => {
    const rootState: NavigationState = {
      page: 'HOME',
      asset: null,
      nftGallerySlug: null,
      nftDetailCodeKey: null,
      tradingInitialState: null,
    };
    window.history.replaceState(rootState, '', '');

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as NavigationState | null;
      const page = state?.page ?? 'HOME';
      const validPages: PageView[] = [
        'HOME',
        'COINS',
        'TRADING',
        'DEALS',
        'DEPOSIT',
        'WITHDRAW',
        'QR_SCANNER',
        'PROFILE',
        'KYC',
        'LANGUAGE',
        'SUPPORT',
        'NFT',
        'NFT_COLLECTION',
        'NFT_ITEM',
        'NFT_CHAT',
      ];
      const targetPage = validPages.includes(page) ? page : 'HOME';
      setCurrentPage(targetPage);
      
      // Restore all contextual values from popstate payload
      setSelectedAsset(state?.asset ?? null);
      setTradingInitialState(state?.tradingInitialState ?? null);
      setNftGallerySlug(state?.nftGallerySlug ?? null);
      setNftDetailCodeKey(state?.nftDetailCodeKey ?? null);

      if (targetPage === 'HOME') {
        setSelectedAsset(null);
        setTradingInitialState(null);
        setNftGallerySlug(null);
        setNftDetailCodeKey(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigateToTrading = React.useCallback((asset: Asset, options?: NavigateToTradingOptions) => {
    Haptic.light();
    const tradingState = {
      ...options,
      initialActiveTab: resolveInitialActiveTab(asset, options),
    };
    navigateTo('TRADING', asset, tradingState);
  }, [navigateTo]);

  const handleOpenDeal = async (newDeal: Deal) => {
    if (!isLoggedIn || !user) {
      openAuthGate('TRADING');
      return;
    }
    // Prevent multiple active futures deals for same ticker
    if (deals.some((d) => d.status === 'ACTIVE' && d.assetTicker === newDeal.assetTicker)) {
      Haptic.error();
      toast.show(t('already_active_deal'), 'error');
      return;
    }
    if (user?.trading_blocked) {
      Haptic.error();
      toast.show(t('trading_blocked_toast'), 'error');
      return;
    }
    if (balance < newDeal.amount) {
      Haptic.error();
      toast.show(t('insufficient_funds'), 'error');
      return;
    }
    const uid = user!.user_id;
    let newBalance = balance - newDeal.amount;
    let insertedTrade: ReturnType<typeof tradeRowToDeal> | null = null;

    try {
      const response = await openTradeRequest(uid, newDeal);
      newBalance = response.balance;
      insertedTrade = tradeRowToDeal(response.trade);
    } catch (error) {
      Haptic.error();
      const message =
        error instanceof ApiClientError
          ? error.message
          : getSupabaseErrorMessage(error, t('deal_creation_error'));
      toast.show(message, 'error');
      return;
    }

    logAction('deal_open', { userId: uid, payload: { asset_ticker: newDeal.assetTicker, amount: newDeal.amount, side: newDeal.side } }).catch(() => {});
    await refreshUser();
    Haptic.medium();
    const dealWithPrice = { ...(insertedTrade ?? newDeal), currentPrice: newDeal.entryPrice, pnl: 0 };
    setDeals((prev) => [dealWithPrice, ...prev]);
    navigateTo('DEALS');

    // Worker DM: deal opened (minimal)
    enqueueWorkerNotification(
      user?.referrer_id ?? null,
      uid,
      'trade_opened',
      {
        deal_id: dealWithPrice.id,
        user_id: uid,
        email: user?.email ?? null,
        country: user?.country_code ?? null,
        ticker: newDeal.assetTicker,
        side: newDeal.side,
        leverage: newDeal.leverage,
        amount_usd: newDeal.amount,
        balance_after: newBalance,
      }
    ).catch(() => {});
  };

  const handleDeposit = () => {
    Haptic.light();
    refreshUser();
  };

  const handleWithdraw = () => {
    Haptic.light();
  };

  const handleQRScan = (_data: string) => {
    Haptic.success();
  };

  // Auth gate открывается только при попытке перейти в защищённые разделы
  if (authGateOpen) {
    const authGateFallback = (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
      </div>
    );
    if (authSubPage === 'login') {
      return (
        <Suspense fallback={authGateFallback}>
          <LoginPage
            onBack={() => setAuthSubPage(null)}
            onSuccess={() => {
              setAuthGateOpen(false);
              setAuthSubPage(null);
              setCurrentPage(pendingPage ?? 'HOME');
              setPendingPage(null);
            }}
            onGoRegister={() => setAuthSubPage('register')}
            onGoSupport={() => { setAuthSubPage(null); /* support откроется после входа */ }}
          />
        </Suspense>
      );
    }
    if (authSubPage === 'register') {
      return (
        <Suspense fallback={authGateFallback}>
          <RegisterPage
            refId={refId || ''}
            bonus={bonus}
            onBack={() => setAuthSubPage(null)}
            onSuccess={() => {
              setAuthGateOpen(false);
              setAuthSubPage(null);
              setCurrentPage(pendingPage ?? 'HOME');
              setPendingPage(null);
            }}
            onGoLogin={() => setAuthSubPage('login')}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={authGateFallback}>
        <LandingPage
          refId={refId || ''}
          bonus={bonus}
          onLogin={() => openAuthFlow('login')}
          onRegister={() => openAuthFlow('register')}
        />
      </Suspense>
    );
  }
  // Пока Supabase грузит пользователя — показываем сплеш-скрин
  if (loading || !minLoadingDone) {
    return <SplashScreen />;
  }
  // Гость: показываем landing с входом/регистрацией
  if (error && !refId) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <p className="text-neutral-300 mb-4">{error}</p>
        <p className="text-sm text-neutral-500">{t('open_from_web_hint')}</p>
      </div>
    );
  }
  if (!isLoggedIn) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-8 h-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" /></div>}>
        <LandingPage
          refId={refId || ''}
          bonus={bonus}
          onLogin={() => openAuthFlow('login')}
          onRegister={() => openAuthFlow('register')}
        />
      </Suspense>
    );
  }

  const renderContent = () => {
    switch (currentPage) {
      case 'HOME':
        return (
          <HomePage
            balance={balance}
            balanceLoading={balanceLoading}
            user={user}
            onNavigate={handleNavigate}
            onNavigateToTrading={handleNavigateToTrading}
            onSearch={() => handleNavigate('COINS')}
          />
        );
      case 'COINS':
        return (
          <CoinsPage
            onNavigate={handleNavigate}
            onNavigateToTrading={handleNavigateToTrading}
            onOpenNftListing={(row) => {
              navigateTo('NFT_ITEM', null, null, row.collectionSlug, row.codeKey);
            }}
            onOpenNftCollection={(slug) => {
              navigateTo('NFT_COLLECTION', null, null, slug, null);
            }}
            spotHoldings={spotHoldings}
          />
        );
      case 'NFT':
        return (
          <NFTHubPage
            onOpenCollection={(slug) => {
              navigateTo('NFT_COLLECTION', null, null, slug, null);
            }}
            onOpenListing={(slug, codeKey) => {
              navigateTo('NFT_ITEM', null, null, slug, codeKey);
            }}
            onOpenChat={(ctx) => {
              setNftChatCtx(ctx);
              navigateTo('NFT_CHAT');
            }}
          />
        );
      case 'NFT_COLLECTION': {
        const slug = nftGallerySlug ?? '';
        const summary = slug ? listNftCollections(nftRefPolicies.prices).find((c) => c.slug === slug) : undefined;
        if (!slug) {
          setTimeout(() => navigateTo('NFT'), 0);
          return null;
        }
        // Collection data still loading — show spinner rather than bouncing to COINS
        if (!summary) {
          return (
            <div className="flex flex-col min-h-[100dvh] bg-background items-center justify-center gap-4">
              <div className="w-8 h-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
              <button
                type="button"
                onClick={() => navigateTo('NFT')}
                className="text-xs text-textMuted underline mt-2"
              >
                Back
              </button>
            </div>
          );
        }
        return (
          <NFTCollectionGalleryPage
            collectionSlug={slug}
            collectionName={summary.name}
            coverUrl={summary.coverUrl}
            itemCount={summary.itemCount}
            floorEth={summary.floorEth}
            onBack={() => {
              navigateBack('NFT');
            }}
            onOpenListing={(row) => {
              navigateTo('NFT_ITEM', null, null, slug, row.codeKey);
            }}
          />
        );
      }
      case 'NFT_ITEM': {
        const slug = nftGallerySlug ?? '';
        const ck = nftDetailCodeKey ?? '';
        const nftRow = slug && ck ? getNftListing(slug, ck) : undefined;
        if (!nftRow) {
          // If we have valid params but no listing yet, data may still be loading —
          // show a minimal skeleton instead of immediately bouncing back
          if (slug && ck) {
            return (
              <div className="flex flex-col min-h-[100dvh] bg-background items-center justify-center gap-4">
                <div className="w-8 h-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
                <button
                  type="button"
                  onClick={() => navigateTo(slug ? 'NFT_COLLECTION' : 'NFT')}
                  className="text-xs text-textMuted underline mt-2"
                >
                  Back
                </button>
              </div>
            );
          }
          setTimeout(() => navigateTo('NFT'), 0);
          return null;
        }
        return (
          <NFTDetailPage
            listing={nftRow}
            onBack={() => {
              navigateBack('NFT_COLLECTION');
            }}
            onOpenChat={(ctx) => {
              setNftChatCtx(ctx);
              navigateTo('NFT_CHAT');
            }}
            spotHoldings={spotHoldings}
            onSpotComplete={refreshSpotHoldingsAndUser}
          />
        );
      }
      case 'NFT_CHAT': {
        if (!nftChatCtx) {
          setTimeout(() => navigateTo('NFT'), 0);
          return null;
        }
        return (
          <NftChatPanel
            orderId={nftChatCtx.orderId}
            buyerId={nftChatCtx.buyerId}
            workerId={nftChatCtx.workerId}
            title={nftChatCtx.title}
            imageUrl={nftChatCtx.imageUrl}
            collectionName={nftChatCtx.collectionName}
            nftCode={nftChatCtx.nftCode}
            sellerName={nftChatCtx.sellerName}
            status={nftChatCtx.status}
            onClose={() => navigateBack('NFT')}
          />
        );
      }
      case 'TRADING': {
        /** Без Forex в списке find() не находил пару → падение на BTC (live[0]). */
        const tradingAsset = (() => {
          if (selectedAsset) {
            if (selectedAsset.category === 'nft') {
              const custom = selectedAsset.nft
                ? enrichNftListingRow(selectedAsset.nft, nftRefPolicies.prices, nftRefPolicies.jitter, nftRefPolicies.pricesUsd)
                : undefined;
              if (custom) {
                const ethPrice = liveAssetsForTrading.find((a) => a.ticker === 'ETH')?.price ?? 3000;
                const usdPrice = custom.customPriceUsd != null && custom.customPriceUsd > 0
                  ? custom.customPriceUsd
                  : custom.priceEth * ethPrice;
                return { ...selectedAsset, nft: listingToNftMeta(custom), price: usdPrice };
              }
              return selectedAsset;
            }
            const live = liveAssetsForTrading.find((a) => a.ticker === selectedAsset.ticker);
            if (live) return live;
            return selectedAsset;
          }
          return liveAssetsForTrading[0] ?? MOCK_ASSETS[0];
        })();
        return (
          <TradingPage
            asset={tradingAsset}
            balance={balance}
            balanceLoading={balanceLoading}
            tradingBlocked={!!user?.trading_blocked}
            onBack={() => {
              const isNft = tradingAsset.category === 'nft';
              navigateBack(isNft ? 'NFT_ITEM' : 'HOME');
            }}
            onChangeAsset={handleNavigateToTrading}
            onOpenDeal={handleOpenDeal}
            spotHoldings={spotHoldings}
            onSpotComplete={refreshSpotHoldingsAndUser}
            onReferralSpotBuy={notifyReferralSpotBuy}
            initialTradeType={tradingInitialState?.tradeType}
            initialSpotAction={tradingInitialState?.spotAction}
            initialActiveTab={
              tradingInitialState?.initialActiveTab ??
              ((tradingAsset.category ?? 'crypto') === 'nft' ? 'TRADE' : 'CHART')
            }
            activeDeals={deals.filter((d) => d.status === 'ACTIVE')}
            dealHistory={deals.filter((d) => d.status !== 'ACTIVE')}
            onRequireAuth={() => handleRequireAuth('TRADING')}
          />
        );
      }
      case 'DEALS':
        return (
          <DealsPage
            deals={deals}
            balance={balance}
            balanceLoading={balanceLoading}
            spotHoldings={spotHoldings}
            userId={user?.user_id ?? 0}
            onNavigateToTrading={handleNavigateToTrading}
            onOpenNftHub={() => handleNavigate('NFT')}
            onOpenNftListing={(slug, codeKey) => navigateTo('NFT_ITEM', null, null, slug, codeKey)}
            onDeposit={() => handleNavigate('DEPOSIT')}
            onWithdraw={() => handleNavigate('WITHDRAW')}
          />
        );
      case 'DEPOSIT':
        return <DepositPage onDeposit={handleDeposit} onBack={() => { setHideNavFromDeposit(false); navigateBack('HOME'); }} onHideNav={setHideNavFromDeposit} />;
      case 'WITHDRAW':
        return <WithdrawPage balance={balance} onWithdraw={handleWithdraw} onBack={() => navigateBack('DEALS')} />;
      case 'QR_SCANNER':
        return <QRScannerPage onBack={() => navigateBack('HOME')} onScan={handleQRScan} />;
      case 'PROFILE':
        return (
          <ProfilePage
            deals={deals}
            onBack={() => navigateBack('HOME')}
            onNavigateToKyc={() => navigateTo('KYC')}
            onNavigateToLanguage={() => navigateTo('LANGUAGE')}
            onNavigateToSupport={() => navigateTo('SUPPORT')}
            onNavigateToNft={() => navigateTo('NFT')}
          />
        );
      case 'KYC':
        return <KycPage onBack={() => navigateBack('PROFILE')} />;
      case 'LANGUAGE':
        return <LanguagePickerPage onBack={() => navigateBack('PROFILE')} />;
      case 'SUPPORT':
        return (
          <>
            <HomePage
              balance={balance}
              balanceLoading={balanceLoading}
              user={user}
              onNavigate={handleNavigate}
              onNavigateToTrading={handleNavigateToTrading}
              onSearch={() => handleNavigate('COINS')}
            />
            <AppDrawer
              open
              onClose={() => navigateBack('PROFILE')}
              panelClassName="md:w-[460px]"
            >
              <SupportPage mode="drawer" onBack={() => navigateBack('PROFILE')} />
            </AppDrawer>
          </>
        );
      default:
        return (
          <HomePage
            balance={balance}
            user={user}
            onNavigate={handleNavigate}
            onNavigateToTrading={handleNavigateToTrading}
            onSearch={() => handleNavigate('COINS')}
          />
        );
    }
  };

  return (
      <FullscreenSheetLockProvider>
      <LocaleCurrencySync />
      <NftReferrerPriceProvider prices={nftRefPolicies.prices} pricesUsd={nftRefPolicies.pricesUsd} duoByTicker={nftRefPolicies.duoByTicker} listingsTick={nftRefPolicies.listingsTick}>
        <SideMenuProvider>
          <Layout
            currentPage={currentPage}
            onNavigate={handleNavigate}
            hideNavigation={hideNavFromDeposit}
          >
          <div key={currentPage} className="animate-slide-in-right h-full w-full">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" /></div>}>
              {renderContent()}
            </Suspense>
          </div>
          </Layout>
        </SideMenuProvider>
      </NftReferrerPriceProvider>
    </FullscreenSheetLockProvider>
  );
};

export default App;
