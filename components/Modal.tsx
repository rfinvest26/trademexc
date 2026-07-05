import React from 'react';
import { Haptic } from '../utils/haptics';
import AppModal from './AppModal';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Закрывать по клику на затемнённый фон. Для диалогов подтверждения обычно true. */
  closeOnBackdrop?: boolean;
}

/**
 * Центрированный модальный диалог (alert) для необратимых действий.
 * Использовать ТОЛЬКО для подтверждений (закрытие позиции, удаление и т.п.).
 */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  closeOnBackdrop = false,
}) => {
  if (!open) return null;

  return (
    <AppModal
      open={open}
      onClose={() => {
        Haptic.tap();
        onClose();
      }}
      closeOnBackdrop={closeOnBackdrop !== false}
      labelledBy="modal-title"
      panelClassName="max-w-xs px-4 pt-4 pb-3"
    >
        <h2
          id="modal-title"
          className="text-base font-semibold text-textPrimary mb-2 min-h-[24px]"
        >
          {title}
        </h2>
        <div className="text-sm text-textSecondary mb-4">
          {children}
        </div>
    </AppModal>
  );
};

export default Modal;
