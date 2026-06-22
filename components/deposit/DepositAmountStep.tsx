import React from 'react';
import { Haptic } from '../../utils/haptics';
import { useLanguage } from '../../context/LanguageContext';

interface DepositAmountStepProps {
  amount: string;
  symbol: string;
  minUsdValue: number;
  setAmount: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
}

const AMOUNT_PRESETS = [10, 50, 100, 500, 1000];

const DepositAmountStep: React.FC<DepositAmountStepProps> = ({
  amount,
  symbol,
  minUsdValue,
  setAmount,
  onSubmit,
  submitting = false,
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-3 pt-4 px-4 animate-fade-in">
      <div className="space-y-1.5">
        <label className="text-[10px] text-textSubtle uppercase tracking-cap font-medium pl-1">{t('amount_deposit')}</label>
        <div className="rounded-2xl px-4 py-3 flex items-center gap-2 bg-surfaceElevated ring-1 ring-white/5">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent text-textPrimary font-mono text-xl font-semibold outline-none placeholder:text-textMuted"
            placeholder="0"
          />
          <span className="text-textSubtle text-sm">{symbol}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AMOUNT_PRESETS.map((v) => (
            <button
              key={v}
              onClick={() => {
                Haptic.tap();
                setAmount(String(v));
              }}
              className="px-2.5 py-1 rounded-full text-xs font-mono text-textSecondary transition-all duration-200 active:scale-[0.98] hover:bg-white/[0.03] bg-surfaceElevated ring-1 ring-white/5 cursor-pointer"
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex justify-between px-1">
          <span className="text-[10px] text-textSubtle">{t('min_deposit', { amount: minUsdValue })} {symbol}</span>
          <span className="text-[10px] text-textSubtle">{t('max_deposit', { amount: 50000 })} {symbol}</span>
        </div>
      </div>
      <button
        onClick={onSubmit}
        disabled={submitting || !amount}
        className="w-full py-3.5 rounded-full font-semibold text-sm text-up bg-up/10 transition-all duration-200 active:scale-95 disabled:opacity-50 hover:bg-up/15 cursor-pointer"
      >
        {t('next')}
      </button>
    </div>
  );
};

export default DepositAmountStep;
