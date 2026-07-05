import React from 'react';
import type { LucideIcon } from 'lucide-react';

type EmptyTone = 'neon' | 'up' | 'down' | 'purple' | 'muted';

interface AppEmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  tone?: EmptyTone;
  /** Soft pulsing glow behind the icon (used for "active/live" empties). */
  pulse?: boolean;
  className?: string;
}

const glowClass: Record<EmptyTone, string> = {
  neon: 'bg-neon/10',
  up: 'bg-up/10',
  down: 'bg-down/10',
  purple: 'bg-purple-500/10',
  muted: 'bg-white/[0.04]',
};

const iconColor: Record<EmptyTone, string> = {
  neon: 'text-neon',
  up: 'text-up',
  down: 'text-down',
  purple: 'text-purple-400',
  muted: 'text-textMuted',
};

/**
 * Unified empty/zero-data state: a toned glow, an icon chip, a title and an
 * optional hint. Replaces the hand-rolled centered empty blocks across pages.
 */
const AppEmptyState: React.FC<AppEmptyStateProps> = ({
  icon: Icon,
  title,
  hint,
  tone = 'muted',
  pulse = false,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center py-20 text-center px-4 ${className}`}>
    <div className="relative w-24 h-24 flex items-center justify-center mb-5">
      <div className={`absolute inset-0 rounded-full blur-xl opacity-70 ${glowClass[tone]} ${pulse ? 'animate-pulse-ring' : ''}`} />
      <div className="w-16 h-16 rounded-xl bg-surfaceElevated app-border flex items-center justify-center relative z-10 shadow-elevation-2">
        <Icon size={28} strokeWidth={1.5} className={`${iconColor[tone]} opacity-80`} aria-hidden />
      </div>
    </div>
    <p className="text-sm font-semibold text-textPrimary">{title}</p>
    {hint ? <p className="text-[11px] text-textMuted mt-1 max-w-[200px]">{hint}</p> : null}
  </div>
);

export default AppEmptyState;
