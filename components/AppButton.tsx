import React from 'react';
import { Loader2 } from 'lucide-react';

type AppButtonVariant = 'primary' | 'secondary' | 'destructive' | 'icon';

interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `icon` renders a square 40px icon button. */
  variant?: AppButtonVariant;
  /** Stretch to full width (ignored for `icon`). */
  block?: boolean;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  className?: string;
}

const variantClass: Record<AppButtonVariant, string> = {
  primary: 'app-button-primary',
  secondary: 'app-button-secondary',
  destructive: 'app-button-destructive',
  icon: 'app-icon-button',
};

/**
 * Unified button primitive. Wraps the `.app-button-*` design-system classes so
 * pages never hand-roll button styling. Business logic stays in `onClick`.
 */
const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = 'primary', block = false, loading = false, className = '', disabled, children, ...rest }, ref) => {
    const classes = [
      variantClass[variant],
      block && variant !== 'icon' ? 'w-full' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
        {loading ? <Loader2 size={variant === 'icon' ? 16 : 18} className="animate-spin" /> : children}
      </button>
    );
  },
);

AppButton.displayName = 'AppButton';

export default AppButton;
