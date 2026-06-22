import React from 'react';
import { Loader2 } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import { useLanguage } from '../context/LanguageContext';

export type BottomSheetFooterVariant = 'default' | 'destructive';

interface BottomSheetFooterProps {
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  variant?: BottomSheetFooterVariant;
  /** Делает футер липким снизу (удобно на страницах с фикс. навигацией) */
  sticky?: boolean;
  /** Добавить запас снизу под BottomNav (примерно 80px) */
  reserveBottomNav?: boolean;
}

/**
 * Унифицированный футер для BottomSheet:
 * Cancel слева (secondary), Confirm справа (primary/destructive),
 * единые отступы и учёт safe-area снизу.
 */
const BottomSheetFooter: React.FC<BottomSheetFooterProps> = ({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  confirmDisabled = false,
  confirmLoading = false,
  variant = 'default',
  sticky = false,
  reserveBottomNav = false,
}) => {
  const { t } = useLanguage();
  const showCancel = !!onCancel;
  const showConfirm = !!onConfirm;

  const handleCancel = () => {
    Haptic.light();
    onCancel?.();
  };

  const handleConfirm = () => {
    if (!onConfirm || confirmDisabled || confirmLoading) return;
    Haptic.tap();
    onConfirm();
  };

  const confirmBaseClasses =
    'surface-action font-bold text-sm flex items-center justify-center min-h-[48px]';

  const confirmVariantClasses =
    variant === 'destructive'
      ? 'bg-down/10 text-down hover:bg-down/15'
      : 'bg-up/10 text-up hover:bg-up/15';

  const confirmDisabledClasses = confirmDisabled || confirmLoading ? 'opacity-50 cursor-not-allowed' : '';

  const containerClassName = [
    'flex gap-3 px-4 mt-4',
    sticky
      ? (reserveBottomNav
          ? 'sticky bottom-[calc(env(safe-area-inset-bottom)+80px)] z-[70] bg-background pointer-events-auto'
          : 'sticky bottom-0 z-[70] bg-background pointer-events-auto')
      : '',
    reserveBottomNav ? 'pb-[calc(max(1.5rem,env(safe-area-inset-bottom))+80px)]' : 'pb-safe',
  ].join(' ');

  return (
    <div className={containerClassName}>
      {showCancel && (
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 min-h-[48px] rounded-full border border-white/5 bg-surfaceElevated text-textSecondary text-sm font-medium transition-all duration-200 active:scale-[0.98] hover:bg-white/[0.03]"
        >
          {cancelLabel ?? t('cancel')}
        </button>
      )}
      {showConfirm && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirmDisabled || confirmLoading}
          className={`flex-1 ${confirmBaseClasses} ${confirmVariantClasses} ${confirmDisabledClasses}`}
        >
          {confirmLoading && (
            <Loader2 size={18} className="mr-2 animate-spin" />
          )}
          <span>{confirmLabel ?? t('confirm')}</span>
        </button>
      )}
    </div>
  );
};

export default BottomSheetFooter;
