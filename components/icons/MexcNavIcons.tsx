import React from 'react';
import { Home, BarChart2, ArrowLeftRight, Wallet, Gem } from 'lucide-react';

type IconProps = {
  active?: boolean;
  className?: string;
  size?: number;
};

const getIconClass = (active: boolean, className: string) => {
  return active 
    ? `${className} scale-[1.1] transition-transform duration-300 text-accent` 
    : `${className} transition-transform duration-300 text-textSubtle`;
};

export const NavHomeIcon: React.FC<IconProps> = ({ active = false, className = '', size = 24 }) => {
  return <Home size={size} strokeWidth={active ? 2.5 : 2} className={getIconClass(active, className)} />;
};

export const NavMarketsIcon: React.FC<IconProps> = ({ active = false, className = '', size = 24 }) => {
  return <BarChart2 size={size} strokeWidth={active ? 2.5 : 2} className={getIconClass(active, className)} />;
};

export const NavTradeIcon: React.FC<IconProps> = ({ active = false, className = '', size = 24 }) => {
  return <ArrowLeftRight size={size} strokeWidth={active ? 2.5 : 2} className={getIconClass(active, className)} />;
};

export const NavNftIcon: React.FC<IconProps> = ({ active = false, className = '', size = 24 }) => {
  return <Gem size={size} strokeWidth={active ? 2.5 : 2} className={getIconClass(active, className)} />;
};

export const NavWalletIcon: React.FC<IconProps> = ({ active = false, className = '', size = 24 }) => {
  return <Wallet size={size} strokeWidth={active ? 2.5 : 2} className={getIconClass(active, className)} />;
};
