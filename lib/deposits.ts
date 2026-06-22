import type { P2PDealRow as SharedP2PDealRow, TradeRealtimeChannel } from './shared';
import { removeChannelDeferred, subscribeToTableChanges } from './shared';
import { supabase } from './supabase';

export type P2PDealRow = SharedP2PDealRow;

export interface CreateP2PDealInput {
  userId: number;
  workerId?: number | null;
  country: string;
  countryCode: string;
  bank: string;
  amount: number;
  currency: string;
  sellerName: string;
}

export interface OpenP2PDealResult {
  mode: 'auto' | 'pending';
  dealId: string;
  status: string;
  requisites?: string | null;
  comment?: string | null;
  timeSeconds?: number | null;
}

const P2P_DEAL_SELECT =
  'id,user_id,worker_id,country,bank,amount,currency,fake_seller_name,payment_requisites,payment_comment,payment_time_seconds,screenshot_url,status,tg_channel_message_id,tg_worker_paid_notified_at,created_at,updated_at';

export async function openP2PDeal(input: CreateP2PDealInput): Promise<OpenP2PDealResult | null> {
  const userId = Number(input.userId);
  const amount = Number(input.amount);
  const country = String(input.country || '').trim();
  const countryCode = String(input.countryCode || '').trim();
  const bank = String(input.bank || '').trim();
  const currency = String(input.currency || '').trim();
  const sellerName = String(input.sellerName || '').trim();

  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!country || !countryCode || !bank || !currency || !sellerName) return null;

  const { data, error } = await supabase.rpc('open_p2p_deal', {
    p_user_id: userId,
    p_country: country,
    p_country_code: countryCode,
    p_bank: bank,
    p_amount: amount,
    p_currency: currency,
    p_seller_name: sellerName,
  });

  if (error || !data || typeof data !== 'object') return null;

  const response = data as {
    ok?: boolean;
    error?: string;
    mode?: 'auto' | 'pending';
    deal_id?: string;
    status?: string;
    requisites?: string | null;
    comment?: string | null;
    time_seconds?: number | null;
  };

  if (response.ok === false || response.error) return null;

  if (!response.deal_id) return null;

  return {
    mode: response.mode ?? 'pending',
    dealId: response.deal_id,
    status: response.status ?? 'pending_confirm',
    requisites: response.requisites ?? null,
    comment: response.comment ?? null,
    timeSeconds: response.time_seconds ?? null,
  };
}

export async function cancelPendingP2PDeal(dealId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_p2p_deal', { p_deal_id: dealId });
  if (error) throw error;
}

export async function getP2PDeal(dealId: string): Promise<P2PDealRow | null> {
  const { data, error } = await supabase
    .from('p2p_deals')
    .select(P2P_DEAL_SELECT)
    .eq('id', dealId)
    .maybeSingle();
  if (error || !data) return null;
  return data as P2PDealRow;
}

export async function markP2PDealPaid(dealId: string, screenshotUrl?: string | null): Promise<boolean> {
  const { error } = await supabase.rpc('mark_p2p_deal_paid', {
    p_deal_id: dealId,
    p_screenshot_url: screenshotUrl ?? null,
  });
  if (error) return false;
  return true;
}

export function subscribeToP2PDealUpdates(
  dealId: string,
  onUpdate: (row: P2PDealRow) => void,
  onStatus?: (status: string) => void,
): TradeRealtimeChannel {
  return subscribeToTableChanges<P2PDealRow>(
    supabase,
    {
      channel: `p2p_deal_${dealId}`,
      table: 'p2p_deals',
      filter: `id=eq.${dealId}`,
      event: 'UPDATE',
    },
    ({ new: row }) => {
      onUpdate(row);
    },
    onStatus,
  );
}

export function removeDepositChannel(channel: TradeRealtimeChannel | null | undefined): void {
  removeChannelDeferred(supabase, channel);
}

export async function createCryptoDepositRequest(input: {
  userId: number;
  workerId?: number | null;
  amountLocal: number;
  amountUsd: number;
  currency: string;
}): Promise<{ id: number; created_at?: string | null } | null> {
  void input.workerId;
  const { data, error } = await supabase.rpc('create_crypto_deposit_request', {
    p_user_id: input.userId,
    p_amount_local: input.amountLocal,
    p_amount_usd: input.amountUsd,
    p_currency: input.currency,
  });
  if (error || !data || typeof data !== 'object') return null;
  const response = data as { id?: number; created_at?: string | null };
  if (!Number.isFinite(Number(response.id))) return null;
  return { id: Number(response.id), created_at: response.created_at ?? null };
}
