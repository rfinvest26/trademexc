import React from 'react';
import clsx from 'clsx';

export interface AppInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: 'md' | 'sm';
  invalid?: boolean;
  borderless?: boolean;
}

const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  ({ className, size = 'md', invalid = false, borderless = false, ...props }, ref) => {
    return React.createElement('input', {
      ref,
      className: clsx(
        'app-input',
        size === 'sm' && 'app-input-sm',
        borderless && 'app-input-borderless',
        invalid && 'app-input-error',
        className,
      ),
      ...props,
    });
  },
);

AppInput.displayName = 'AppInput';

export default AppInput;
