import React from 'react';
import { AlertCircle, Copy } from 'lucide-react';
import BottomSheetFooter from '../BottomSheetFooter';
import { Haptic } from '../../utils/haptics';

interface CryptoNetworkOption {
  id: string;
  label: string;
  sub: string;
  icon: string;
}

interface CryptoWalletLike {
  wallet_address?: string | null;
}

interface CryptoPaymentStepProps {
  net: CryptoNetworkOption | undefined;
  cryptoWallet: CryptoWalletLike | null;
  amountLabel?: string;
  instruction: string;
  onCancel: () => void;
  onProceed: () => void;
}

const CryptoPaymentStep: React.FC<CryptoPaymentStepProps> = ({
  net,
  cryptoWallet,
  amountLabel,
  instruction,
  onCancel,
  onProceed,
}) => {
  return (
    <div className="pt-6 px-4 flex flex-col min-h-0 overflow-y-auto">
      <div className="rounded-2xl overflow-hidden mb-3 shrink-0 bg-surfaceElevated ring-1 ring-white/5">
        <div className="px-4 py-5 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center mb-3 bg-background/40 ring-1 ring-white/5">
            {net?.icon && <img src={net.icon} alt="" className="w-7 h-7 object-contain" />}
          </div>
          <div className="text-xs text-textMuted mb-1">{net?.label} · {net?.sub}</div>
          {amountLabel ? <div className="text-sm font-semibold text-textPrimary mb-2">{amountLabel}</div> : null}
          <div className="text-xs text-textSubtle uppercase tracking-wider mb-3">Адрес кошелька</div>
          {cryptoWallet?.wallet_address ? (
            <>
              <div className="font-mono text-sm text-textPrimary break-all rounded-xl p-3 mb-2 w-full bg-surface">
                {cryptoWallet.wallet_address}
              </div>
              <button
                className="flex items-center gap-1.5 text-xs text-neon cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => {
                  navigator.clipboard.writeText(cryptoWallet.wallet_address || '');
                  Haptic.tap();
                }}
              >
                <Copy size={13} /> Копировать адрес
              </button>
            </>
          ) : (
            <p className="text-sm text-textSecondary">Кошелёк не указан. Обратитесь в поддержку.</p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-3 shrink-0 bg-surfaceElevated ring-1 ring-white/5">
        <AlertCircle size={13} className="text-textSecondary mt-0.5 shrink-0" />
        <span className="text-[11px] text-textSecondary">{instruction}</span>
      </div>

      <BottomSheetFooter
        onCancel={onCancel}
        onConfirm={onProceed}
        confirmLabel="Я оплатил"
        cancelLabel="Отмена"
        sticky
        reserveBottomNav
      />
    </div>
  );
};

export default CryptoPaymentStep;
