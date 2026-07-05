import React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Z_INDEX } from '../constants/zIndex';

interface AppSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  labelledBy?: string;
  closeOnBackdrop?: boolean;
  zIndex?: number;
}

const AppSheet: React.FC<AppSheetProps> = ({
  open,
  onClose,
  children,
  className,
  panelClassName,
  labelledBy,
  closeOnBackdrop = true,
  zIndex = Z_INDEX.picker,
}) => {
  if (!open) return null;

  const body = (
    <div
      className={clsx('app-overlay flex items-end justify-center p-0 lg:items-center lg:p-8 animate-fade-in', className)}
      style={{ zIndex }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className={clsx('app-sheet-panel animate-sheet-up lg:animate-modal-in', panelClassName)} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  return createPortal(body, document.body);
};

export default AppSheet;
