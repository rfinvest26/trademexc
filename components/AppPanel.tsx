import React from 'react';
import clsx from 'clsx';

interface AppPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  flat?: boolean;
}

const AppPanel = React.forwardRef<HTMLDivElement, AppPanelProps>(
  ({ className, flat = false, ...props }, ref) => (
    <div ref={ref} className={clsx(flat ? 'app-panel-flat' : 'app-panel', className)} {...props} />
  ),
);

AppPanel.displayName = 'AppPanel';

export default AppPanel;
