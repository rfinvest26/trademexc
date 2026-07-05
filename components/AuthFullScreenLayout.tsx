import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { ETORO_LOGO_URL } from '../constants';
import { Haptic } from '../utils/haptics';

interface AuthFullScreenLayoutProps {
  children: React.ReactNode;
  onBack: () => void;
  title?: string;
  subtitle?: string;
}

const AuthFullScreenLayout: React.FC<AuthFullScreenLayoutProps> = ({
  children,
  onBack,
  title,
  subtitle,
}) => {
  return (
    <div
      className="fixed left-0 right-0 top-0 bottom-0 z-[300] bg-background text-white overflow-y-auto overflow-x-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="min-h-full w-full lg:grid lg:grid-cols-2">
        {/* LEFT: Hero (desktop only) — clean, minimal */}
        <aside className="hidden lg:flex relative overflow-hidden bg-surface border-r border-border">
          <div className="relative flex-1 flex flex-col justify-between p-12">
            <div className="flex items-center gap-3">
              <img src={ETORO_LOGO_URL} alt="" width={32} height={32} className="object-contain" />
              <span className="text-[20px] font-bold tracking-tight text-white">MEXC</span>
            </div>

            <div className="space-y-4 -mt-16">
              <h1 className="text-[40px] font-bold tracking-tight text-white leading-tight">
                Lowest Fees<br />Highest Returns
              </h1>
              <p className="text-[16px] text-textSecondary max-w-sm leading-relaxed">
                Join the world's leading crypto exchange for spot and futures trading.
              </p>
            </div>

            <div className="text-[12px] text-textMuted">&copy; MEXC {new Date().getFullYear()}</div>
          </div>
        </aside>

        {/* RIGHT: Form */}
        <section className="relative flex flex-col min-h-full">
          {/* Header */}
          <header className="relative shrink-0 flex items-center px-4 py-4">
            <button
              type="button"
              onClick={() => {
                Haptic.light();
                onBack();
              }}
              className="flex items-center justify-center w-10 h-10 rounded-full text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-all duration-200 -ml-2"
              aria-label="Back"
            >
              <ArrowLeft size={24} strokeWidth={2} />
            </button>
          </header>

          <div className="relative flex-1 px-5 pb-10 pt-6">
            <div className="max-w-[400px] mx-auto w-full">
              {(title || subtitle) && (
                <div className="mb-8">
                  {title ? <h1 className="text-[28px] font-bold text-white tracking-tight">{title}</h1> : null}
                  {subtitle ? <p className="text-[14px] text-textSecondary mt-2">{subtitle}</p> : null}
                </div>
              )}
              {children}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AuthFullScreenLayout;
