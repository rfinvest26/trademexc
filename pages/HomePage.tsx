import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import AssetTable from '../components/AssetTable';
import Skeleton from '../components/Skeleton';
import { MOCK_ASSETS } from '../constants';
import { Asset, PageView, type NavigateToTradingOptions } from '../types';
import { useLiveAssets } from '../utils/useLiveAssets';
import { ArrowDownLeft, ArrowUpRight, Gem, Plus, User } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import { useHideOnScroll } from '../utils/useHideOnScroll';
import BottomSheet from '../components/BottomSheet';
import CryptoBannerWidget from '../components/CryptoBannerWidget';
import { fetchActiveWorkerEvent } from '../lib/services/userService';
import MarketTopBar from '../components/MarketTopBar';
import TopSearchControl from '../components/TopSearchControl';
import AccountBalanceBar from '../components/AccountBalanceBar';
import NftArtwork from '../components/NftArtwork';

interface HomePageProps {
  balance: number;
  balanceLoading?: boolean;
  user: import('../context/UserContext').DbUser | null;
  onNavigateToTrading: (asset: Asset, options?: NavigateToTradingOptions) => void;
  onSearch: () => void;
  onNavigate: (page: PageView) => void;
  onCurrencyClick?: () => void;
}

const HomePage: React.FC<HomePageProps> = ({
  balance,
  balanceLoading = false,
  user,
  onNavigateToTrading,
  onSearch,
  onNavigate,
}) => {
  const { t } = useLanguage();
  const liveAssets = useLiveAssets(MOCK_ASSETS);

  const topBarHidden = useHideOnScroll();

  const [promoTick, setPromoTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setPromoTick((v) => (v + 1) % 1000), 3500);
    return () => window.clearInterval(id);
  }, []);

  const [workerEvent, setWorkerEvent] = useState<{
    title: string;
    bonus: string | null;
    body: string;
    image_url: string;
  } | null>(null);
  const [eventOpen, setEventOpen] = useState(false);

  useEffect(() => {
    const wid = user?.referrer_id;
    if (!wid) { setWorkerEvent(null); return; }
    fetchActiveWorkerEvent(wid)
      .then((row) => {
        setWorkerEvent(row);
      })
      .catch(() => {
        setWorkerEvent(null);
      });
  }, [user?.user_id, user?.referrer_id, promoTick]);

  const promoTickers = useMemo(() => {
    const symbols = ['BTC', 'ETH', 'SOL'];
    return symbols.map((sym) => {
      const a = liveAssets.find((x) => x.ticker === sym);
      return { sym, price: a?.price ?? null, change: a?.change24h ?? null };
    });
  }, [liveAssets]);

  const quickActions = [
    { label: t('deposit'), Icon: ArrowDownLeft, primary: true, onClick: () => onNavigate('DEPOSIT') },
    { label: t('quick_withdraw'), Icon: ArrowUpRight, primary: false, onClick: () => onNavigate('WITHDRAW') },
    { label: 'NFT Hub', Icon: Gem, primary: false, onClick: () => onNavigate('NFT') },
    { label: t('profile'), Icon: User, primary: false, onClick: () => onNavigate('PROFILE') },
  ];

  return (
    <div className="flex flex-col min-h-full animate-fade-in pb-28 lg:pb-8">
      <MarketTopBar
        user={user}
        hidden={topBarHidden}
        onProfile={() => onNavigate('PROFILE')}
        onSupport={() => onNavigate('SUPPORT')}
        onSearch={onSearch}
        profileLabel={t('profile')}
        supportLabel={t('support')}
        className="py-2"
        innerClassName="px-4 lg:px-6 max-w-[720px]"
      >
        <div className="flex items-center gap-2">
          <img src="/app-logo.png" alt="" className="h-5 w-auto" />
          <span className="text-[17px] font-black tracking-tight text-white">MEXC</span>
        </div>
      </MarketTopBar>

      <div className="px-4 lg:px-6 lg:max-w-5xl mx-auto w-full">
        {/* Balance + Deposit */}
        <section className="pt-4 pb-5">
        <div className="flex items-start justify-between gap-4">
          <AccountBalanceBar
            balanceUsd={balance}
            loading={balanceLoading}
            label={t('home_total_assets')}
            className="min-w-0 flex-1 max-w-md"
          />

          <button
            type="button"
            onClick={() => { Haptic.tap(); onNavigate('DEPOSIT'); }}
            className="app-button-primary px-5 shrink-0 mt-1"
          >
            {t('deposit')}
          </button>
        </div>
      </section>

      {/* Quick actions */}
      <section className="pb-6">
        <div className="grid grid-cols-4 gap-1">
          {quickActions.map(({ label, Icon, primary, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={() => { Haptic.tap(); onClick(); }}
              className="touch-target flex flex-col items-center justify-center gap-2 active:scale-[0.94] transition-transform py-1"
            >
              <div className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
                primary ? 'bg-accent text-white' : 'bg-surfaceElevated hover:bg-surface text-textPrimary'
              }`}>
                <Icon size={18} />
              </div>
              <span className="text-[11px] text-textSecondary font-medium tracking-tight text-center leading-none">
                {label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Desktop two-column */}
      <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:gap-5 lg:items-start">

        {/* Promo / special offer */}
        <section className="pb-5">
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              if (workerEvent) { setEventOpen(true); return; }
              try { localStorage.removeItem('mexc_active_p2p_deal'); } catch {}
              try { localStorage.removeItem('mexc_active_deposit'); } catch {}
              onNavigate('DEPOSIT');
            }}
            className="w-full text-left rounded-xl overflow-hidden active:scale-[0.99] transition-transform bg-surfaceElevated"
            aria-label={t('special_offer')}
          >
            {workerEvent ? (
              <div className="relative h-[140px] sm:h-[160px] overflow-hidden">
                <img
                  src={workerEvent.image_url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <img src="/app-logo.png" alt="" className="h-4 w-auto opacity-80" />
                </div>
                {workerEvent.bonus && (
                <div className="absolute left-4 bottom-4 inline-flex items-center gap-1.5 px-3 h-7 rounded-md bg-background/90 backdrop-blur-sm text-textPrimary text-xs font-semibold">
                  {workerEvent.bonus}
                </div>
              )}
                <div className="absolute right-4 bottom-4 text-[11px] font-semibold text-textPrimary">{workerEvent.title}</div>
              </div>
            ) : (
              <div className="relative overflow-hidden p-4 flex items-center justify-between bg-surface rounded-xl transition-all duration-200 hover:bg-surfaceElevated group">
                {/* Subtle wavy background */}
                <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
                  <path fill="var(--color-accent)" fillOpacity="0.15" d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,160C672,160,768,192,864,197.3C960,203,1056,181,1152,154.7C1248,128,1344,96,1392,80L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                </svg>
                
                <img 
                  src="https://cdn3d.iconscout.com/3d/premium/thumb/mx-token-cryptocurrency-3d-icon-png-download-11431283.png" 
                  alt="" 
                  className="absolute right-[22%] top-1/2 -translate-y-1/2 w-[88px] h-[88px] opacity-90 drop-shadow-xl transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12 pointer-events-none z-0"
                />
                
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] font-bold text-textMuted uppercase tracking-widest">
                      {t('special_offer')}
                    </span>
                  </div>
                  <div className="text-[17px] text-white font-black tracking-tight">
                    {t('quick_deposit')}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="hidden min-[360px]:flex items-center gap-3">
                    {promoTickers.slice(0, 2).map(({ sym, change }) => (
                      <div key={sym} className="flex flex-col items-end">
                        <span className="text-[10px] font-mono font-medium text-textMuted">{sym}</span>
                        {change !== null && (
                          <span className={`text-[11px] font-mono font-bold ${change >= 0 ? 'text-up' : 'text-down'}`}>
                            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="w-8 h-8 rounded-full bg-surfaceElevated flex items-center justify-center text-textPrimary group-hover:bg-accent group-hover:text-white transition-all duration-200">
                    <ArrowDownLeft size={16} strokeWidth={2} />
                  </div>
                </div>
              </div>
            )}
          </button>

          <CryptoBannerWidget />

          {/* NFT Promo Widget */}
          <div 
            className="mt-5 rounded-2xl bg-surfaceElevated overflow-hidden relative group cursor-pointer active:scale-[0.99] transition-transform" 
            onClick={() => { Haptic.tap(); onNavigate('NFT'); }}
          >
            <div className="h-28 sm:h-32 w-full relative">
               <NftArtwork
                 src="https://i2c.seadn.io/base/0x0085b7172be81d5cba0dc394b728bdc03324a1d5/5104c62e3997adf21ef01ee6c6a73c/f55104c62e3997adf21ef01ee6c6a73c.png"
                 alt="Dungeons of Fortune"
                 className="h-full w-full transition-transform duration-700 group-hover:scale-[1.015]"
                 imageClassName="!p-2"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            </div>
            <div className="px-4 pb-4 -mt-6 relative z-10 flex items-end justify-between">
               <div>
                  <div className="w-12 h-12 rounded-xl bg-surface border-2 border-background overflow-hidden mb-2">
                     <NftArtwork
                       src="https://i2c.seadn.io/base/0x0085b7172be81d5cba0dc394b728bdc03324a1d5/5104c62e3997adf21ef01ee6c6a73c/f55104c62e3997adf21ef01ee6c6a73c.png"
                       alt="Dungeons of Fortune"
                       className="h-full w-full"
                       imageClassName="!p-0.5"
                     />
                  </div>
                  <h3 className="text-sm font-bold text-textPrimary">Dungeons of Fortune</h3>
                  <p className="text-xs text-textMuted">Trending NFT Collection</p>
               </div>
               <button className="bg-accent text-white text-[11px] font-bold px-3 py-1.5 rounded-lg mb-1 shadow-lg shadow-accent/20">
                 Explore
               </button>
            </div>
          </div>

          {workerEvent && (
            <BottomSheet
              open={eventOpen}
              onClose={() => setEventOpen(false)}
              title={workerEvent.title}
              variant="fullscreen"
              closeOnBackdrop
              showCloseButton
              stickyHeader={false}
              showHeaderDivider={false}
              contentClassName="bg-background max-w-none"
            >
              <div className="-m-4">
                <div className="relative w-full aspect-video bg-card overflow-hidden">
                  <img
                    src={workerEvent.image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                  {workerEvent.bonus ? (
                    <div className="absolute left-4 bottom-4 inline-flex items-center gap-2 px-3 h-8 rounded-full bg-accent text-white text-[12px] font-bold">
                      {workerEvent.bonus}
                      <Plus size={14} />
                    </div>
                  ) : null}
                </div>
                <div className="p-4 space-y-3">
                  <div className="text-base font-bold text-textPrimary">{workerEvent.title}</div>
                  <div className="text-sm text-textSecondary whitespace-pre-wrap leading-relaxed break-words [overflow-wrap:anywhere]">
                    {workerEvent.body}
                  </div>
                </div>
              </div>
            </BottomSheet>
          )}
        </section>

        {/* Top assets */}
        <section className="pt-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-textPrimary">{t('home_top_assets')}</h2>
            <button
              type="button"
              onClick={() => { Haptic.tap(); onNavigate('COINS'); }}
              className="text-xs font-semibold text-accent"
            >
              {t('home_view_all')}
            </button>
          </div>

          {liveAssets.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="w-full h-14 rounded-lg bg-surface" />
              ))}
            </div>
          ) : (
            <div className="-mx-1 bg-background">
              <AssetTable assets={liveAssets} onAssetClick={onNavigateToTrading} hideFilterBar variant="minimal" />
            </div>
          )}
        </section>

      </div>
      </div>
    </div>
  );
};

export default HomePage;
