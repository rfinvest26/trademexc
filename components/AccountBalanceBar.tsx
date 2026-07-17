import React, { useState } from 'react';
import { ChevronDown, Wallet } from 'lucide-react';
import Skeleton from './Skeleton';
import CurrencyPickerSheet from './CurrencyPickerSheet';
import { useCurrency } from '../context/CurrencyContext';
import { Haptic } from '../utils/haptics';

interface AccountBalanceBarProps {
  balanceUsd: number;
  loading?: boolean;
  label?: string;
  compact?: boolean;
  className?: string;
}

const AccountBalanceBar: React.FC<AccountBalanceBarProps> = ({
  balanceUsd,
  loading = false,
  label = 'Доступный баланс',
  compact = false,
  className = '',
}) => {
  const { formatPrice, currencyCode, baseCurrency, rateAvailable } = useCurrency();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Haptic.tap();
          setPickerOpen(true);
        }}
        className={`account-balance-bar group text-left ${compact ? 'account-balance-bar--compact' : ''} ${className}`}
        aria-label={`${label}. Изменить валюту`}
      >
        <span className="account-balance-bar__icon"><Wallet size={compact ? 14 : 16} /></span>
        <span className="min-w-0 flex-1">
          <span className="account-balance-bar__label">{label}</span>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-28 bg-surfaceElevated" />
          ) : baseCurrency !== 'usd' && !rateAvailable ? (
            <span className="account-balance-bar__value text-textMuted">Курс недоступен</span>
          ) : (
            <span className="account-balance-bar__value">
              {formatPrice(Number(balanceUsd) || 0, { fractionDigits: 2 })}
              <span className="account-balance-bar__currency">{currencyCode}</span>
            </span>
          )}
        </span>
        <ChevronDown size={14} className="text-textSubtle transition-colors group-hover:text-textSecondary" />
      </button>
      <CurrencyPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
};

export default AccountBalanceBar;
