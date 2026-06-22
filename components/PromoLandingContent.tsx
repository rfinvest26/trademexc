import React from 'react';
import { ArrowRight, LockKeyhole, RadioTower, WalletCards } from 'lucide-react';

interface PromoLandingContentProps {
  onAction: () => void;
}

const proofCards = [
  {
    title: 'Everyday Airdrops',
    value: '1,000%+',
    caption: 'Launchpool APR windows',
    Icon: RadioTower,
  },
  {
    title: 'Futures Maker',
    value: '0%',
    caption: 'Clear fee path for high-volume traders',
    Icon: WalletCards,
  },
  {
    title: 'Asset Safety',
    value: '3 pillars',
    caption: 'KYC, reserves mindset and support flow',
    Icon: LockKeyhole,
  },
];

const PromoLandingContent: React.FC<PromoLandingContentProps> = ({ onAction }) => {
  return (
    <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[18px] bg-white/[0.035] p-5 ring-1 ring-white/[0.07] lg:p-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-neon">MEXC advantage</p>
            <h2 className="mt-2 text-[30px] font-black leading-none tracking-[-0.045em] text-white sm:text-[38px]">
              Low fees.
              <br />
              Deep books.
              <br />
              Less noise.
            </h2>
          </div>
          <button
            type="button"
            onClick={onAction}
            className="hidden h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-black text-[#06111f] transition-transform active:scale-[0.98] sm:inline-flex"
          >
            Trade now
            <ArrowRight size={15} strokeWidth={2.5} />
          </button>
        </div>

        <div className="grid gap-2">
          {proofCards.map(({ title, value, caption, Icon }) => (
            <button
              key={title}
              type="button"
              onClick={onAction}
              className="group flex items-center gap-4 rounded-2xl bg-background/56 px-4 py-3 text-left ring-1 ring-white/[0.05] transition-colors hover:bg-background/78"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neon/[0.10] text-neon ring-1 ring-neon/15">
                <Icon size={19} strokeWidth={2.1} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-white">{title}</span>
                <span className="mt-0.5 block text-[12px] text-textMuted">{caption}</span>
              </span>
              <span className="font-mono text-[15px] font-black text-neon">{value}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[18px] bg-[#07111e] p-5 ring-1 ring-white/[0.07] lg:p-6">
        <div className="pointer-events-none absolute inset-0 opacity-90" aria-hidden>
          <svg className="h-full w-full" viewBox="0 0 720 420" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="liquidityA" x1="76" y1="340" x2="620" y2="96" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2b82f6" stopOpacity="0.30" />
                <stop offset="1" stopColor="#00d26a" stopOpacity="0.06" />
              </linearGradient>
            </defs>
            <path d="M0 321C87 296 133 306 207 260C292 207 319 119 411 107C512 94 582 168 720 128V420H0V321Z" fill="url(#liquidityA)" />
            <path d="M34 300C122 270 161 289 236 238C304 193 341 123 418 108C510 90 585 166 682 142" fill="none" stroke="#2b82f6" strokeOpacity="0.45" strokeWidth="2" />
            <path d="M68 358H652M68 286H652M68 214H652M68 142H652" stroke="white" strokeOpacity="0.035" />
          </svg>
        </div>

        <div className="relative z-10 flex h-full min-h-[340px] flex-col justify-between">
          <div className="max-w-md">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-textMuted">Liquidity snapshot</p>
            <h2 className="mt-2 text-[26px] font-black leading-tight tracking-[-0.04em] text-white sm:text-[34px]">
              Built around the table, not around decoration.
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-textSecondary">
              The interface now prioritizes price, movement, fees and action. Decorative borders were replaced with controlled depth and data hierarchy.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['BTC', '100K', '+2.34%'],
              ['ETH', '3.3K', '+1.18%'],
              ['SOL', '166', '+4.02%'],
              ['TON', '5.56', '-0.62%'],
            ].map(([pair, price, change]) => (
              <button
                key={pair}
                type="button"
                onClick={onAction}
                className="rounded-2xl bg-background/68 p-3 text-left ring-1 ring-white/[0.06] transition-colors hover:bg-background/88"
              >
                <span className="font-mono text-[12px] font-bold text-textMuted">{pair}/USDT</span>
                <span className="mt-2 block font-mono text-[19px] font-black text-white">{price}</span>
                <span className={`mt-1 block font-mono text-[12px] font-bold ${change.startsWith('-') ? 'text-down' : 'text-up'}`}>
                  {change}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PromoLandingContent;
