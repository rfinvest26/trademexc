import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft } from 'lucide-react';
import { Z_INDEX } from '../constants/zIndex';
import { useFullscreenSheetLock } from '../context/FullscreenSheetLockContext';
import { Haptic } from '../utils/haptics';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Тип нижнего шита:
   * - 'partial' — быстрые действия, небольшие подтверждения (30–60% высоты)
   * - 'expandable' — панели с большим количеством контента (40–90% высоты)
   * - 'fullscreen' — выбор/флоу на весь экран (100% высоты)
   * По умолчанию partial.
   */
  variant?: 'partial' | 'expandable' | 'fullscreen';
  /** Закрывать по клику на затемнённый фон. По умолчанию true — удобно для подтверждений и форм. */
  closeOnBackdrop?: boolean;
  /** Дополнительный класс для панели контента */
  contentClassName?: string;
  /** Показывать иконку закрытия в правом верхнем углу (для expandable‑листов). По умолчанию false. */
  showCloseButton?: boolean;
  /** Зафиксировать шапку (header) при прокрутке контента. По умолчанию true. */
  stickyHeader?: boolean;
  /** Доп. классы для шапки */
  headerClassName?: string;
  /** Доп. классы для заголовка */
  titleClassName?: string;
  /** Показывать нижний разделитель в шапке. По умолчанию true. */
  showHeaderDivider?: boolean;
  /** Центрировать заголовок. По умолчанию true. */
  centerTitle?: boolean;
  /** Показать верхний drag-handle. По умолчанию true (кроме fullscreen). */
  showHandle?: boolean;
  /** Блокировать скролл приложения под шитом. По умолчанию true. */
  lockScroll?: boolean;
}

/**
 * Все варианты рендерятся через портал в document.body — поверх fixed bottom-nav (z-50) и stacking context у main.
 * Fullscreen: Z_INDEX.fullscreen + lock навбара; partial/expandable: Z_INDEX.picker.
 */
const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  onClose,
  title,
  children,
  variant = 'partial',
  closeOnBackdrop = true,
  contentClassName = '',
  showCloseButton = false,
  stickyHeader = true,
  headerClassName = '',
  titleClassName = '',
  showHeaderDivider = true,
  centerTitle = true,
  showHandle,
  lockScroll = true,
}) => {
  const { acquire: lockAcquire, release: lockRelease } = useFullscreenSheetLock();

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (closeOnBackdrop) {
      Haptic.light();
      onClose();
    }
  };

  const handleClose = () => {
    Haptic.tap();
    onClose();
  };

  useEffect(() => {
    if (!(open && variant === 'fullscreen')) return undefined;
    lockAcquire();
    return () => {
      lockRelease();
    };
  }, [open, variant, lockAcquire, lockRelease]);

  useEffect(() => {
    if (!open) return undefined;
    if (!lockScroll) return undefined;
    const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
    const main = typeof document !== 'undefined' ? (document.querySelector('main') as HTMLElement | null) : null;

    const prevRootOverflowY = root?.style.overflowY;
    const prevMainOverflowY = main?.style.overflowY;
    const prevMainTouchAction = main?.style.touchAction;

    // В приложении скролл обычно живёт в <main>, поэтому блокируем именно его.
    if (root) root.style.overflowY = 'hidden';
    if (main) {
      main.style.overflowY = 'hidden';
      main.style.touchAction = 'none';
    }
    return () => {
      if (root) root.style.overflowY = prevRootOverflowY || '';
      if (main) {
        main.style.overflowY = prevMainOverflowY || '';
        main.style.touchAction = prevMainTouchAction || '';
      }
    };
  }, [open, lockScroll]);

  if (!open) return null;

  const fullscreenBackdropClass =
    variant === 'fullscreen'
    ? 'bg-background'
      : 'bg-black/72 backdrop-blur-sm';

  const panelHeights =
    variant === 'fullscreen'
      ? 'h-[100dvh] max-h-[100dvh] min-h-[100dvh]'
      : variant === 'partial'
      ? 'max-h-[60vh] min-h-[26vh]'
      : 'max-h-[90vh] min-h-[34vh]';

  const panelBase =
    variant === 'fullscreen'
      ? 'w-full bg-background animate-sheet-up overflow-hidden flex flex-col'
      : 'w-full max-w-md lg:max-w-xl bg-background rounded-t-[14px] lg:rounded-xl lg:border lg:border-border shadow-elevation-2 animate-sheet-up lg:animate-modal-in overflow-hidden flex flex-col';

  const overlayAlign = variant === 'fullscreen' ? 'items-stretch' : 'items-end lg:items-center';

  const effectiveShowHandle = showHandle ?? variant !== 'fullscreen';

  const overlayRoot = (
    <div
      className={`fixed left-0 right-0 top-0 bottom-0 flex ${overlayAlign} justify-center animate-fade-in transition-opacity duration-200 ${fullscreenBackdropClass}`}
      style={{
        zIndex: variant === 'fullscreen' ? Z_INDEX.fullscreen : Z_INDEX.picker,
        paddingBottom: variant === 'fullscreen' ? undefined : 'env(safe-area-inset-bottom)',
        paddingLeft: variant === 'fullscreen' ? undefined : 'env(safe-area-inset-left)',
        paddingRight: variant === 'fullscreen' ? undefined : 'env(safe-area-inset-right)',
        paddingTop: variant === 'fullscreen' ? undefined : 'env(safe-area-inset-top)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      <div
        className={`${panelBase} ${panelHeights} ${variant === 'fullscreen' ? '' : 'pb-safe'} ${contentClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle для partial/expandable типов */}
        {effectiveShowHandle && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-[3px] w-12 rounded-full bg-border" aria-hidden />
          </div>
        )}
        <div
          className={[
            'bg-background',
            stickyHeader ? 'sticky top-0 z-10' : '',
            variant === 'fullscreen' ? 'px-4 pt-3 pb-2.5 min-h-[52px]' : 'px-4 pb-2 min-h-[40px]',
            showHeaderDivider ? 'hairline-bottom' : '',
            headerClassName,
          ].join(' ')}
        >
          <div className="relative flex items-center justify-center min-h-[40px]">
            {/* Для полноэкранного режима показываем стрелку "Назад" слева как в нативной навигации */}
            {variant === 'fullscreen' ? (
              <button
                type="button"
                onClick={handleClose}
              className="absolute left-0 top-1/2 -translate-y-1/2 touch-target h-10 w-10 rounded-xl text-textSecondary hover:text-textPrimary hover:bg-surfaceElevated active:scale-95 transition-all duration-200 flex items-center justify-center"
                aria-label="Назад"
              >
                <ArrowLeft size={20} strokeWidth={1.75} />
              </button>
            ) : null}

            <h3
              id="bottom-sheet-title"
              className={[
                'text-textPrimary truncate',
                variant === 'fullscreen' ? 'text-base font-bold' : 'text-sm font-semibold',
                centerTitle ? 'text-center max-w-[72%]' : 'text-left w-full pr-12',
                titleClassName,
              ].join(' ')}
            >
              {title}
            </h3>

            {variant !== 'fullscreen' && (variant === 'expandable' || showCloseButton) && (
              <button
                type="button"
                onClick={handleClose}
              className="absolute right-0 top-1/2 -translate-y-1/2 touch-target h-9 w-9 rounded-full text-textMuted hover:text-textPrimary hover:bg-surfaceElevated active:scale-95 transition-all duration-200 flex items-center justify-center"
                aria-label="Закрыть"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-app p-4 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(overlayRoot, document.body);
  }
  return overlayRoot;
};

export default BottomSheet;
