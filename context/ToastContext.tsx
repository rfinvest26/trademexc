import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'info' | 'error' | 'success';

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>('info');

  const show = useCallback((msg: string, t: ToastType = 'info') => {
    setMessage(msg);
    setType(t);
    setTimeout(() => setMessage(null), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <div
          className="fixed top-[calc(env(safe-area-inset-top,0px)+16px)] left-4 right-4 z-[100] flex justify-center pointer-events-none animate-slide-in-right"
        >
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-elevation-2 max-w-sm w-auto pointer-events-auto"
               style={{ background: 'rgba(11, 17, 28, 0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {type === 'success' && <CheckCircle2 size={18} className="text-up shrink-0" />}
            {type === 'error' && <AlertCircle size={18} className="text-down shrink-0" />}
            {type === 'info' && <Info size={18} className="text-neon shrink-0" />}
            <span className="text-sm font-medium text-white truncate">{message}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { show: () => {} };
  return ctx;
}
