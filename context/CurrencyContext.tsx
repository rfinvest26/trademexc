import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchUsdRatesLive, type UsdRates } from '../lib/currencyApi';

export interface SupportedCurrency {
  code: string;
  symbol: string;
  name: string;
}

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: 'usd', symbol: '$', name: 'US Dollar' },
  { code: 'eur', symbol: '€', name: 'Euro' },
  { code: 'gbp', symbol: '£', name: 'British Pound' },
  { code: 'rub', symbol: '₽', name: 'Russian Ruble' },
  { code: 'kzt', symbol: '₸', name: 'Kazakhstani Tenge' },
  { code: 'uah', symbol: '₴', name: 'Ukrainian Hryvnia' },
  { code: 'pln', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'byn', symbol: 'Br', name: 'Belarusian Ruble' },
  { code: 'cny', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'chf', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'try', symbol: '₺', name: 'Turkish Lira' },
  { code: 'brl', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'inr', symbol: '₹', name: 'Indian Rupee' },
  { code: 'jpy', symbol: '¥', name: 'Japanese Yen' },
  { code: 'krw', symbol: '₩', name: 'South Korean Won' },
];

const supportedCodes = new Set(SUPPORTED_CURRENCIES.map((item) => item.code));

export function normalizeDisplayCurrency(code: string | null | undefined): string {
  const normalized = String(code ?? '').trim().toLowerCase();
  return supportedCodes.has(normalized) ? normalized : 'usd';
}

function readStoredCurrency(): string {
  if (typeof window === 'undefined') return 'usd';
  try {
    return normalizeDisplayCurrency(window.localStorage.getItem('etoro_currency'));
  } catch {
    return 'usd';
  }
}

interface CurrencyContextValue {
  baseCurrency: string;
  setBaseCurrency: (code: string) => void;
  rates: UsdRates | null;
  loading: boolean;
  rateAvailable: boolean;
  rateUpdatedAt: string | null;
  refreshRates: () => Promise<void>;
  /** Convert a value stored in USD to the selected display currency. */
  convertFromUsd: (priceUsd: number) => number;
  /** Convert user input in the selected currency to the USD storage currency. */
  convertToUsd: (amountInDisplayCurrency: number) => number;
  symbol: string;
  currencyCode: string;
  currencyName: string;
  /** Format a USD value in the selected currency, without a currency suffix. */
  formatPrice: (priceUsd: number, options?: { fractionDigits?: number }) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [baseCurrency, setBaseCurrencyInternal] = useState<string>(readStoredCurrency);
  const [rates, setRates] = useState<UsdRates | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshRates = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUsdRatesLive();
      setRates(data?.usd ? data : null);
    } catch {
      setRates(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRates();
    const intervalId = window.setInterval(refreshRates, 2 * 60 * 1000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshRates();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshRates]);

  const setBaseCurrency = useCallback((code: string) => {
    const normalized = normalizeDisplayCurrency(code);
    setBaseCurrencyInternal(normalized);
    try {
      window.localStorage.setItem('etoro_currency', normalized);
    } catch {}
  }, []);

  const currentRate = baseCurrency === 'usd' ? 1 : Number(rates?.usd?.[baseCurrency]);
  const rateAvailable = baseCurrency === 'usd' || (Boolean(rates?.date) && Number.isFinite(currentRate) && currentRate > 0);

  const convertFromUsd = useCallback(
    (priceUsd: number): number => {
      if (!Number.isFinite(priceUsd)) return 0;
      if (baseCurrency === 'usd') return priceUsd;
      const targetRate = rates?.date ? Number(rates?.usd?.[baseCurrency]) : Number.NaN;
      return Number.isFinite(targetRate) && targetRate > 0 ? priceUsd * targetRate : priceUsd;
    },
    [baseCurrency, rates]
  );

  const convertToUsd = useCallback(
    (amountInDisplayCurrency: number): number => {
      if (!Number.isFinite(amountInDisplayCurrency)) return 0;
      if (baseCurrency === 'usd') return amountInDisplayCurrency;
      const targetRate = rates?.date ? Number(rates?.usd?.[baseCurrency]) : Number.NaN;
      return Number.isFinite(targetRate) && targetRate > 0 ? amountInDisplayCurrency / targetRate : amountInDisplayCurrency;
    },
    [baseCurrency, rates]
  );

  const formatPrice = useCallback(
    (priceUsd: number, options?: { fractionDigits?: number }): string => {
      const value = convertFromUsd(priceUsd);
      const fractionDigits = options?.fractionDigits ?? (value === 0 ? 2 : value < 1 ? 6 : value < 100 ? 2 : 0);
      return new Intl.NumberFormat('ru-RU', {
        style: 'decimal',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value);
    },
    [convertFromUsd]
  );

  const selectedCurrency = useMemo(
    () => SUPPORTED_CURRENCIES.find((item) => item.code === baseCurrency) ?? SUPPORTED_CURRENCIES[0],
    [baseCurrency]
  );

  const value = useMemo<CurrencyContextValue>(() => ({
    baseCurrency,
    setBaseCurrency,
    rates,
    loading,
    rateAvailable,
    rateUpdatedAt: rates?.date || null,
    refreshRates,
    convertFromUsd,
    convertToUsd,
    symbol: selectedCurrency.symbol,
    currencyCode: selectedCurrency.code.toUpperCase(),
    currencyName: selectedCurrency.name,
    formatPrice,
  }), [baseCurrency, setBaseCurrency, rates, loading, rateAvailable, refreshRates, convertFromUsd, convertToUsd, selectedCurrency, formatPrice]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
