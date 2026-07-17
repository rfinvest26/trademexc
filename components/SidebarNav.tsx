import React from 'react';
import { MessageCircle, LogOut, User } from 'lucide-react';
import { PageView } from '../types';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';
import { useWebAuth } from '../context/WebAuthContext';
import UnifiedMarketsRibbon from './UnifiedMarketsRibbon';
import UserAvatar from './UserAvatar';
import { createMainNavItems, MAIN_NAV_PAGE_MAP } from './navigation';
import AccountBalanceBar from './AccountBalanceBar';

interface SidebarNavProps {
  currentPage: PageView;
  onNavigate: (page: PageView) => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({ currentPage, onNavigate }) => {
  const { t } = useLanguage();
  const { user, loading } = useUser();
  const { logout } = useWebAuth();
  const navItems = createMainNavItems(t);
  const activeNav = MAIN_NAV_PAGE_MAP[currentPage] ?? currentPage;
  const isWebUser = !!user?.email;
  const displayName = user?.full_name || user?.username || (user?.email ? user.email.split('@')[0] : t('guest'));
  const balance = user?.balance ?? 0;
  const balanceLoading = Boolean(loading && user);

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-surfaceElevated border-r border-border">
      <div className="sticky top-0 flex flex-col h-screen py-6 px-4">

        {/* Brand */}
        <div className="px-2 pb-6 flex items-center">
          <img src="/app-logo.svg" alt="MEXC" className="h-7 w-auto" draggable={false} />
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            const Icon = item.icon;
            const isMexcSvg = item.id === 'HOME' || item.id === 'COINS' || item.id === 'TRADING' || item.id === 'DEALS';
            return (
              <button
                key={item.id}
                onClick={() => { Haptic.medium(); onNavigate(item.id); }}
                title={item.label}
                className={`cursor-pointer flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 ${
                  isActive
                    ? 'bg-accent/10 text-accent font-bold'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-surface'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6">
                  {isMexcSvg ? (
                    <Icon active={isActive} className={isActive ? 'icon-soft' : 'icon-muted'} size={20} />
                  ) : (
                    <Icon size={20} strokeWidth={isActive ? 2 : 1.5} className={isActive ? 'text-accent' : 'text-textMuted'} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[15px] tracking-tight truncate block ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Bottom actions & User Profile */}
        <div className="flex flex-col gap-1 pt-4">
          <button
            type="button"
            title={t('support')}
            onClick={() => { Haptic.medium(); onNavigate('SUPPORT'); }}
            className="cursor-pointer flex items-center gap-3 px-3 py-3 rounded-xl text-left text-textSecondary hover:text-textPrimary hover:bg-surface transition-all duration-200"
          >
            <div className="flex-shrink-0 flex items-center justify-center w-6 h-6">
              <MessageCircle size={20} strokeWidth={1.5} />
            </div>
            <span className="font-medium text-[15px] tracking-tight">{t('support')}</span>
          </button>
          
          <div className="h-px bg-border my-2 mx-2" />

          {user ? (
            <AccountBalanceBar
              balanceUsd={Number(balance) || 0}
              loading={balanceLoading}
              label={t('available')}
              compact
              className="mb-2 w-full"
            />
          ) : null}

          {user ? (
            <div className="flex items-center gap-3 px-2 py-2 mt-1">
              <UserAvatar
                name={displayName}
                photoUrl={user.photo_url}
                className="w-10 h-10 shrink-0"
                imageClassName="border-border"
                fallbackClassName="bg-surface text-textPrimary text-sm font-medium"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-textPrimary truncate">{displayName}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-textMuted">#{user.user_id}</p>
              </div>
              {isWebUser && (
                <button
                  type="button"
                  title={t('exit') || 'Выйти'}
                  onClick={() => {
                    Haptic.medium();
                    void logout();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-textMuted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <LogOut size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          ) : (
            <div className="px-3 py-3 flex items-center gap-3 text-textMuted">
              <User size={20} />
              <span className="text-[15px] font-medium">{t('guest')}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default SidebarNav;
