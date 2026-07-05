import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Haptic } from '../../utils/haptics';

interface DepositMethodSheetProps {
  open: boolean;
  onClose: () => void;
  onSelectP2P: () => void;
  onSelectCrypto: () => void;
}

const iconStroke = {
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

const DepositMethodSheet: React.FC<DepositMethodSheetProps> = ({
  open,
  onSelectP2P,
  onSelectCrypto,
}) => {
  if (!open) return null;

  return (
    <div className="px-4 lg:px-6 pt-3 pb-2 animate-fade-in space-y-4">
      <div>
        <div className="px-1 py-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-textMuted">
            Способ пополнения
          </p>
          <p className="mt-1 text-xs text-textSubtle">
            Выберите P2P или криптовалютный перевод
          </p>
        </div>

        <div className="space-y-2.5 pt-3">
          <button
            onClick={() => {
              Haptic.light();
              onSelectP2P();
            }}
            className="w-full flex items-center gap-4 rounded-xl bg-surfaceElevated px-4 py-3.5 transition-all duration-200 active:scale-[0.99] hover:bg-white/[0.03] cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-neon bg-white/[0.04]">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...iconStroke}>
                <path d="M17 1l4 4-4 4" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <path d="M7 23l-4-4 4-4" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-textPrimary text-sm">P2P Торговля</span>
                <span className="text-[10px] text-textMuted bg-white/[0.04] px-1.5 py-0.5 rounded-full">0% комиссия</span>
              </div>
              <span className="text-xs text-textMuted">Банковский перевод · Выбор продавца</span>
            </div>
            <ChevronRight size={16} strokeWidth={1.5} className="text-textMuted shrink-0" aria-hidden />
          </button>

          <button
            onClick={() => {
              Haptic.light();
              onSelectCrypto();
            }}
            className="w-full flex items-center gap-4 rounded-xl bg-surfaceElevated px-4 py-3.5 transition-all duration-200 active:scale-[0.99] hover:bg-white/[0.03] cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-neon bg-white/[0.04]">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...iconStroke}>
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-textPrimary text-sm">Криптовалюта</span>
                <span className="text-[10px] text-textSubtle">≈ 1–5 мин</span>
              </div>
              <span className="text-xs text-textMuted">USDT TRC20 · TON · BTC · SOL</span>
            </div>
            <ChevronRight size={16} strokeWidth={1.5} className="text-textMuted shrink-0" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DepositMethodSheet;
