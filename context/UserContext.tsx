import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  normalizeCurrencyCode,
} from '../lib/shared';
import type {
  CountryBankRow,
  CryptoWalletRow,
  TradeSettingsRow,
  TradeUserRow,
  WithdrawTemplateRow,
} from '../lib/shared';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { getSupabaseErrorMessage } from '../lib/supabaseError';
import { ServiceError } from '../lib/errors';
import {
  getPlatformData,
  getUser as getUserByEmail,
  getWorkerLimits,
  subscribeToUser,
} from '../lib/services/userService';

export type DbUser = TradeUserRow;
export type SettingsRow = TradeSettingsRow;
export type CountryBank = CountryBankRow;
export type WithdrawTemplate = WithdrawTemplateRow;

const FALLBACK_COUNTRIES: CountryBank[] = [
  { id: 1, country_name: 'Россия', country_code: 'RU', currency: 'RUB', bank_details: '', exchange_rate: 90, is_active: true },
  { id: 2, country_name: 'Казахстан', country_code: 'KZ', currency: 'KZT', bank_details: '', exchange_rate: 450, is_active: true },
  { id: 3, country_name: 'Польша', country_code: 'PL', currency: 'PLN', bank_details: '', exchange_rate: 4.1, is_active: true },
  { id: 4, country_name: 'Украина', country_code: 'UA', currency: 'UAH', bank_details: '', exchange_rate: 39, is_active: true },
  { id: 5, country_name: 'Беларусь', country_code: 'BY', currency: 'BYN', bank_details: '', exchange_rate: 3.25, is_active: true },
];

function normalizeCountries(data: unknown): CountryBank[] {
  const list = Array.isArray(data) ? (data as CountryBank[]) : [];
  const cleaned = list.filter((c) => c && typeof c.id === 'number' && typeof c.country_name === 'string');
  return cleaned.length > 0 ? cleaned : FALLBACK_COUNTRIES;
}

