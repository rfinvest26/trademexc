import React from 'react';
import { Search, X } from 'lucide-react';
import { Haptic } from '../utils/haptics';

type ButtonVariantProps = {
  variant: 'button';
  label: string;
  onClick: () => void;
};

type InputVariantProps = {
  variant: 'input';
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  autoFocus?: boolean;
};

type TopSearchControlProps = (ButtonVariantProps | InputVariantProps) & {
  className?: string;
};

const baseClass =
  'flex h-10 items-center gap-2 rounded-[14px] bg-surfaceElevated px-3 text-left transition-colors';

const TopSearchControl: React.FC<TopSearchControlProps> = (props) => {
  const className = [baseClass, props.className || ''].join(' ').trim();

  if (props.variant === 'button') {
    return (
      <button
        type="button"
        onClick={() => {
          Haptic.tap();
          props.onClick();
        }}
        className={`${className} w-full active:scale-[0.99]`}
      >
        <Search size={14} className="shrink-0 text-textMuted" />
        <span className="min-w-0 truncate text-xs font-medium text-textMuted">{props.label}</span>
      </button>
    );
  }

  return (
    <div className={className}>
      <Search size={14} className="shrink-0 text-textMuted" />
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        value={props.value}
        onFocus={() => Haptic.tap()}
        onChange={(e) => props.onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-xs font-medium text-textPrimary placeholder:text-textMuted outline-none"
      />
      {props.value ? (
        <button
          type="button"
          onClick={() => {
            Haptic.tap();
            props.onClear?.();
          }}
          className="shrink-0 rounded-full p-0.5 text-textMuted transition-colors hover:text-textPrimary"
          aria-label={props.clearLabel ?? 'Clear search'}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
};

export default TopSearchControl;
