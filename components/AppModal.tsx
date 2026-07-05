import React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Z_INDEX } from '../constants/zIndex';

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  labelledBy?: string;
  closeOnBackdrop?: boolean;
  zIndex?: number;
}

const AppModal: React.FC<AppModalProps> = ({
  open,
  onClose,
  children,
  className,
  panelClassName,
  labelledBy,
  closeOnBackdrop = true,
  zIndex = Z_INDEX.modal,
}) => {
  if (!open) return null;

  const body = (
    <div
      className={clsx('app-overlay flex items-center justify-center p-4 animate-fade-in', className)}
      style={{ zIndex }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className={clsx('app-modal-panel animate-modal-in', panelClassName)} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  return createPortal(body, document.body);
};

export default AppModal;
