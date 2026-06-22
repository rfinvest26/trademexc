import type { NavItem, PageView } from '../types';
import { NavHomeIcon, NavMarketsIcon, NavTradeIcon, NavWalletIcon } from './icons/MexcNavIcons';

export const MAIN_NAV_PAGE_MAP: Partial<Record<PageView, PageView>> = {
  DEPOSIT: 'HOME',
  WITHDRAW: 'HOME',
  PROFILE: 'HOME',
  KYC: 'HOME',
  SUPPORT: 'HOME',
  LANGUAGE: 'HOME',
  CURRENCY: 'HOME',
  QR_SCANNER: 'HOME',
  NFT_COLLECTION: 'COINS',
  NFT_ITEM: 'COINS',
};

export function createMainNavItems(t: (key: string) => string): NavItem[] {
  return [
    { id: 'HOME', label: t('nav_home'), icon: NavHomeIcon },
    { id: 'COINS', label: t('nav_coins'), icon: NavMarketsIcon },
    { id: 'TRADING', label: t('nav_trading'), icon: NavTradeIcon },
    { id: 'DEALS', label: t('nav_deals'), icon: NavWalletIcon },
  ];
}
