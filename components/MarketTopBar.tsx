import React from 'react';
import { Headphones, Search, Menu } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import UserAvatar from './UserAvatar';
import type { DbUser } from '../context/UserContext';

import { useSideMenu } from '../context/SideMenuContext';

interface MarketTopBarProps {
  user: DbUser | null;
  hidden?: boolean;
  sticky?: boolean;
  children?: React.ReactNode;
  onProfile: () => void;
  onSupport: () => void;
  onSearch?: () => void;
  profileLabel: string;
  supportLabel: string;
  className?: string;
  innerClassName?: string;
}

const MarketTopBar: React.FC<MarketTopBarProps> = ({
  user,
  hidden = false,
  sticky = true,
  children,
  onProfile,
  onSupport,
  onSearch,
  profileLabel,
  supportLabel,
  className = '',
  innerClassName = '',
}) => {
  const { setIsOpen } = useSideMenu();
  const displayName = user?.full_name || user?.username || user?.email || profileLabel;

  return (
    <div
      className={`${sticky ? 'sticky top-0 z-40' : ''} bg-background transition-transform duration-200 ${
        hidden ? '-translate-y-full pointer-events-none' : 'translate-y-0'
      } ${className}`.trim()}
    >
      <div className={`mx-auto flex w-full items-center gap-2.5 ${innerClassName}`.trim()}>
        <button
          type="button"
          onClick={() => {
            Haptic.tap();
            onProfile();
          }}
          className="touch-target h-10 w-10 shrink-0 rounded-full bg-surfaceElevated flex items-center justify-center transition-colors hover:bg-surface active:scale-95"
          aria-label={profileLabel}
        >
          <UserAvatar
            name={displayName}
            photoUrl={user?.photo_url}
            className="h-9 w-9 rounded-full"
            imageClassName="border-transparent"
            fallbackClassName="bg-surfaceElevated text-textSecondary text-[12px] font-bold"
            iconClassName="text-textSecondary"
            iconSize={14}
          />
        </button>

        <div className="min-w-0 flex-1 flex justify-center items-center">{children}</div>

        <div className="flex items-center gap-2 shrink-0">
          {onSearch && (
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                onSearch();
              }}
              className="touch-target h-10 w-10 shrink-0 rounded-full bg-surfaceElevated flex items-center justify-center text-textMuted transition-colors hover:text-white hover:bg-surface active:scale-95"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              onSupport();
            }}
            className="touch-target h-10 w-10 shrink-0 rounded-full bg-surfaceElevated flex items-center justify-center text-textMuted transition-colors hover:text-white hover:bg-surface active:scale-95"
            aria-label={supportLabel}
          >
            <Headphones size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              Haptic.tap();
              setIsOpen(true);
            }}
            className="touch-target h-10 w-10 shrink-0 rounded-full bg-surfaceElevated flex items-center justify-center text-textMuted transition-colors hover:text-white hover:bg-surface active:scale-95"
            aria-label="Menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarketTopBar;
