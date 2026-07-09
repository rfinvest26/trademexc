import React, { useMemo, useState } from 'react';
import { X, Gem } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import AppSheet from './AppSheet';
import AppInput from './AppInput';
import AppButton from './AppButton';

export type NftSellKind = 'market' | 'order';

interface NftOrderTicketProps {
  mode: 'buy' | 'sell';
  nftLabel: string;
  imageUrl?: string | null;
  defaultPriceUsd: number;
  quantity?: number;
  submitting?: boolean;
  /** Показать переключатель «Рыночная / Ордерная» (только для продажи). */
  sellKinds?: boolean;
  onSubmit: (priceUsd: number, kind?: NftSellKind) => void;
  onClose: () => void;
}

const PRESETS = [0.9, 1, 1.1, 1.25];

/**
 * Ордер-тикет NFT в стиле биржи: пользователь вводит сумму (цену заявки),
 * видит итог и создаёт заявку. Ввод статичный (поле фиксировано, не прыгает).
 */
const NftOrderTicket: React.FC<NftOrderTicketProps> = ({
  mode,
  nftLabel,
  imageUrl,
  defaultPriceUsd,
  quantity = 1,
  submitting = false,
  sellKinds = false,
  onSubmit,
  onClose,
}) => {
  const marketPrice = Math.round(defaultPriceUsd * 100) / 100;
  const [priceStr, setPriceStr] = useState<string>(defaultPriceUsd > 0 ? String(marketPrice) : '');
  const [kind, setKind] = useState<NftSellKind>('market');
  const isBuy = mode === 'buy';
  const showKinds = !isBuy && sellKinds;
  const isMarket = showKinds && kind === 'market';
  const typedPrice = useMemo(() => Number(priceStr.replace(',', '.')) || 0, [priceStr]);
  const price = isMarket ? marketPrice : typedPrice;
  const valid = price > 0;
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));

  return (
    <AppSheet
      open
      onClose={onClose}
      zIndex={70}
      panelClassName="px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
    >
        {/* Grabber */}
        <div className="flex justify-center pb-3">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-surfaceElevated shrink-0 flex items-center justify-center">
            {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Gem size={18} className="text-accent" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-textPrimary truncate">{nftLabel}</div>
            <div className={`text-[11px] font-semibold ${isBuy ? 'text-up' : 'text-red-400'}`}>
              {isBuy
                ? 'Заявка на покупку'
                : showKinds
                  ? (isMarket ? 'Рыночная продажа' : 'Ордерная продажа')
                  : `Заявка на продажу${qty > 1 ? ` · x${qty}` : ''}`}
            </div>
          </div>
          <button type="button" onClick={onClose} className="app-icon-button">
            <X size={18} />
          </button>
        </div>

        {/* Тип продажи: Рыночная / Ордерная */}
        {showKinds && (
          <div className="flex gap-1 p-1 rounded-full bg-surfaceElevated mt-4">
            {(['market', 'order'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { Haptic.tap(); setKind(k); }}
                className={`flex-1 py-2 rounded-full text-[12px] font-semibold transition-colors ${
                  kind === k ? 'bg-red-500 text-white' : 'text-textSubtle hover:text-textPrimary'
                }`}
              >
                {k === 'market' ? 'Рыночная' : 'Ордерная'}
              </button>
            ))}
          </div>
        )}

        {/* Amount input (статичный) */}
        <div className="pt-4 space-y-1.5">
          <label className="text-[10px] text-textSubtle uppercase tracking-cap font-medium pl-1">
            {isBuy ? 'Сумма покупки' : 'Сумма продажи'} (USD)
          </label>
          {isMarket ? (
            <div className="flex items-center gap-2 rounded-xl bg-surfaceElevated px-4 py-3">
              <span className="font-mono text-2xl font-bold text-textPrimary">{marketPrice}</span>
              <span className="text-textSubtle text-sm font-semibold">USDT</span>
              <span className="ml-auto text-[10px] text-textMuted uppercase tracking-cap">по текущей цене</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AppInput
                type="text"
                inputMode="decimal"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                autoFocus
                className="font-mono text-2xl font-bold"
                placeholder="0"
              />
              <span className="text-textSubtle text-sm font-semibold">USDT</span>
            </div>
          )}
          {!isMarket && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESETS.map((mult) => {
                const v = Math.round(defaultPriceUsd * mult * 100) / 100;
                const pct = Math.round((mult - 1) * 100);
                const label = pct === 0 ? 'рыночная' : `${pct > 0 ? '+' : ''}${pct}%`;
                return (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => { Haptic.tap(); setPriceStr(String(v)); }}
                    className="px-2.5 py-1 rounded-full text-xs font-mono text-textSecondary bg-surfaceElevated active:scale-[0.98]"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {showKinds && (
            <p className="text-[10px] text-textMuted leading-tight pl-1 pt-0.5">
              {isMarket
                ? 'Мгновенно по текущей стоимости — USD зачислится сразу.'
                : 'Заявка по вашей цене — подтверждает воркер в боте.'}
            </p>
          )}
        </div>

        {/* Summary */}
        <div className="mt-4 rounded-xl bg-surfaceElevated px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-[12px]">
            <span className="text-textMuted">{isBuy || qty <= 1 ? 'Рыночная цена' : 'Рыночная сумма'}</span>
            <span className="font-mono text-textSecondary">${marketPrice}</span>
          </div>
          {!isBuy && qty > 1 ? (
            <div className="flex justify-between text-[12px]">
              <span className="text-textMuted">Количество</span>
              <span className="font-mono text-textSecondary">x{qty}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-[13px]">
            <span className="text-textMuted">{isBuy ? 'К оплате' : 'Вы получите'}</span>
            <span className={`font-mono font-bold ${isBuy ? 'text-up' : 'text-red-400'}`}>${price || 0}</span>
          </div>
        </div>

        <AppButton
          type="button"
          onClick={() => { if (valid && !submitting) { Haptic.medium(); onSubmit(price, showKinds ? kind : undefined); } }}
          disabled={!valid || submitting}
          variant={isBuy ? 'primary' : 'destructive'}
          block
          className={`mt-4 ${
            isBuy ? 'bg-up text-black' : 'bg-red-500 text-white'
          }`}
        >
          {submitting
            ? '...'
            : isBuy
              ? 'Создать заявку на покупку'
              : isMarket
                ? 'Продать по рынку'
                : showKinds
                  ? 'Создать заявку на продажу'
                  : 'Создать заявку на продажу'}
        </AppButton>
    </AppSheet>
  );
};

export default NftOrderTicket;
