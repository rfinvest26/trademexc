import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Z_INDEX } from '../constants/zIndex';

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  labelledBy?: string;
  closeOnBackdrop?: boolean;
  zIndex?: number;
}

const AppDrawer: React.FC<AppDrawerProps> = ({
  open,
  onClose,
  children,
  className,
  panelClassName,
  labelledBy,
  closeOnBackdrop = true,
  zIndex = Z_INDEX.modal,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const body = (
    <div
      className={clsx('app-overlay flex items-stretch justify-end animate-fade-in', className)}
      style={{ zIndex }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className={clsx('app-drawer-panel animate-slide-in-right', panelClassName)} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  return createPortal(body, document.body);
};

export default AppDrawer;
