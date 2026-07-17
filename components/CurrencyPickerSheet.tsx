import React, { useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { SUPPORTED_CURRENCIES, useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { updateUserPreferredCurrency } from '../lib/userPreferences';
import { Haptic } from '../utils/haptics';
import { logAction } from '../lib/appLog';

interface CurrencyPickerSheetProps {
  open: boolean;
  onClose: () => void;
}

const CurrencyPickerSheet: React.FC<CurrencyPickerSheetProps> = ({ open, onClose }) => {
  const {
    baseCurrency,
    setBaseCurrency,
    rates,
    loading,
    rateAvailable,
    rateUpdatedAt,
    refreshRates,
  } = useCurrency();
  const { user, refreshUser } = useUser();
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);

  const selectCurrency = async (code: string) => {
    if (saving || code === baseCurrency) return;
    const previous = baseCurrency;
    Haptic.tap();
    setSaving(code);
    setBaseCurrency(code);
    try {
      if (user?.user_id) {
        await updateUserPreferredCurrency(user.user_id, code);
        void logAction('currency_change', {
          userId: user.user_id,
          payload: { from: previous.toUpperCase(), to: code.toUpperCase() },
        });
        await refreshUser();
      }
      Haptic.success();
      onClose();
    } catch (error) {
      console.warn('[currency] Failed to save preference', error);
      setBaseCurrency(previous);
      toast.show('Не удалось сохранить валюту. Попробуйте ещё раз.', 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Валюта счёта"
      variant="expandable"
      showCloseButton
      contentClassName="currency-picker-sheet"
    >
      <div className="px-4 pb-5">
        <div className="mb-3 flex items-center justify-between gap-3 border border-border bg-surface px-3 py-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-textSubtle">Курс отображения</p>
            <p className="mt-1 font-mono text-xs text-textSecondary">
              {baseCurrency === 'usd'
                ? '1 USD = 1 USD'
                : rateAvailable
                  ? `1 USD = ${Number(rates?.usd?.[baseCurrency]).toLocaleString('ru-RU', { maximumFractionDigits: 6 })} ${baseCurrency.toUpperCase()}`
                  : 'Курс временно недоступен'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRates()}
            disabled={loading}
            className="h-9 w-9 border border-border text-textSecondary hover:border-hairlineStrong hover:text-textPrimary disabled:opacity-50 flex items-center justify-center"
            aria-label="Обновить курсы"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden border border-border bg-border">
          {SUPPORTED_CURRENCIES.map((currency) => {
            const active = currency.code === baseCurrency;
            const available = currency.code === 'usd' || (Boolean(rateUpdatedAt) && Number(rates?.usd?.[currency.code]) > 0);
            return (
              <button
                key={currency.code}
                type="button"
                onClick={() => void selectCurrency(currency.code)}
                disabled={!available || saving !== null}
                className={`min-h-14 bg-background px-3 py-2.5 flex items-center gap-3 text-left transition-colors disabled:opacity-40 ${
                  active ? 'text-textPrimary' : 'text-textSecondary hover:bg-surface'
                }`}
              >
                <span className="w-9 font-mono text-sm font-semibold text-textPrimary">{currency.symbol}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{currency.code.toUpperCase()}</span>
                  <span className="block truncate text-[11px] text-textMuted">{currency.name}</span>
                </span>
                {active ? <Check size={16} className="text-up" /> : null}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-textMuted">
          Ввод сумм, лимиты, сделки, пополнение и вывод отображаются в выбранной валюте. Хранение и расчёт результата выполняются в USD по актуальному курсу.
          {rateUpdatedAt ? ` Дата курса: ${rateUpdatedAt}.` : ''}
        </p>
      </div>
    </BottomSheet>
  );
};

export default CurrencyPickerSheet;
