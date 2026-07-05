import React from 'react';
import { Haptic } from '../../utils/haptics';
import { useLanguage } from '../../context/LanguageContext';
import AppInput from '../AppInput';
import AppButton from '../AppButton';

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
        <div className="flex items-center gap-2">
          <AppInput
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="font-mono text-xl font-semibold"
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
              className="px-2.5 py-1 rounded-full text-xs font-mono text-textSecondary transition-all duration-200 active:scale-[0.98] hover:bg-white/[0.03] bg-surfaceElevated cursor-pointer"
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
      <AppButton
        onClick={onSubmit}
        disabled={submitting || !amount}
        block
        className="text-up bg-up/10 hover:bg-up/15"
      >
        {t('next')}
      </AppButton>
    </div>
  );
};

export default DepositAmountStep;
