import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type FullscreenSheetLockControls = {
  /** Сколько полноэкранных слоёв активно (вложенные шиты суммируются). */
  lockCount: number;
  acquire: () => void;
  release: () => void;
};

const FullscreenSheetLockContext = createContext<FullscreenSheetLockControls | null>(
  null
);

export function FullscreenSheetLockProvider({ children }: { children: React.ReactNode }) {
  const [lockCount, setLockCount] = useState(0);

  const acquire = useCallback(() => {
    setLockCount((c) => c + 1);
  }, []);

  const release = useCallback(() => {
    setLockCount((c) => Math.max(0, c - 1));
  }, []);

  const value = useMemo(
    (): FullscreenSheetLockControls => ({ lockCount, acquire, release }),
    [lockCount, acquire, release]
  );

  return (
    <FullscreenSheetLockContext.Provider value={value}>{children}</FullscreenSheetLockContext.Provider>
  );
}

/** Если провайдер нет (тесты) — заглушка с no-op acquire/release и lockCount 0. */
export function useFullscreenSheetLock(): FullscreenSheetLockControls {
  const ctx = useContext(FullscreenSheetLockContext);
  if (!ctx) {
    return {
      lockCount: 0,
      acquire: () => {},
      release: () => {},
    };
  }
  return ctx;
}
