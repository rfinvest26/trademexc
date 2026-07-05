import React from 'react';
import {
  User,
  ShieldCheck,
  MessageCircle,
  Languages,
  LogOut,
  ChevronRight,
  X,
  CreditCard,
} from 'lucide-react';
import { PageView } from '../types';
import { useUser } from '../context/UserContext';
import { useWebAuth } from '../context/WebAuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Haptic } from '../utils/haptics';
import UserAvatar from './UserAvatar';
import { useSideMenu } from '../context/SideMenuContext';

interface SideMenuDrawerProps {
  onNavigate: (page: PageView) => void;
}

const SideMenuDrawer: React.FC<SideMenuDrawerProps> = ({ onNavigate }) => {
  const { user } = useUser();
  const { logout } = useWebAuth();
  const { t } = useLanguage();
  const { isOpen, setIsOpen } = useSideMenu();

  if (!isOpen) return null;

  const displayName =
    user?.full_name || user?.username || (user?.email ? user.email.split('@')[0] : t('guest'));

  const navigate = (page: PageView) => {
    Haptic.medium();
    setIsOpen(false);
    onNavigate(page);
  };

  const handleClose = () => {
    Haptic.light();
    setIsOpen(false);
  };

  return (
    <div className="fixed left-0 right-0 top-0 bottom-0 z-[200] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" 
        onClick={handleClose} 
      />

      {/* Drawer */}
      <div
        className="relative w-[300px] max-w-[85vw] h-full bg-surface border-l border-border animate-slide-in-right flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-semibold text-textPrimary">{t('more') || 'Меню'}</span>
          <button
            type="button"
            onClick={handleClose}
            className="app-icon-button"
            aria-label={t('close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {user && (
            <div className="px-3 pb-3 mb-3 border-b border-border">
              <button
                type="button"
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-surfaceElevated transition-colors"
                onClick={() => navigate('PROFILE')}
              >
                <UserAvatar
                  name={displayName}
                  photoUrl={user.photo_url}
                  className="w-10 h-10 shrink-0"
                  fallbackClassName="bg-neon/10 text-neon text-sm"
                />
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-[15px] font-semibold text-textPrimary truncate">{displayName}</div>
                  {user.email && (
                    <div className="text-xs text-textMuted truncate">{user.email}</div>
                  )}
                </div>
                <ChevronRight size={16} className="text-textSubtle shrink-0" />
              </button>
            </div>
          )}

          <div className="space-y-1 px-3">
            <button type="button" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surfaceElevated transition-colors" onClick={() => navigate('PROFILE')}>
            <div className="w-8 h-8 rounded-xl bg-surfaceElevated flex items-center justify-center shrink-0">
              <User size={16} className="text-textSecondary" />
            </div>
            <span className="flex-1 text-left text-sm text-textPrimary">{t('profile') || 'Профиль'}</span>
            <ChevronRight size={15} className="text-textSubtle shrink-0" />
          </button>

          <button type="button" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surfaceElevated transition-colors" onClick={() => navigate('KYC')}>
            <div className="w-8 h-8 rounded-xl bg-surfaceElevated flex items-center justify-center shrink-0">
              <ShieldCheck size={16} className="text-textSecondary" />
            </div>
            <span className="flex-1 text-left text-sm text-textPrimary">{t('kyc_title') || 'Верификация'}</span>
            {!user?.is_kyc && (
              <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                {t('required') || 'Нужна'}
              </span>
            )}
            <ChevronRight size={15} className="text-textSubtle shrink-0 ml-1" />
          </button>

          <button type="button" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surfaceElevated transition-colors" onClick={() => navigate('SUPPORT')}>
            <div className="w-8 h-8 rounded-xl bg-surfaceElevated flex items-center justify-center shrink-0">
              <MessageCircle size={16} className="text-textSecondary" />
            </div>
            <span className="flex-1 text-left text-sm text-textPrimary">{t('support') || 'Поддержка'}</span>
            <ChevronRight size={15} className="text-textSubtle shrink-0" />
          </button>

          <button type="button" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surfaceElevated transition-colors" onClick={() => navigate('LANGUAGE')}>
            <div className="w-8 h-8 rounded-xl bg-surfaceElevated flex items-center justify-center shrink-0">
              <Languages size={16} className="text-textSecondary" />
            </div>
            <span className="flex-1 text-left text-sm text-textPrimary">{t('language') || 'Язык'}</span>
            <ChevronRight size={15} className="text-textSubtle shrink-0" />
          </button>

          {user?.email && (
            <div className="mt-4 pt-4 border-t border-border">
              <button
                type="button"
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surfaceElevated transition-colors"
                onClick={() => {
                  Haptic.medium();
                  handleClose();
                  void logout();
                }}
              >
                <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <LogOut size={16} className="text-red-400" />
                </div>
                <span className="flex-1 text-left text-sm font-medium text-red-400">
                  {t('exit') || 'Выйти'}
                </span>
              </button>
            </div>
          )}
          </div>
        </div>

        {/* Safe area */}
        <div style={{ height: 'max(16px, env(safe-area-inset-bottom, 16px))' }} />
      </div>
    </div>
  );
};

export default SideMenuDrawer;
