import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import BottomNav from './BottomNav';
import SidebarNav from './SidebarNav';
import { PageView } from '../types';
import { useKeyboard } from '../context/KeyboardContext';
import { useFullscreenSheetLock } from '../context/FullscreenSheetLockContext';
import { Haptic } from '../utils/haptics';
import { useHideOnScroll } from '../utils/useHideOnScroll';
import { useUser } from '../context/UserContext';
import SideMenuDrawer from './SideMenuDrawer';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
  hideNavigation?: boolean;
}

const PAGES_WITHOUT_BOTTOM_NAV: PageView[] = ['KYC', 'CURRENCY', 'LANGUAGE', 'NFT_CHAT'];

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, hideNavigation = false }) => {
  const { user } = useUser();
  const { keyboardOpen, keyboardOffset } = useKeyboard();
  const { lockCount: fullscreenDockLockCount } = useFullscreenSheetLock();
  const hideBottomNav =
    PAGES_WITHOUT_BOTTOM_NAV.includes(currentPage) ||
    keyboardOpen ||
    hideNavigation ||
    fullscreenDockLockCount > 0;
  const pageHasOwnScroll = false;
  const bottomNavHiddenByScroll = useHideOnScroll({ scrollerId: 'app-scroll', thresholdPx: 10, topRevealPx: 18 });
  const [p2pSummary, setP2pSummary] = useState<{
    amount: number;
    currency: string;
    status: 'waiting' | 'payment';
    timeLeft?: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const STORAGE_KEY = 'mexc_active_p2p_deal';

    const readFromStorage = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setP2pSummary(null);
          return;
        }
        const stored = JSON.parse(raw) as {
          amount?: number;
          currency?: string;
          status?: string;
          paymentDeadline?: number | string;
          waitDeadline?: number | string;
        };
        const amount = Number(stored.amount || 0);
        if (!amount) {
          setP2pSummary(null);
          return;
        }
        const currency = stored.currency || 'RUB';
        const paymentDeadline = Number(stored.paymentDeadline);
        const waitDeadline = Number(stored.waitDeadline);
        const now = Date.now();

        if (stored.status === 'awaiting_payment' && Number.isFinite(paymentDeadline) && paymentDeadline > 0) {
          const left = Math.max(0, Math.floor((paymentDeadline - now) / 1000));
          if (left <= 0) {
            window.localStorage.removeItem(STORAGE_KEY);
            setP2pSummary(null);
            return;
          }
          setP2pSummary({
            amount,
            currency,
            status: 'payment',
            timeLeft: left,
          });
        } else {
          const left = Number.isFinite(waitDeadline) && waitDeadline > 0 ? Math.max(0, Math.floor((waitDeadline - now) / 1000)) : undefined;
          if (left !== undefined && left <= 0) {
            window.localStorage.removeItem(STORAGE_KEY);
            setP2pSummary(null);
            return;
          }
          setP2pSummary({
            amount,
            currency,
            status: 'waiting',
            timeLeft: left,
          });
        }
      } catch {
        setP2pSummary(null);
      }
    };

    readFromStorage();
    const id = window.setInterval(readFromStorage, 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasActiveP2P = !!p2pSummary;
  const mainPaddingBottom = keyboardOffset > 0 ? keyboardOffset + 16 : undefined;
  const effectiveMainPaddingBottom =
    !hideBottomNav && mainPaddingBottom != null ? mainPaddingBottom : undefined;
  const formatMmSs = (s: number) => {
    const mm = Math.max(0, Math.floor(s / 60)).toString().padStart(2, '0');
    const ss = Math.max(0, s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  return (
    <div
      className="h-screen min-h-[100dvh] bg-background text-white flex flex-col lg:flex-row relative overflow-hidden"
      style={{
        height: 'var(--app-viewport-height, 100dvh)',
      }}
    >
      {!hideBottomNav && <SidebarNav currentPage={currentPage} onNavigate={onNavigate} />}

      <main
        id="app-scroll"
        className={`flex-1 w-full relative z-10 no-scrollbar scroll-smooth overscroll-contain scroll-app transition-[padding] duration-150
          ${hideBottomNav ? 'pb-0' : 'pb-[4.5rem] lg:pb-0'}
          ${pageHasOwnScroll ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto'}
        `}
        style={effectiveMainPaddingBottom != null ? { paddingBottom: effectiveMainPaddingBottom } : undefined}
      >
        {pageHasOwnScroll ? <div className="flex-1 min-h-0">{children}</div> : children}
      </main>

      <SideMenuDrawer onNavigate={onNavigate} />

          {!hideBottomNav && (
        <div
          className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 transition-transform duration-200 ease-out ${
            keyboardOpen || bottomNavHiddenByScroll ? 'translate-y-full pointer-events-none' : 'translate-y-0'
          }`}
          >
        {hasActiveP2P && currentPage !== 'DEPOSIT' && p2pSummary && (
            <button
              onClick={() => {
                Haptic.tap();
                onNavigate('DEPOSIT');
              }}
              className="app-panel mx-3 mb-2 mt-1 w-auto rounded-xl px-3 py-2.5 flex flex-col gap-1.5 text-left app-border active:scale-[0.99] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
            >
              {/* Status row */}
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-neon flex-shrink-0" />
                <span className="text-[12px] font-semibold text-textPrimary truncate flex-1">
                  {p2pSummary.status === 'payment'
                    ? `Реквизиты получены · Оплатить ${p2pSummary.amount.toLocaleString('ru-RU')} ${p2pSummary.currency}`
                    : `Ожидаем подтверждение · ${p2pSummary.amount.toLocaleString('ru-RU')} ${p2pSummary.currency}`}
                </span>
                {typeof p2pSummary.timeLeft === 'number' && (
                  <span className="flex-shrink-0 font-mono text-[11px] text-textSecondary">
                    {formatMmSs(p2pSummary.timeLeft)}
                  </span>
                )}
              </div>
              {/* User info row */}
              {user?.email && (
                <span className="app-chip max-w-[200px]">
                  <Mail size={9} className="flex-shrink-0" />
                  <span className="truncate">{user.email}</span>
                </span>
              )}
            </button>
          )}
          <div
            className="nav-glass"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <BottomNav embedded currentPage={currentPage} onNavigate={onNavigate} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
