import type { NavItem, PageView } from '../types';
import { NavHomeIcon, NavMarketsIcon, NavTradeIcon, NavWalletIcon, NavNftIcon } from './icons/MexcNavIcons';

export const MAIN_NAV_PAGE_MAP: Partial<Record<PageView, PageView>> = {
  DEPOSIT: 'HOME',
  WITHDRAW: 'HOME',
  PROFILE: 'HOME',
  SUPPORT: 'HOME',
  LANGUAGE: 'HOME',
  CURRENCY: 'HOME',
  QR_SCANNER: 'HOME',
  // NFT-раздел отделён от трейда: просмотр коллекций/NFT подсвечивает вкладку NFT.
  NFT_COLLECTION: 'NFT',
  NFT_ITEM: 'NFT',
  NFT_CHAT: 'NFT',
};

export function createMainNavItems(t: (key: string) => string): NavItem[] {
  return [
    { id: 'HOME', label: t('nav_home'), icon: NavHomeIcon },
    { id: 'COINS', label: t('nav_coins'), icon: NavMarketsIcon },
    { id: 'NFT', label: t('nav_nft') || 'NFT', icon: NavNftIcon },
    { id: 'TRADING', label: t('nav_trading'), icon: NavTradeIcon },
    { id: 'DEALS', label: t('nav_deals'), icon: NavWalletIcon },
  ];
}
