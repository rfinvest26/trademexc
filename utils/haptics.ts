/** Приятная короткая вибрация при нажатии (кнопки, табы, чипы). */
let userGestureUnlocked = false;

function ensureGestureListener() {
  if (userGestureUnlocked) return;
  if (typeof window === 'undefined') return;

  const unlock = () => {
    userGestureUnlocked = true;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
  };

  // Chrome blocks `navigator.vibrate()` until a user interacts with the frame.
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function vibrate(pattern: number | number[]) {
  ensureGestureListener();
  if (!userGestureUnlocked) return;
  if (typeof navigator === 'undefined') return;
  if (!('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore (best-effort UX feature)
  }
}

export const Haptic = {
  /** Мягкий отклик на тап — один короткий импульс. */
  tap: () => {
    vibrate(8);
  },
  /** Лёгкое нажатие (выбор, шаг, копирование). */
  light: () => {
    vibrate(12);
  },
  /** Среднее нажатие (важное действие). */
  medium: () => {
    vibrate(35);
  },
  /** Успех (сделка, вывод одобрен). */
  success: () => {
    vibrate([30, 40, 30]);
  },
  /** Ошибка валидации или операции. */
  error: () => {
    vibrate([40, 80, 40]);
  },
};