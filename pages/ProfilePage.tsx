import React, { useState } from 'react';
import { Trophy, XCircle, BarChart3, HelpCircle, ChevronRight, ShieldCheck, ShieldAlert, Languages, LogOut, FileText, X } from 'lucide-react';
import BottomSheet from '../components/BottomSheet';
import { Deal } from '../types';
import { Haptic } from '../utils/haptics';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebAuth } from '../context/WebAuthContext';
import UserAvatar from '../components/UserAvatar';

interface ProfilePageProps {
  deals: Deal[];
  onBack: () => void;
  onNavigateToKyc?: () => void;
  onNavigateToLanguage?: () => void;
  onNavigateToSupport?: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({
  deals,
  onBack,
  onNavigateToKyc,
  onNavigateToLanguage,
  onNavigateToSupport,
}) => {
  const { user, supportLink } = useUser();
  const { logout } = useWebAuth();
  const { t, locale } = useLanguage();
  const [showLegalModal, setShowLegalModal] = useState(false);

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

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in max-w-2xl lg:max-w-4xl mx-auto">
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
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/[0.18]">
                <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-400">{t('verified')}</p>
                  <p className="text-[11px] text-textSubtle mt-0.5">Full trading access · All limits unlocked</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  Haptic.tap();
                  onNavigateToKyc?.();
                }}
                className="w-full px-4 py-3.5 rounded-2xl bg-neon/[0.06] border border-neon/[0.18] flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
              >
                <ShieldAlert size={18} className="text-neon flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neon">{t('verification_required')}</p>
                  <p className="text-[11px] text-textSubtle mt-0.5">Verify to unlock withdrawals & higher limits</p>
                </div>
                <ChevronRight size={16} className="text-neon/50 flex-shrink-0" />
              </button>
            )}
          </div>
        )}

        {isGuest && (
          <p className="text-xs text-textMuted mb-5">{t('open_from_web_hint')}</p>
        )}

        <div className="grid grid-cols-3 gap-2 mb-6">
          <div className="bg-surface border border-border rounded-2xl px-3 py-3 text-center">
            <Trophy size={14} className="text-up mx-auto mb-1" />
            <span className="text-sm font-bold text-textPrimary tabular-nums">{wins}</span>
            <p className="text-[10px] text-textSubtle uppercase tracking-wider mt-0.5">{t('wins')}</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl px-3 py-3 text-center">
            <XCircle size={14} className="text-down/80 mx-auto mb-1" />
            <span className="text-sm font-bold text-textPrimary tabular-nums">{losses}</span>
            <p className="text-[10px] text-textSubtle uppercase tracking-wider mt-0.5">{t('losses')}</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl px-3 py-3 text-center">
            <BarChart3 size={14} className="text-neon/80 mx-auto mb-1" />
            <span className="text-sm font-bold text-textPrimary tabular-nums">{winRate}%</span>
            <p className="text-[10px] text-textSubtle uppercase tracking-wider mt-0.5">{t('winrate')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {onNavigateToLanguage && (
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  onNavigateToLanguage();
                }}
                className="w-full px-4 py-4 flex items-center justify-between group text-left active:scale-95 transition-all"
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
              className={`w-full px-4 py-4 flex items-center justify-between group text-left active:scale-95 transition-all ${onNavigateToLanguage ? 'border-t border-border' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-textSecondary" />
                <span className="text-sm font-medium text-textPrimary">{t('legal_title')}</span>
              </div>
              <ChevronRight size={16} className="text-textSubtle" />
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
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
            <div className="rounded-xl border border-border bg-card overflow-hidden">
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
              <a href="https://www.fscmauritius.org" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-border bg-card px-3 py-2.5 hover:border-neon transition-colors">
                <span className="text-sm font-medium text-textPrimary">FSC Mauritius</span>
                <span className="block text-xs text-textSecondary mt-0.5">Financial Services Commission · {t('legal_registry_label')}</span>
              </a>
              <a href="https://www.fntt.lt" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-border bg-card px-3 py-2.5 hover:border-neon transition-colors">
                <span className="text-sm font-medium text-textPrimary">FCIS Lithuania</span>
                <span className="block text-xs text-textSecondary mt-0.5">Financial Crime Investigation Service · {t('legal_vasp_label')}</span>
              </a>
              <a href="https://register.fca.org.uk" target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-border bg-card px-3 py-2.5 hover:border-neon transition-colors">
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
            <div className="rounded-xl border border-border bg-card p-3 space-y-3">
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
