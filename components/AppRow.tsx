import React from 'react';
import clsx from 'clsx';

interface AppRowProps extends React.HTMLAttributes<HTMLDivElement> {
  asButton?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement | HTMLButtonElement>;
}

const AppRow = React.forwardRef<HTMLDivElement | HTMLButtonElement, AppRowProps>(
  ({ className, asButton = false, onClick, ...props }, ref) => {
    if (asButton) {
      return (
        <button
          ref={ref as React.ForwardedRef<HTMLButtonElement>}
          type="button"
          className={clsx('app-row text-left', className)}
          onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
          {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        />
      );
    }

    return (
      <div
        ref={ref as React.ForwardedRef<HTMLDivElement>}
        className={clsx('app-row', className)}
        onClick={onClick as React.MouseEventHandler<HTMLDivElement>}
        {...props}
      />
    );
  },
);

AppRow.displayName = 'AppRow';

export default AppRow;
