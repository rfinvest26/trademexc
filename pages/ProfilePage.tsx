import React, { useEffect, useState } from 'react';
import { Trophy, XCircle, BarChart3, HelpCircle, ChevronRight, ShieldCheck, ShieldAlert, Languages, LogOut, FileText, X, Clock3, Gem } from 'lucide-react';
import BottomSheet from '../components/BottomSheet';
import { Deal } from '../types';
import { Haptic } from '../utils/haptics';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebAuth } from '../context/WebAuthContext';
import UserAvatar from '../components/UserAvatar';
import { getMyNftOrders, getMyNftOwned, nftOrderStatusMeta, nftOwnedStatusMeta, type NftOrderRow, type NftOwnedRow, type NftStatusTone } from '../lib/nftOrders';

interface ProfilePageProps {
  deals: Deal[];
  onBack: () => void;
  onNavigateToKyc?: () => void;
  onNavigateToLanguage?: () => void;
  onNavigateToSupport?: () => void;
  onNavigateToNft?: () => void;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function nftOrderTitle(order: NftOrderRow): string {
  const collection = String(order.collection_name ?? 'NFT').trim() || 'NFT';
  const code = String(order.nft_code ?? '').trim();
  return code ? `${collection} #${code}` : collection;
}

function nftOwnedTitle(row: NftOwnedRow): string {
  const collection = String(row.collection_name ?? 'NFT').trim() || 'NFT';
  const code = String(row.nft_code ?? '').trim();
  return code ? `${collection} #${code}` : collection;
}

function nftStatusClass(tone: NftStatusTone): string {
  switch (tone) {
    case 'pending':
      return 'bg-surfaceElevated text-textSecondary ring-border';
    case 'success':
      return 'bg-up/10 text-up ring-up/20';
    case 'danger':
      return 'bg-down/10 text-down ring-down/20';
    case 'market':
      return 'bg-accent/10 text-accent ring-accent/20';
    default:
      return 'bg-surfaceElevated text-textMuted ring-border';
  }
}

const ProfilePage: React.FC<ProfilePageProps> = ({
  deals,
  onBack,
  onNavigateToKyc,
  onNavigateToLanguage,
  onNavigateToSupport,
  onNavigateToNft,
}) => {
  const { user, supportLink } = useUser();
  const { logout } = useWebAuth();
  const { t, locale } = useLanguage();
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [pendingNftOrders, setPendingNftOrders] = useState<NftOrderRow[]>([]);
  const [ownedNfts, setOwnedNfts] = useState<NftOwnedRow[]>([]);

  const finishedDeals = deals.filter((d) => d.status === 'WIN' || d.status === 'LOSS');
  const winsFromDeals = finishedDeals.filter((d) => d.status === 'WIN').length;
  const lossesFromDeals = finishedDeals.filter((d) => d.status === 'LOSS').length;
  const wins = user?.stats_wins != null ? user.stats_wins : winsFromDeals;
  const losses = user?.stats_losses != null ? user.stats_losses : lossesFromDeals;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const displayName = user?.full_name || user?.username || (user?.email ? user.email : (user ? t('user_placeholder') : t('guest')));
  const displayId = user ? `#${user.user_id}` : '—';
  const avatarUrl = user?.photo_url || undefined;
  const isGuest = !user;
  const isRu = locale === 'ru' || locale === 'uk' || locale === 'kk';
  const pendingNftTotal = pendingNftOrders.reduce((sum, order) => sum + (Number(order.price_usd) || 0), 0);
  const visibleOwnedNfts = ownedNfts.filter((row) => row.status !== 'sold');
  const ownedNftTotal = visibleOwnedNfts.reduce((sum, row) => sum + (Number(row.list_price_usd ?? row.acquired_price_usd) || 0), 0);
  const activeNftCount = pendingNftOrders.length + visibleOwnedNfts.length;

  useEffect(() => {
    if (!user?.user_id) {
      setPendingNftOrders([]);
      setOwnedNfts([]);
      return;
    }

    let alive = true;
    const loadPendingNftOrders = async () => {
      const [orders, owned] = await Promise.all([
        getMyNftOrders(user.user_id, 20),
        getMyNftOwned(user.user_id, 60),
      ]);
      if (!alive) return;
      setPendingNftOrders(orders.filter((order) => order.status === 'pending'));
      setOwnedNfts(owned);
    };

    void loadPendingNftOrders();
    const intervalId = window.setInterval(loadPendingNftOrders, 6000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [user?.user_id]);

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in max-w-[720px] lg:max-w-4xl mx-auto">
      <div className="sticky top-0 z-40 bg-background">
        <div className="px-4 pt-3 pb-2 flex items-center">
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              onBack();
            }}
            className="touch-target h-10 w-10 rounded-xl flex items-center justify-center text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated active:scale-95 transition-all focus:outline-none"
            aria-label={t('close_aria')}
          >
            <X size={20} strokeWidth={1.75} />
          </button>
          <div className="flex-1" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-24 pt-2 lg:px-6 lg:pt-4">
        <div className="flex flex-col items-center text-center pt-2 pb-4">
          <div className="relative inline-block">
            <UserAvatar
              name={displayName}
              photoUrl={avatarUrl}
              className="w-20 h-20"
              imageClassName="bg-surface border-border"
              fallbackClassName="bg-surface border-border text-textPrimary text-2xl font-bold"
              iconClassName="text-textPrimary"
              iconSize={22}
            />
          </div>
          <div className="mt-3">
            <div className="text-[22px] font-bold text-textPrimary tracking-tight">
              {displayName}
            </div>
            <div className="mt-1 text-[12px] text-textSubtle font-mono flex items-center justify-center gap-2 flex-wrap">
              {user?.email ? (
                <span className="truncate max-w-[260px]">{user.email}</span>
              ) : null}
              <span className="text-textSubtle">{displayId}</span>
            </div>
          </div>
        </div>

        {!isGuest && (
          <div className="mb-5">
            {user?.is_kyc === true ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surfaceElevated">
                <ShieldCheck size={18} className="text-up flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-up">{t('verified')}</p>
                  <p className="text-[11px] text-textSubtle mt-0.5">Full trading access · All limits unlocked</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  Haptic.tap();
                  onNavigateToKyc?.();
                }}
                className="w-full px-4 py-3.5 rounded-xl bg-surfaceElevated flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
              >
                <ShieldAlert size={18} className="text-accent flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-textPrimary">{t('verification_required')}</p>
                  <p className="text-[11px] text-textSubtle mt-0.5">Verify to unlock withdrawals & higher limits</p>
                </div>
                <ChevronRight size={16} className="text-textSubtle flex-shrink-0" />
              </button>
            )}
          </div>
        )}

        {isGuest && (
          <p className="text-xs text-textMuted mb-5">{t('open_from_web_hint')}</p>
        )}

        {!isGuest && activeNftCount > 0 && (
          <div className="mb-6 bg-surfaceElevated rounded-xl p-4">
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                onNavigateToNft?.();
              }}
              disabled={!onNavigateToNft}
              className="w-full flex items-center gap-3 mb-4 text-left active:scale-[0.99] transition-transform disabled:active:scale-100"
            >
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Gem size={20} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-textPrimary">{isRu ? 'NFT-портфель' : 'NFT Portfolio'}</h3>
                <p className="text-xs text-textMuted mt-0.5">
                  {isRu ? 'Баланс активов:' : 'Total Value:'} <span className="font-mono font-medium text-textPrimary">{formatUsd(pendingNftTotal + ownedNftTotal)}</span>
                </p>
              </div>
              {onNavigateToNft && <ChevronRight size={16} className="text-textSubtle shrink-0" />}
            </button>

            <div className="space-y-2">
              {pendingNftOrders.slice(0, 3).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-xl bg-surface border border-white/[0.02]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-surfaceElevated flex items-center justify-center shrink-0">
                      <Clock3 size={14} className="text-textMuted" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-textPrimary truncate">{nftOrderTitle(order)}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${nftStatusClass(nftOrderStatusMeta(order.status, order.side).tone)}`}>
                        {nftOrderStatusMeta(order.status, order.side).label}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <p className="font-mono text-[13px] font-bold text-textPrimary">{formatUsd(Number(order.price_usd) || 0)}</p>
                    <p className="text-[11px] text-textMuted mt-0.5">{isRu ? 'Покупка' : 'Buy'}</p>
                  </div>
                </div>
              ))}
              {visibleOwnedNfts.slice(0, Math.max(0, 3 - pendingNftOrders.slice(0, 3).length)).map((row) => {
                const meta = nftOwnedStatusMeta(row.status);
                return (
                  <div key={`owned-${row.id}`} className="flex items-center justify-between p-3 rounded-xl bg-surface border border-white/[0.02]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surfaceElevated flex items-center justify-center shrink-0">
                        {row.status === 'listed' ? <BarChart3 size={14} className="text-accent" /> : <Gem size={14} className="text-up" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-textPrimary truncate">{nftOwnedTitle(row)}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${nftStatusClass(meta.tone)}`}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <p className="font-mono text-[13px] font-bold text-textPrimary">{formatUsd(Number(row.list_price_usd ?? row.acquired_price_usd) || 0)}</p>
                      <p className="text-[11px] text-textMuted mt-0.5">{row.status === 'listed' ? (isRu ? 'На продаже' : 'Listed') : (isRu ? 'В коллекции' : 'Owned')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {activeNftCount > 3 && (
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  onNavigateToNft?.();
                }}
                className="w-full mt-3 py-2 text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
              >
                {isRu ? `Показать все (${activeNftCount})` : `View all (${activeNftCount})`}
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="bg-surface rounded-xl px-3 py-3 text-center">
            <Trophy size={14} className="text-up mx-auto mb-1" />
            <span className="text-sm font-bold text-textPrimary tabular-nums">{wins}</span>
            <p className="text-[10px] text-textSubtle uppercase tracking-wider mt-0.5">{t('wins')}</p>
          </div>
          <div className="bg-surface rounded-xl px-3 py-3 text-center">
            <XCircle size={14} className="text-down/80 mx-auto mb-1" />
            <span className="text-sm font-bold text-textPrimary tabular-nums">{losses}</span>
            <p className="text-[10px] text-textSubtle uppercase tracking-wider mt-0.5">{t('losses')}</p>
          </div>
          <div className="bg-surface rounded-xl px-3 py-3 text-center">
            <BarChart3 size={14} className="text-neon/80 mx-auto mb-1" />
            <span className="text-sm font-bold text-textPrimary tabular-nums">{winRate}%</span>
            <p className="text-[10px] text-textSubtle uppercase tracking-wider mt-0.5">{t('winrate')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="app-panel">
            {!isGuest && onNavigateToNft && (
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  onNavigateToNft();
                }}
                className="w-full px-4 py-4 flex items-center justify-between group text-left active:scale-95 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Gem size={18} className="text-textSecondary" />
                  <span className="text-sm font-medium text-textPrimary">NFT</span>
                </div>
                <ChevronRight size={16} className="text-textSubtle" />
              </button>
            )}
            {onNavigateToLanguage && (
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  onNavigateToLanguage();
                }}
                className={`w-full px-4 py-4 flex items-center justify-between group text-left active:scale-95 transition-all ${!isGuest && onNavigateToNft ? 'border-t border-border' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <Languages size={18} className="text-textSecondary" />
                  <span className="text-sm font-medium text-textPrimary">{t('language_title')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-textSubtle font-mono">
                    {locale === 'en' ? 'EN' : locale === 'ru' ? 'RU' : locale === 'uk' ? 'UK' : locale === 'pl' ? 'PL' : locale === 'kk' ? 'KK' : 'CS'}
                  </span>
                  <ChevronRight size={16} className="text-textSubtle" />
                </div>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                setShowLegalModal(true);
              }}
              className={`w-full px-4 py-4 flex items-center justify-between group text-left active:scale-95 transition-all ${onNavigateToLanguage || (!isGuest && onNavigateToNft) ? 'border-t border-border' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-textSecondary" />
                <span className="text-sm font-medium text-textPrimary">{t('legal_title')}</span>
              </div>
              <ChevronRight size={16} className="text-textSubtle" />
            </button>
          </div>

          <div className="app-panel">
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                if (onNavigateToSupport) {
                  onNavigateToSupport();
                } else {
                  window.open(supportLink, '_blank', 'noopener,noreferrer');
                }
              }}
              className="w-full px-4 py-4 flex items-center justify-between group text-left active:scale-95 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <HelpCircle size={18} className="text-textSecondary" />
                <span className="text-sm font-medium text-textPrimary">{t('support')}</span>
              </div>
              <ChevronRight size={16} className="text-textSubtle" />
            </button>
            {user?.email && (
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  void logout();
                }}
                className="w-full px-4 py-4 flex items-center justify-between group text-left active:scale-95 transition-all border-t border-border"
              >
                <div className="flex items-center gap-2.5">
                  <LogOut size={18} className="text-textSecondary group-hover:text-red-400" />
                  <span className="text-sm font-medium text-textPrimary">{t('logout')}</span>
                </div>
                <ChevronRight size={16} className="text-textSubtle" />
              </button>
            )}
          </div>
        </div>
      </div>

      <BottomSheet
        open={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        title={t('legal_title')}
        variant="expandable"
      >
        <div className="space-y-6 pb-4">
          <section>
            <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-cap mb-2 flex items-center gap-2">
              <ShieldCheck size={14} className="text-neon" />
              {t('legal_licenses')}
            </h3>
            <div className="app-panel">
              <div className="px-3 py-2 border-b border-border grid grid-cols-4 gap-2 text-xs font-mono uppercase tracking-cap text-textSecondary">
                <span>{t('legal_jurisdiction')}</span>
                <span>{t('legal_regulator')}</span>
                <span>{t('legal_number')}</span>
                <span>{t('legal_status')}</span>
              </div>
              <div className="divide-y divide-border">
                <div className="px-3 py-2.5 grid grid-cols-4 gap-2 text-xs">
                  <span className="text-textPrimary">Маврикий</span>
                  <span className="text-textSecondary">FSC</span>
                  <span className="font-mono text-textPrimary">{t('legal_in_progress')}</span>
                  <span className="text-up text-xs">{t('legal_active')}</span>
                </div>
                <div className="px-3 py-2.5 grid grid-cols-4 gap-2 text-xs">
                  <span className="text-textPrimary">Сент-Винсент и Гренадины</span>
                  <span className="text-textSecondary">—</span>
                  <span className="font-mono text-textPrimary">{t('legal_under_review')}</span>
                  <span className="text-up text-xs">{t('legal_active')}</span>
                </div>
                <div className="px-3 py-2.5 grid grid-cols-4 gap-2 text-xs">
                  <span className="text-textPrimary">Литва</span>
                  <span className="text-textSecondary">FCIS</span>
                  <span className="font-mono text-textPrimary">{t('legal_under_review')}</span>
                  <span className="text-up text-xs">{t('legal_active')}</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-textSecondary leading-snug">
              {t('legal_registered_address')}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-cap mb-2 flex items-center gap-2">
              <ShieldAlert size={14} className="text-textMuted" />
              {t('legal_regulators')}
            </h3>
            <div className="space-y-2">
              <a href="https://www.fscmauritius.org" target="_blank" rel="noopener noreferrer" className="block app-panel px-3 py-2.5 hover:border-neon transition-colors">
                <span className="text-sm font-medium text-textPrimary">FSC Mauritius</span>
                <span className="block text-xs text-textSecondary mt-0.5">Financial Services Commission · {t('legal_registry_label')}</span>
              </a>
              <a href="https://www.fntt.lt" target="_blank" rel="noopener noreferrer" className="block app-panel px-3 py-2.5 hover:border-neon transition-colors">
                <span className="text-sm font-medium text-textPrimary">FCIS Lithuania</span>
                <span className="block text-xs text-textSecondary mt-0.5">Financial Crime Investigation Service · {t('legal_vasp_label')}</span>
              </a>
              <a href="https://register.fca.org.uk" target="_blank" rel="noopener noreferrer" className="block app-panel px-3 py-2.5 hover:border-neon transition-colors">
                <span className="text-sm font-medium text-textPrimary">FCA UK</span>
                <span className="block text-xs text-textSecondary mt-0.5">Financial Conduct Authority · {t('legal_registry_label')}</span>
              </a>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-textSecondary uppercase tracking-cap mb-2 flex items-center gap-2">
              <BarChart3 size={14} className="text-neon" />
              {t('legal_liquidity_providers')}
            </h3>
            <div className="app-panel p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-textSecondary mb-1">{t('legal_tier1_lp')}</p>
                <p className="text-xs text-textPrimary">Goldman Sachs, JP Morgan, UBS, Barclays, Deutsche Bank, Citibank</p>
              </div>
              <div>
                <p className="text-xs font-medium text-textSecondary mb-1">{t('legal_aggregators')}</p>
                <p className="text-xs text-textPrimary">oneZero, PrimeXM, Integral Development Corp</p>
              </div>
              <div>
                <p className="text-xs font-medium text-textSecondary mb-1">{t('legal_formats')}</p>
                <p className="text-xs text-textPrimary">STP, ECN, Prime of Prime</p>
              </div>
            </div>
          </section>

          <p className="text-xs text-textSecondary leading-snug border-t border-border pt-4">
            {t('legal_demo_note')}
          </p>
        </div>
      </BottomSheet>
    </div>
  );
};

export default ProfilePage;
