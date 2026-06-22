import { normalizeCurrencyCode } from './shared';
import { supabase } from './supabase';

export async function updateUserPreferredCurrency(userId: number, currencyCode: string): Promise<void> {
  const preferredCurrency = normalizeCurrencyCode(currencyCode);
  await supabase
    .from('users')
    .update({ preferred_currency: preferredCurrency })
    .eq('user_id', userId);
}

export async function updateUserPreferredLocale(userId: number, locale: string): Promise<void> {
  await supabase
    .from('users')
    .update({ preferred_locale: locale })
    .eq('user_id', userId);
}
