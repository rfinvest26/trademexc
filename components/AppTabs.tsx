import React from 'react';
import clsx from 'clsx';

interface AppTabsProps extends React.HTMLAttributes<HTMLDivElement> {}

interface AppTabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const AppTabs: React.FC<AppTabsProps> = ({ className, ...props }) => (
  <div className={clsx('app-tabs', className)} {...props} />
);

export const AppTab: React.FC<AppTabProps> = ({ className, active = false, ...props }) => (
  <button className={clsx('app-tab', active && 'app-tab-active', className)} type="button" {...props} />
);

export default AppTabs;
