import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchUsdRates, UsdRates } from '../lib/currencyApi';

/** Символы основных валют */
const CURRENCY_SYMBOLS: Record<string, string> = {
  rub: '₽',
  usd: '$',
  eur: '€',
  gbp: '£',
  cny: '¥',
  kzt: '₸',
  jpy: '¥',
  uah: '₴',
  try: '₺',
  brl: 'R$',
  inr: '₹',
  chf: 'Fr',
  krw: '₩',
};

interface CurrencyContextValue {
  baseCurrency: string;
  setBaseCurrency: (code: string) => void;
  rates: UsdRates | null;
  loading: boolean;
  /** Конвертировать цену из RUB в выбранную валюту */
  convertFromUsd: (priceUsd: number) => number;
  /** Конвертировать сумму из выбранной валюты в RUB */
  convertToUsd: (amountInDisplayCurrency: number) => number;
  /** Символ выбранной валюты (₽, $, € и т.д.) */
  symbol: string;
  /** Код валюты для пар (RUB, USD, EUR) */
  currencyCode: string;
  /** Название валюты для отображения */
  currencyName: string;
  /** Форматировать цену (из RUB) в выбранной валюте */
  formatPrice: (priceUsd: number, options?: { fractionDigits?: number }) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [baseCurrency, setBaseCurrencyInternal] = useState<string>('usd');
  const [rates, setRates] = useState<UsdRates | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUsdRates()
      .then((data) => {
        if (!cancelled) setRates(data);
      })
      .catch(() => {
        if (!cancelled) setRates(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const setBaseCurrency = useCallback((_code: string) => {
    // По ТЗ: пока фиксируем USD.
    setBaseCurrencyInternal('usd');
    try { localStorage.setItem('etoro_currency', 'usd'); } catch {}
  }, []);

  const convertFromUsd = useCallback(
    (priceUsd: number): number => {
      // All prices and balances are stored in USD — no conversion needed.
      // The parameter name is kept as `priceUsd` (historically `priceUsd`).
      if (baseCurrency === 'usd') return priceUsd;
      // For display in other currencies, convert from USD using rate
      const targetRate = rates?.usd?.[baseCurrency];
      if (targetRate == null || targetRate <= 0) return priceUsd;
      return priceUsd * targetRate;
    },
    [baseCurrency, rates]
  );

  const convertToUsd = useCallback(
    (amountInDisplayCurrency: number): number => {
      // Convert from display currency back to USD (storage currency)
      if (baseCurrency === 'usd') return amountInDisplayCurrency;
      const targetRate = rates?.usd?.[baseCurrency];
      if (targetRate == null || targetRate <= 0) return amountInDisplayCurrency;
      return amountInDisplayCurrency / targetRate;
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

  const symbol = CURRENCY_SYMBOLS[baseCurrency] ?? baseCurrency.toUpperCase();
  const currencyCode = baseCurrency.toUpperCase();
  const currencyName =
    baseCurrency === 'rub' ? 'рублях' :
    baseCurrency === 'usd' ? 'долларах' :
    baseCurrency === 'eur' ? 'евро' :
    baseCurrency === 'kzt' ? 'тенге' :
    baseCurrency === 'uah' ? 'гривнах' :
    baseCurrency === 'cny' ? 'юанях' :
    baseCurrency === 'gbp' ? 'фунтах' :
    baseCurrency.toUpperCase();

  const value: CurrencyContextValue = {
    baseCurrency,
    setBaseCurrency,
    rates,
    loading,
    convertFromUsd,
    convertToUsd,
    symbol,
    currencyCode,
    currencyName,
    formatPrice,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
