import React from 'react';
import { Haptic } from '../../utils/haptics';

export interface CryptoNetworkOption {
  id: string;
  label: string;
  sub: string;
  icon: string;
}

interface CryptoNetworkSheetProps {
  open: boolean;
  onClose: () => void;
  networks: CryptoNetworkOption[];
  onSelect: (networkId: string) => void;
}

const CryptoNetworkSheet: React.FC<CryptoNetworkSheetProps> = ({
  open,
  networks,
  onSelect,
}) => {
  if (!open) return null;

  return (
    <div className="px-4 lg:px-6 pb-2 animate-fade-in">
      <div className="rounded-3xl bg-surfaceElevated overflow-hidden ring-1 ring-white/5">
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-textMuted">
            Выбор сети
          </p>
          <p className="mt-1 text-xs text-textSubtle">
            Выберите сеть для перевода криптовалюты
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-3">
          {networks.map((net) => (
            <button
              key={net.id}
              onClick={() => {
                Haptic.light();
                onSelect(net.id);
              }}
              className="flex flex-col items-center rounded-2xl bg-surface px-3 py-4 transition-all duration-200 active:scale-[0.98] hover:bg-surfaceElevated hover:shadow-lg cursor-pointer"
            >
              <div className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-background/40 ring-1 ring-white/5 overflow-hidden">
                <img src={net.icon} alt="" className="h-7 w-7 object-contain" />
              </div>
              <span className="text-sm font-medium text-textPrimary">{net.label}</span>
              <span className="mt-0.5 text-[10px] text-textSubtle">{net.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CryptoNetworkSheet;
