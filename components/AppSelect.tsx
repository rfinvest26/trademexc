import React from 'react';
import clsx from 'clsx';

export interface AppSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  size?: 'md' | 'sm';
  invalid?: boolean;
  borderless?: boolean;
}

const AppSelect = React.forwardRef<HTMLSelectElement, AppSelectProps>(
  ({ className, size = 'md', invalid = false, borderless = false, ...props }, ref) => {
    return React.createElement('select', {
      ref,
      className: clsx(
        'app-select',
        size === 'sm' && 'app-select-sm',
        borderless && 'app-input-borderless',
        invalid && 'app-input-error',
        className,
      ),
      ...props,
    });
  },
);

AppSelect.displayName = 'AppSelect';

export default AppSelect;
