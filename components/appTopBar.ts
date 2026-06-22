import type { CSSProperties } from 'react';

/**
 * Единая система верхних меню: сплошной фон страницы, без прозрачности и blur.
 * Специализация страницы — содержимое внутри APP_TOP_BAR_ROW.
 */
export const APP_TOP_BAR_CLASS =
  'sticky top-0 z-30 w-full shrink-0 bg-background/95 backdrop-blur-md border-b border-white/5';

export const APP_TOP_BAR_STYLE: CSSProperties = {
  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
  minHeight: 48,
};

/** Базовая строка шапки (отступы согласованы с PageHeader) */
export const APP_TOP_BAR_ROW =
  'flex items-center gap-2 w-full min-h-[44px] px-4 pb-2.5 lg:px-6 lg:min-h-[48px] lg:pb-3';

/** Заголовок экрана в шапке */
export const APP_TOP_BAR_TITLE_CLASS =
  'text-[15px] font-semibold text-textPrimary tracking-tight';

/** Подзаголовок под заголовком (страницы с иконкой слева) */
export const APP_TOP_BAR_SUBTITLE_CLASS = 'text-xs text-textMuted mt-0.5 leading-snug';
