import type {
  CountryBankRow,
  CryptoWalletRow,
  TradeSettingsRow,
  TradeUserRow,
  WithdrawTemplateRow,
} from '../shared';
import {
  removeChannelDeferred,
  subscribeToRowUpdates,
} from '../shared';
import { ServiceError } from '../errors';
import { supabase } from '../supabase';

export interface WorkerEventRecord {
  title: string;
  bonus: string | null;
  body: string;
  image_url: string;
}

export interface PlatformData {
  settings: TradeSettingsRow | null;
  countries: CountryBankRow[];
  cryptoWallets: CryptoWalletRow[];
  withdrawTemplates: WithdrawTemplateRow[];
}

export async function getPlatformData(): Promise<PlatformData> {
  const [settingsRes, countriesRes, cryptoRes, templatesRes] = await Promise.all([
    supabase.from('settings').select('support_username, min_deposit, min_withdraw, bank_details').limit(1).maybeSingle(),
    supabase
      .from('country_bank_details')
      .select('id,country_name,country_code,currency,bank_details,bank_name,sbp_bank_name,sbp_phone,exchange_rate,is_active')
      .eq('is_active', true)
      .order('country_name'),
    supabase
      .from('crypto_wallets')
      .select('id,network,wallet_address,label,is_active,sort_order')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('withdraw_message_templates')
      .select('message_type,title,description,icon,button_text,is_active,sort_order')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  if (settingsRes.error) throw new ServiceError('settings_load_failed', settingsRes.error.message);
  if (countriesRes.error) throw new ServiceError('countries_load_failed', countriesRes.error.message);
  if (cryptoRes.error) throw new ServiceError('wallets_load_failed', cryptoRes.error.message);
  if (templatesRes.error) throw new ServiceError('withdraw_templates_load_failed', templatesRes.error.message);

  return {
    settings: (settingsRes.data as TradeSettingsRow | null) ?? null,
    countries: (countriesRes.data as CountryBankRow[] | null) ?? [],
    cryptoWallets: (cryptoRes.data as CryptoWalletRow[] | null) ?? [],
    withdrawTemplates: (templatesRes.data as WithdrawTemplateRow[] | null) ?? [],
  };
}

export async function getUser(email: string): Promise<TradeUserRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('users')
    .select('user_id,username,full_name,email,photo_url,referrer_id,balance,worker_min_deposit,worker_min_withdraw,luck,trade_move_min,trade_move_max,worker_trade_move_min,worker_trade_move_max,withdraw_message_type,is_kyc,trading_blocked,withdraw_blocked,is_worker,country_code,preferred_currency,preferred_locale,stats_wins,stats_losses,created_at,updated_at')
    .eq('email', normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ServiceError('user_load_failed', error.message);
  }

  return (data as TradeUserRow | null) ?? null;
}

export async function getWorkerLimits(workerId: number): Promise<{
  minDeposit: number | null;
  minWithdraw: number | null;
}> {
  const { data, error } = await supabase
    .from('users')
    .select('worker_min_deposit,worker_min_withdraw')
    .eq('user_id', workerId)
    .maybeSingle();

  if (error) {
    throw new ServiceError('worker_limits_load_failed', error.message);
  }

  return {
    minDeposit: data?.worker_min_deposit == null ? null : Number(data.worker_min_deposit),
    minWithdraw: data?.worker_min_withdraw == null ? null : Number(data.worker_min_withdraw),
  };
}

export async function fetchActiveWorkerEvent(workerId: number): Promise<WorkerEventRecord | null> {
  const { data, error } = await supabase
    .from('worker_events')
    .select('title,bonus,body,image_url')
    .eq('worker_id', workerId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ServiceError('worker_event_load_failed', error.message);
  }

  if (!data?.title || !data?.body || !data?.image_url) {
    return null;
  }

  return data as WorkerEventRecord;
}

export function subscribeToUser(
  userId: number,
  onUpdate: (row: TradeUserRow) => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = subscribeToRowUpdates<TradeUserRow>(
    supabase,
    {
      channel: `user:${userId}`,
      table: 'users',
      filter: `user_id=eq.${userId}`,
    },
    ({ new: row }) => {
      onUpdate(row);
    },
    onStatus,
  );

  return () => {
    removeChannelDeferred(supabase, channel);
  };
}
