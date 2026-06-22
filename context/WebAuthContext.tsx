import React, { createContext, useCallback, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { getSupabaseErrorMessage } from '../lib/supabaseError';

interface WebAuthContextValue {
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    fullName: string,
    refCode?: string,
    bonus?: number | null
  ) => Promise<{ ok: boolean; error?: string }>;
  resendEmailConfirmation?: (email: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const WebAuthContext = createContext<WebAuthContextValue | null>(null);

export function WebAuthProvider({ children }: { children: React.ReactNode }) {
  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('confirm') && (msg.includes('email') || msg.includes('e-mail'))) {
        return { ok: false, error: 'Email не подтверждён. Проверьте почту.' };
      }
      if (msg.includes('not found') || msg.includes('invalid') || msg.includes('credentials')) {
        return { ok: false, error: 'Неверный email или пароль' };
      }
      return { ok: false, error: getSupabaseErrorMessage(error, 'Не удалось выполнить вход') };
    }
    return { ok: true };
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string, refCode = '', bonus: number | null = null) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim();
    const normalizedRefCode = refCode.trim();

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedFullName || null,
          ref_code: normalizedRefCode || null,
          bonus: bonus != null && Number.isFinite(Number(bonus)) ? Number(bonus) : null,
        },
      },
    });

    if (error) {
      console.error('[supabase.auth.signUp] failed:', error);
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('already') || msg.includes('exists')) {
        return { ok: false, error: 'Этот email уже зарегистрирован. Попробуйте войти.' };
      }
      return { ok: false, error: getSupabaseErrorMessage(error, 'Registration failed') };
    }

    return { ok: true };
  }, []);

  const resendEmailConfirmation = useCallback(async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const res = await supabase.auth.resend({ type: 'signup', email: normalizedEmail });
    if (res.error) return { ok: false, error: getSupabaseErrorMessage(res.error, 'Не удалось отправить письмо') };
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
  }, []);

  const value: WebAuthContextValue = { login, register, resendEmailConfirmation, logout };
  return <WebAuthContext.Provider value={value}>{children}</WebAuthContext.Provider>;
}

export function useWebAuth() {
  const ctx = useContext(WebAuthContext);
  if (!ctx) throw new Error('useWebAuth must be used within WebAuthProvider');
  return ctx;
}
