import React from 'react';
import clsx from 'clsx';

interface AppTableProps extends React.HTMLAttributes<HTMLDivElement> {}
interface AppTableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: string;
  header?: boolean;
}

export const AppTable: React.FC<AppTableProps> = ({ className, ...props }) => (
  <div className={clsx('app-table', className)} {...props} />
);

export const AppTableRow: React.FC<AppTableRowProps> = ({
  className,
  columns,
  header = false,
  style,
  ...props
}) => (
  <div
    className={clsx(header ? 'app-table-head' : 'app-table-row', className)}
    style={{ gridTemplateColumns: columns, ...style }}
    {...props}
  />
);

export default AppTable;
