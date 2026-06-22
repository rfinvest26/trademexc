import React, { useState } from 'react';
import { motion } from 'framer-motion';
import LegalDocModal, { LegalDocId } from '../components/LegalDocModal';
import PromoLandingContent from '../components/PromoLandingContent';
import AssetTable from '../components/AssetTable';
import { useLiveAssets } from '../utils/useLiveAssets';
import { MOCK_ASSETS, ETORO_LOGO_URL } from '../constants';
import { ArrowRight, ShieldCheck, Sparkles, Zap } from 'lucide-react';

interface LandingPageProps {
  refId: string;
  bonus: number | null;
  onLogin: () => void;
  onRegister: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ refId, bonus, onLogin, onRegister }) => {
  const [legal, setLegal] = useState<LegalDocId | null>(null);
  const liveAssets = useLiveAssets(MOCK_ASSETS);
  const featuredAssets = liveAssets.slice(0, 6);
  const tapeAssets = featuredAssets.length ? featuredAssets : MOCK_ASSETS.slice(0, 6);

  const trustItems = [
    { label: 'Assets', value: '3,000+' },
    { label: 'Markets', value: 'Spot + Futures' },
    { label: 'Maker fee', value: '0%' },
  ];

  return (
    <div className="h-[100dvh] overflow-y-auto overflow-x-hidden bg-background text-white relative no-scrollbar">
      <div className="pointer-events-none absolute inset-0 landing-depth-bg" aria-hidden />

      <header className="sticky top-0 z-30 w-full border-b border-white/[0.06] bg-background/86 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={onRegister} className="flex items-center gap-2.5 text-left">
            <img src={ETORO_LOGO_URL} alt="MEXC" width={28} height={28} className="object-contain" />
            <span className="text-[18px] font-black tracking-[-0.02em] text-white">MEXC</span>
          </button>
          <nav className="hidden items-center gap-7 text-[13px] font-semibold text-textSecondary md:flex">
            <button type="button" onClick={onRegister} className="hover:text-white transition-colors">Markets</button>
            <button type="button" onClick={onRegister} className="hover:text-white transition-colors">Futures</button>
            <button type="button" onClick={onRegister} className="hover:text-white transition-colors">Earn</button>
            <button type="button" onClick={onRegister} className="hover:text-white transition-colors">Security</button>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onLogin}
              className="h-9 rounded-lg px-3 text-[13px] font-semibold text-textSecondary transition-colors hover:text-white"
            >
              Log In
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="h-9 rounded-lg bg-accent px-4 text-[13px] font-bold text-white transition-transform active:scale-[0.98] hover:opacity-90"
            >
              Sign Up
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-9">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="mb-6 max-w-2xl text-[44px] font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-[56px] lg:text-[64px]">
              Trade crypto with exchange-grade speed.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-7 text-textSecondary sm:text-[17px]">
              MEXC-style market access for spot, futures, rewards and asset security. Clean execution, live prices and a direct path from discovery to trade.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onRegister}
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-[15px] font-black text-white transition-all hover:opacity-90 active:scale-[0.985]"
              >
                Start Trading
                <ArrowRight size={17} strokeWidth={2.4} className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={onLogin}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-surfaceElevated px-6 text-[15px] font-bold text-white transition-colors hover:bg-surface"
              >
                Open Account
              </button>
            </div>

            {refId ? (
              <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-xl bg-accentMuted px-3 py-2 text-[12px] font-semibold text-accent">
                <Sparkles size={15} />
                <span className="truncate">
                  {bonus
                    ? `${bonus.toLocaleString()} bonus applied from your referral link`
                    : 'Referral link applied'}
                </span>
              </div>
            ) : null}

            <div className="mt-8 grid max-w-2xl grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-4">
              {trustItems.map((item) => (
                <div key={item.label} className="px-3 first:pl-0 last:pr-0">
                  <div className="text-[17px] font-black tracking-[-0.02em] text-white sm:text-[20px]">{item.value}</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-textMuted">{item.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="landing-animate landing-d2">
            <div className="landing-terminal relative overflow-hidden rounded-[22px] bg-surfaceElevated/50 p-3 backdrop-blur-sm">
              <MarketDepthSvg />
              <div className="relative z-10 rounded-[18px] bg-background/76 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-textMuted">Live market</div>
                    <div className="mt-1 flex items-center gap-2 text-[15px] font-black text-white">
                      BTC/USDT
                      <span className="rounded-md bg-up/12 px-1.5 py-0.5 font-mono text-[11px] text-up">+2.34%</span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-accentMuted px-3 py-2 text-right">
                    <div className="font-mono text-[15px] font-black text-accent">$100,000</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-textMuted">Index</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {tapeAssets.slice(0, 6).map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={onRegister}
                      className="rounded-xl bg-white/[0.035] px-3 py-2 text-left transition-colors hover:bg-white/[0.055]"
                    >
                      <div className="flex items-center gap-2">
                        {asset.logoUrl ? <img src={asset.logoUrl} alt="" className="h-5 w-5 rounded-full" loading="lazy" referrerPolicy="no-referrer" /> : null}
                        <span className="font-mono text-[12px] font-bold text-white">{asset.ticker}</span>
                      </div>
                      <div className={`mt-1 font-mono text-[11px] ${(asset.change24h ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                        {asset.change24h > 0 ? '+' : ''}{(asset.change24h ?? 0).toFixed(2)}%
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-animate landing-d3 mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-[18px] bg-surface p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <h2 className="text-[18px] font-black tracking-[-0.02em] text-white">Trending Markets</h2>
                <p className="text-[12px] text-textMuted">Real-time pairs with compact exchange density.</p>
              </div>
              <button type="button" onClick={onRegister} className="hidden rounded-lg px-3 py-2 text-[12px] font-bold text-accent hover:bg-accentMuted sm:block">
                View All
              </button>
            </div>
            <AssetTable assets={featuredAssets} onAssetClick={onRegister} hideFilterBar variant="minimal" />
          </div>

          <div className="rounded-[18px] bg-surfaceElevated p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white">
              <ShieldCheck size={23} strokeWidth={2.4} />
            </div>
            <h2 className="mt-5 text-[24px] font-black leading-tight tracking-[-0.04em] text-white">Security first, reward ready.</h2>
            <p className="mt-3 text-[14px] leading-6 text-textSecondary">
              Identity checks, reserve-minded messaging and a clear account path build trust before the first trade.
            </p>
            <button
              type="button"
              onClick={onRegister}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-black text-[#06111f] active:scale-[0.98]"
            >
              Claim rewards
              <Zap size={15} fill="currentColor" />
            </button>
          </div>
        </section>

        <PromoLandingContent onAction={onRegister} />

        <section className="mt-10 border-t border-white/[0.07] py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-textSubtle">&copy; {new Date().getFullYear()} MEXC. Trade responsibly.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-medium text-textMuted">
              <button type="button" onClick={() => setLegal('tos')} className="hover:text-textPrimary">Terms</button>
              <button type="button" onClick={() => setLegal('privacy')} className="hover:text-textPrimary">Privacy</button>
              <button type="button" onClick={() => setLegal('aml')} className="hover:text-textPrimary">AML/KYC</button>
              <button type="button" onClick={() => setLegal('cookies')} className="hover:text-textPrimary">Cookies</button>
            </div>
          </div>
        </section>
      </main>

      <LegalDocModal doc={legal} onClose={() => setLegal(null)} />
    </div>
  );
};

function MarketDepthSvg() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-90"
      viewBox="0 0 640 520"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="depthBlue" x1="80" y1="90" x2="520" y2="420" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2b82f6" stopOpacity="0.42" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="depthGreen" x1="120" y1="430" x2="560" y2="160" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00d26a" stopOpacity="0.26" />
          <stop offset="1" stopColor="#2b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d="M0 386C82 346 131 358 204 302C268 253 302 145 380 126C462 106 525 184 640 144V520H0V386Z" fill="url(#depthBlue)" />
      <path d="M0 452C84 421 151 438 220 390C286 344 336 238 426 222C501 208 552 268 640 236V520H0V452Z" fill="url(#depthGreen)" />
      <path d="M22 366C103 330 146 344 211 291C270 244 306 145 382 126C464 106 523 184 617 151" fill="none" stroke="#2b82f6" strokeOpacity="0.42" strokeWidth="2" />
      <path d="M38 449C114 420 161 432 226 383C289 336 337 239 423 222C500 207 553 269 616 244" fill="none" stroke="#00d26a" strokeOpacity="0.32" strokeWidth="2" />
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`v-${i}`} x1={70 + i * 62} y1="78" x2={70 + i * 62} y2="470" stroke="white" strokeOpacity="0.025" />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={`h-${i}`} x1="36" y1={110 + i * 62} x2="604" y2={110 + i * 62} stroke="white" strokeOpacity="0.03" />
      ))}
    </svg>
  );
}

export default LandingPage;
