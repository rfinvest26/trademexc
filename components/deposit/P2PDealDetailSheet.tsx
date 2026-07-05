import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, Star, Users, X } from 'lucide-react';
import FormField from '../FormField';
import AppSheet from '../AppSheet';

export interface FakeP2PDeal {
  id: string;
  sellerName: string;
  sellerDeals: number;
  sellerRating: number;
  sellerCompletion: number;
  bank: string;
  amount: number;
  minLimit: number;
  maxLimit: number;
  avatarColor: string;
  avatarInitial: string;
}

interface P2PDealDetailSheetProps {
  deal: FakeP2PDeal | null;
  currSym: string;
  flagEmoji: string;
  countryName: string;
  onClose: () => void;
  onOpen: (deal: FakeP2PDeal, amount: number) => void;
  opening: boolean;
}

const P2PDealDetailSheet: React.FC<P2PDealDetailSheetProps> = ({
  deal,
  currSym,
  flagEmoji,
  countryName,
  onClose,
  onOpen,
  opening,
}) => {
  const [inputAmount, setInputAmount] = useState<string>('');

  useEffect(() => {
    if (deal) {
      document.body.style.overflow = 'hidden';
      setInputAmount('');
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [deal]);

  if (!deal) return null;

  const parsedAmount = parseFloat(inputAmount) || 0;
  const isAmountValid = parsedAmount >= deal.minLimit && parsedAmount <= deal.maxLimit;

  return (
    <AppSheet
      open={Boolean(deal)}
      onClose={onClose}
      zIndex={100}
      panelClassName="max-w-md flex flex-col pb-safe relative"
    >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="app-icon-button absolute right-3 top-2.5 shrink-0"
          aria-label="Закрыть"
        >
          <X size={16} strokeWidth={2} />
        </button>

        <div className="px-4 pt-2.5 pb-5">
          <div className="flex items-center gap-2.5 mb-4 pr-8">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
              style={{ backgroundColor: deal.avatarColor }}
            >
              {deal.avatarInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-textPrimary text-[14px] truncate">{deal.sellerName}</span>
                <span className="flex items-center gap-0.5 text-xs text-textSecondary font-mono shrink-0">
                  <Star size={10} fill="currentColor" />
                  {deal.sellerRating.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-textSecondary mt-0.5">
                <span className="flex items-center gap-1">
                  <Users size={10} className="text-textMuted" />
                  {deal.sellerDeals.toLocaleString()} сд.
                </span>
                <span className="w-1 h-1 rounded-full bg-[#1a202f]" />
                <span className="text-emerald-400 font-semibold">{deal.sellerCompletion}%</span>
                <span className="text-textMuted">завершено</span>
              </div>
            </div>
          </div>

          <div className="app-panel p-3 space-y-2.5 mb-4">
            {[
              { label: 'Сумма сделки', value: `${(isAmountValid ? parsedAmount : deal.amount).toLocaleString('ru-RU')} ${currSym}`, highlight: true },
              { label: 'Банк', value: deal.bank },
              { label: 'Лимиты', value: `${deal.minLimit.toLocaleString()} — ${deal.maxLimit.toLocaleString()} ${currSym}` },
              { label: 'Страна', value: `${flagEmoji} ${countryName}` },
              { label: 'Комиссия', value: '0%', textClass: 'text-emerald-400 font-bold' },
            ].map(({ label, value, highlight, textClass }) => (
              <div key={label} className="flex justify-between items-center text-[13px]">
                <span className="text-textSecondary">{label}</span>
                <span className={`font-semibold ${highlight ? 'text-emerald-400 font-mono text-[14px]' : textClass || 'text-textPrimary'}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <FormField
              id="p2p-deal-amount"
              size="sm"
              label={`Введите точную сумму пополнения (${currSym})`}
              type="number"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              placeholder={`Например: ${deal.amount}`}
              rightSlot={<span className="text-xs font-semibold text-textSecondary">{currSym}</span>}
              inputClassName="font-mono"
            />
            {inputAmount && !isAmountValid && (
              <span className="text-red-400 text-xs mt-1 block font-medium animate-fade-in">
                {parsedAmount < deal.minLimit
                  ? `Минимальная сумма: ${deal.minLimit.toLocaleString()} ${currSym}`
                  : `Максимальная сумма: ${deal.maxLimit.toLocaleString()} ${currSym}`}
              </span>
            )}
          </div>

          <div className="mb-4 app-panel p-3 text-textSecondary text-xs leading-relaxed flex gap-2">
            <AlertCircle size={14} className="shrink-0 text-textSecondary mt-0.5" />
            <div className="text-textSecondary text-[11px]">
              <span className="font-semibold text-textPrimary block mb-0.5">Обратите внимание:</span>
              Мерчант может добавить небольшую случайную копейку к вашей сумме для идентификации платежа. Переводить нужно <strong className="text-textPrimary font-semibold">строго точную сумму</strong>, которую укажут в реквизитах и комментарии!
            </div>
          </div>

          <button
            onClick={() => onOpen(deal, parsedAmount)}
            disabled={opening || !inputAmount || !isAmountValid}
            className="app-button-primary w-full disabled:opacity-40"
          >
            {opening ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Купить {isAmountValid ? `${parsedAmount.toLocaleString('ru-RU')} ${currSym}` : ''}
                <ArrowRight size={15} className="shrink-0" />
              </>
            )}
          </button>

          <p className="text-[10px] text-textSubtle text-center mt-2.5">
            Запрос уйдёт продавцу · Ожидайте реквизиты
          </p>
        </div>
    </AppSheet>
  );
};

export default P2PDealDetailSheet;