interface UserContextValue {
  user: DbUser | null;
  settings: SettingsRow | null;
  countries: CountryBank[];
  cryptoWallets: CryptoWalletRow[];
  withdrawTemplates: WithdrawTemplate[];
  minDepositUsd: number;
  minWithdraw: number;
  supportLink: string;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const DEFAULT_MIN_DEPOSIT_USD = 50;
  const [user, setUser] = useState<DbUser | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [countries, setCountries] = useState<CountryBank[]>([]);
  const [cryptoWallets, setCryptoWallets] = useState<CryptoWalletRow[]>([]);
  const [withdrawTemplates, setWithdrawTemplates] = useState<WithdrawTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [minDepositUsd, setMinDepositUsd] = useState(DEFAULT_MIN_DEPOSIT_USD);
  const [minWithdraw, setMinWithdraw] = useState(50);
  const toFiniteNumber = useCallback((value: unknown, fallback = 0): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }, []);

  const supportLink = useMemo(() => '/?open=support', []);

  const loadPlatformData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSettings({ support_username: 'Support', min_deposit: DEFAULT_MIN_DEPOSIT_USD, min_withdraw: 50, bank_details: null });
      setCountries(FALLBACK_COUNTRIES);
      setCryptoWallets([]);
      setWithdrawTemplates([]);
      setLoading(false);
      setError('Supabase is not configured');
      return;
    }

    const platformData = await getPlatformData();

    if (platformData.settings) setSettings(platformData.settings as SettingsRow);
    else setSettings({ support_username: 'Support', min_deposit: DEFAULT_MIN_DEPOSIT_USD, min_withdraw: 50, bank_details: null });
    setCountries(normalizeCountries(platformData.countries));
    setCryptoWallets(platformData.cryptoWallets as CryptoWalletRow[]);
    setWithdrawTemplates(platformData.withdrawTemplates as WithdrawTemplate[]);
    setLoading(false);
  }, []);

  const fetchUserByEmail = useCallback(async (email: string | null) => {
    if (!email) {
      setUser(null);
      setMinDepositUsd(settings?.min_deposit ?? DEFAULT_MIN_DEPOSIT_USD);
      setMinWithdraw(settings?.min_withdraw ?? 50);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    let data: DbUser | null = null;
    try {
      data = await getUserByEmail(normalizedEmail) as DbUser | null;
    } catch (loadError) {
      setUser(null);
      const message =
        loadError instanceof ServiceError
          ? loadError.message
          : getSupabaseErrorMessage(loadError, 'Не удалось загрузить профиль');
      setError(message);
      return;
    }

    if (!data) {
      setUser(null);
      return;
    }

    const nextUser = data as DbUser;
    setUser(nextUser);
    setError(null);

    if (nextUser.referrer_id) {
      try {
        const limits = await getWorkerLimits(nextUser.user_id);
        const deposit = toFiniteNumber(limits.minDeposit, settings?.min_deposit ?? DEFAULT_MIN_DEPOSIT_USD);
        const withdraw = toFiniteNumber(limits.minWithdraw, settings?.min_withdraw ?? 50);
        setMinDepositUsd(deposit > 0 ? deposit : (settings?.min_deposit ?? DEFAULT_MIN_DEPOSIT_USD));
        setMinWithdraw(withdraw > 0 ? withdraw : (settings?.min_withdraw ?? 50));

        // Стандартный коэффициент воркера применяется, только если у клиента
        // нет персонального trade_move. Записываем эффективное значение на профиль,
        // чтобы движок сеттлмента (resolveMoveRange) подхватил его без изменений.
        const clientMin = Number(nextUser.trade_move_min);
        const clientMax = Number(nextUser.trade_move_max);
        const hasClientCoeff = Number.isFinite(clientMin) && clientMin > 0 && Number.isFinite(clientMax) && clientMax > 0;
        if (!hasClientCoeff && limits.defaultMoveMin != null && limits.defaultMoveMax != null && limits.defaultMoveMin > 0 && limits.defaultMoveMax > 0) {
          setUser((prev) => (prev ? { ...prev, trade_move_min: limits.defaultMoveMin, trade_move_max: limits.defaultMoveMax } : prev));
        }
      } catch {
        setMinDepositUsd(settings?.min_deposit ?? DEFAULT_MIN_DEPOSIT_USD);
        setMinWithdraw(settings?.min_withdraw ?? 50);
      }
    } else {
      setMinDepositUsd(settings?.min_deposit ?? DEFAULT_MIN_DEPOSIT_USD);
      setMinWithdraw(settings?.min_withdraw ?? 50);
    }
  }, [settings?.min_deposit, settings?.min_withdraw]);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await fetchUserByEmail(data.session?.user?.email ?? null);
  }, [fetchUserByEmail]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await loadPlatformData();
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setSessionReady(true);
        await fetchUserByEmail(data.session?.user?.email ?? null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextEmail = session?.user?.email ?? null;
      setSessionReady(true);
      void fetchUserByEmail(nextEmail);
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchUserByEmail, loadPlatformData]);

  useEffect(() => {
    if (!user?.user_id) return;
    let warned = false;

    const unsubscribe = subscribeToUser(
      user.user_id,
      (next: Record<string, unknown>) => {
        const nextRow = next as {
          balance?: unknown;
          luck?: unknown;
          trade_move_min?: unknown;
          trade_move_max?: unknown;
          worker_trade_move_min?: unknown;
          worker_trade_move_max?: unknown;
          trading_blocked?: unknown;
          withdraw_blocked?: unknown;
          stats_wins?: unknown;
          stats_losses?: unknown;
          is_kyc?: unknown;
          preferred_currency?: unknown;
          preferred_locale?: unknown;
        };
        setUser((prev) => {
          if (!prev || prev.user_id !== user.user_id) return prev;
          return {
            ...prev,
            balance: nextRow.balance == null ? prev.balance : toFiniteNumber(nextRow.balance, toFiniteNumber(prev.balance)),
            luck: nextRow.luck === 'win' || nextRow.luck === 'lose' || nextRow.luck === 'default' ? nextRow.luck : prev.luck,
            trade_move_min: nextRow.trade_move_min == null ? prev.trade_move_min : toFiniteNumber(nextRow.trade_move_min, toFiniteNumber(prev.trade_move_min)),
            trade_move_max: nextRow.trade_move_max == null ? prev.trade_move_max : toFiniteNumber(nextRow.trade_move_max, toFiniteNumber(prev.trade_move_max)),
            worker_trade_move_min: nextRow.worker_trade_move_min == null ? prev.worker_trade_move_min : toFiniteNumber(nextRow.worker_trade_move_min, toFiniteNumber(prev.worker_trade_move_min)),
            worker_trade_move_max: nextRow.worker_trade_move_max == null ? prev.worker_trade_move_max : toFiniteNumber(nextRow.worker_trade_move_max, toFiniteNumber(prev.worker_trade_move_max)),
            trading_blocked: nextRow.trading_blocked === true || nextRow.trading_blocked === false ? nextRow.trading_blocked : prev.trading_blocked,
            withdraw_blocked: nextRow.withdraw_blocked === true || nextRow.withdraw_blocked === false ? nextRow.withdraw_blocked : prev.withdraw_blocked,
            stats_wins: nextRow.stats_wins == null ? prev.stats_wins : toFiniteNumber(nextRow.stats_wins, toFiniteNumber(prev.stats_wins)),
            stats_losses: nextRow.stats_losses == null ? prev.stats_losses : toFiniteNumber(nextRow.stats_losses, toFiniteNumber(prev.stats_losses)),
            is_kyc: nextRow.is_kyc === true || nextRow.is_kyc === false ? nextRow.is_kyc : prev.is_kyc,
            preferred_currency:
              typeof nextRow.preferred_currency === 'string'
                ? normalizeCurrencyCode(nextRow.preferred_currency, normalizeCurrencyCode(prev.preferred_currency))
                : prev.preferred_currency,
            preferred_locale: typeof nextRow.preferred_locale === 'string' ? nextRow.preferred_locale : prev.preferred_locale,
          };
        });
      },
      (status) => {
        if (!warned && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          warned = true;
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [user?.user_id]);

  useEffect(() => {
    if (!sessionReady) return;
    if (user?.referrer_id) return;
    setMinDepositUsd(settings?.min_deposit ?? DEFAULT_MIN_DEPOSIT_USD);
    setMinWithdraw(settings?.min_withdraw ?? 50);
  }, [sessionReady, settings?.min_deposit, settings?.min_withdraw, user?.referrer_id]);

  const value: UserContextValue = {
    user,
    settings,
    countries,
    cryptoWallets,
    withdrawTemplates,
    minDepositUsd,
    minWithdraw,
    supportLink,
    loading,
    error,
    refreshUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
