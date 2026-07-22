import React from 'react';
import NftArtwork from './NftArtwork';
import { type NftListingRow } from '../lib/nftCatalog';
import { Haptic } from '../utils/haptics';

interface NftHorizontalStripProps {
  title: string;
  items: NftListingRow[];
  onItemClick: (item: NftListingRow) => void;
  activeCodeKey?: string;
  renderPrice?: (item: NftListingRow) => React.ReactNode;
}

const NftHorizontalStrip: React.FC<NftHorizontalStripProps> = ({
  title,
  items,
  onItemClick,
  activeCodeKey,
  renderPrice,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-col space-y-3 py-4">
      <div className="px-4 flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-textPrimary uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-[10px] text-textMuted font-medium tabular-nums">
          {items.length} items
        </span>
      </div>
      
      <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory px-4 pb-2">
        {items.map((item) => {
          const isActive = item.codeKey === activeCodeKey;
          return (
            <button
              key={`${item.collectionSlug}-${item.codeKey}`}
              type="button"
              onClick={() => {
                Haptic.tap();
                onItemClick(item);
              }}
              className={`snap-start shrink-0 w-36 flex flex-col rounded-[16px] overflow-hidden transition-all duration-300 active:scale-[0.97] hover:-translate-y-1 hover:shadow-lg ${
                isActive
                  ? 'bg-surface shadow-md'
                  : 'bg-surfaceElevated hover:bg-surface'
              }`}
            >
              <div className="aspect-square relative overflow-hidden bg-surface">
                <NftArtwork
                  src={item.imageUrl}
                  alt={item.codeDisplay}
                  className="h-full w-full transition-transform duration-500 group-hover:scale-[1.02]"
                />
                {isActive && (
                  <div className="absolute bottom-1.5 left-1.5">
                    <div className="bg-black/60 backdrop-blur-sm text-white/90 text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-md shadow-sm">
                      CURRENT
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-2.5 flex flex-col gap-0.5 min-w-0">
                <div className="text-[9px] text-textMuted truncate uppercase tracking-tight font-semibold">
                  {item.collectionName}
                </div>
                <div className="font-mono text-[12px] font-bold text-textPrimary truncate">
                  {item.codeDisplay}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {renderPrice ? (
                    renderPrice(item)
                  ) : (
                    <>
                      <span className="text-[11px] font-bold text-neon tabular-nums">
                        {item.priceEth.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </span>
                      <span className="text-[8px] text-textMuted font-bold uppercase tracking-tighter">USD</span>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NftHorizontalStrip;
