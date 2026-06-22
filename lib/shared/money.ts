import type { NumericLike } from "./types.js";

export const STORED_BALANCE_CURRENCY = "USD";
export const DEFAULT_PREFERRED_CURRENCY = "USD";

export function asNumber(value: NumericLike, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) return fallback;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function normalizeCurrencyCode(value: string | null | undefined, fallback = DEFAULT_PREFERRED_CURRENCY): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  return normalized || fallback;
}

export function convertFromStoredUsd(amountUsd: NumericLike, rateFromUsd?: NumericLike): number {
  const amount = asNumber(amountUsd);
  const rate = asNumber(rateFromUsd, 1);
  if (!(rate > 0)) return amount;
  return amount * rate;
}

export function convertToStoredUsd(amountInDisplayCurrency: NumericLike, rateFromUsd?: NumericLike): number {
  const amount = asNumber(amountInDisplayCurrency);
  const rate = asNumber(rateFromUsd, 1);
  if (!(rate > 0)) return amount;
  return amount / rate;
}
