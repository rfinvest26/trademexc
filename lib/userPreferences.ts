import { normalizeCurrencyCode } from './shared';
import { supabase } from './supabase';

export async function updateUserPreferredCurrency(userId: number, currencyCode: string): Promise<void> {
  const preferredCurrency = normalizeCurrencyCode(currencyCode);
  const { error } = await supabase
    .from('users')
    .update({ preferred_currency: preferredCurrency })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateUserPreferredLocale(userId: number, locale: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ preferred_locale: locale })
    .eq('user_id', userId);
  if (error) throw error;
}
