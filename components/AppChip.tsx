import React from 'react';
import clsx from 'clsx';

interface AppChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  active?: boolean;
}

const AppChip: React.FC<AppChipProps> = ({ className, active = false, ...props }) => (
  <span className={clsx('app-chip', active && 'app-chip-active', className)} {...props} />
);

export default AppChip;
