import React from 'react';
import clsx from 'clsx';

export interface AppTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: 'md' | 'sm';
  invalid?: boolean;
  borderless?: boolean;
}

const AppTextarea = React.forwardRef<HTMLTextAreaElement, AppTextareaProps>(
  ({ className, size = 'md', invalid = false, borderless = false, ...props }, ref) => {
    return React.createElement('textarea', {
      ref,
      className: clsx(
        'app-textarea',
        size === 'sm' && 'app-textarea-sm',
        borderless && 'app-input-borderless',
        invalid && 'app-input-error',
        className,
      ),
      ...props,
    });
  },
);

AppTextarea.displayName = 'AppTextarea';

export default AppTextarea;
