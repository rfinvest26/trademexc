import React from 'react';
import { Search, X } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import AppInput from './AppInput';

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
  size?: 'sm' | 'md' | 'lg';
};

const TopSearchControl: React.FC<TopSearchControlProps> = (props) => {
  const isSm = props.size === 'sm';
  const isLg = props.size === 'lg';
  
  const baseClass = [
    'flex items-center gap-2 bg-surfaceElevated px-3 text-left transition-colors',
    isLg ? 'h-12 rounded-xl' : isSm ? 'h-9 rounded-[12px]' : 'h-10 rounded-[14px]'
  ].join(' ');

  const className = [baseClass, props.className || ''].join(' ').trim();
  const iconSize = isLg ? 18 : isSm ? 14 : 15;

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
        <Search size={iconSize} className="shrink-0 text-textMuted" />
        <span className={`min-w-0 truncate font-medium text-textMuted ${isLg ? 'text-sm' : 'text-xs'}`}>{props.label}</span>
      </button>
    );
  }

  return (
    <div className={className}>
      <Search size={iconSize} className="shrink-0 text-textMuted" />
      <AppInput
        type="search"
        inputMode="search"
        autoComplete="off"
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        value={props.value}
        onFocus={() => Haptic.tap()}
        onChange={(e) => props.onChange(e.target.value)}
        borderless
        className={`min-w-0 flex-1 font-medium !px-2 ${isLg ? 'text-sm' : 'text-xs'}`}
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
