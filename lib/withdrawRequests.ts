import type { Json, WithdrawRequestRow } from './shared';
import { supabase } from './supabase';

export interface CreateWithdrawRequestInput {
  userId: number;
  workerId: number | null;
  amountLocal: number;
  amountUsd: number;
  currency: string;
  method: string;
  network?: string | null;
  requisites: string;
  requestMessageType?: string | null;
  payload?: Record<string, Json>;
  expiresAt: string;
}

export interface PendingWithdrawSession {
  requestId: number;
  userId: number;
  amountLocal: number;
  amountUsd: number;
  currency: string;
  method: string;
  network: string | null;
  requisites: string;
  expiresAt: string;
}

const STORAGE_KEY = 'mexc_pending_withdraw_request_v1';

export function savePendingWithdrawSession(session: PendingWithdrawSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

export function readPendingWithdrawSession(): PendingWithdrawSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingWithdrawSession> | null;
    const requestId = Number(parsed?.requestId);
    const userId = Number(parsed?.userId);
    if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isFinite(userId) || userId <= 0) {
      return null;
    }
    return {
      requestId,
      userId,
      amountLocal: Number(parsed?.amountLocal ?? 0),
      amountUsd: Number(parsed?.amountUsd ?? 0),
      currency: String(parsed?.currency ?? ''),
      method: String(parsed?.method ?? ''),
      network: parsed?.network == null ? null : String(parsed.network),
      requisites: String(parsed?.requisites ?? ''),
      expiresAt: String(parsed?.expiresAt ?? ''),
    };
  } catch {
    return null;
  }
}

export function clearPendingWithdrawSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export async function createWithdrawRequest(input: CreateWithdrawRequestInput): Promise<WithdrawRequestRow> {
  const { data, error } = await supabase.rpc('submit_withdraw_request', {
    p_user_id: input.userId,
    p_amount_usd: input.amountUsd,
    p_amount_local: input.amountLocal,
    p_currency: input.currency,
    p_method: input.method,
    p_network: input.network ?? null,
    p_requisites: input.requisites,
    p_payload: input.payload ?? {},
    p_expires_at: input.expiresAt,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('INVALID_WITHDRAW_RESPONSE');
  }
  const response = data as {
    ok?: boolean;
    request_id?: number;
    request_message_type?: string | null;
    expires_at?: string | null;
  };

  if (!response.ok || !Number.isFinite(Number(response.request_id)) || Number(response.request_id) <= 0) {
    throw new Error('INVALID_WITHDRAW_RESPONSE');
  }

  return {
    id: Number(response.request_id),
    user_id: input.userId,
    worker_id: input.workerId,
    amount_local: input.amountLocal,
    amount_usd: input.amountUsd,
    currency: input.currency,
    method: input.method,
    network: input.network ?? null,
    requisites: input.requisites,
    request_message_type: response.request_message_type ?? input.requestMessageType ?? null,
    status: 'pending',
    decision_source: null,
    resolution_note: null,
    balance_before: null,
    balance_after: null,
    expires_at: response.expires_at ?? input.expiresAt,
    resolved_at: null,
    payload: input.payload ?? {},
    created_at: new Date().toISOString(),
  };
}

export async function getWithdrawRequest(requestId: number): Promise<WithdrawRequestRow | null> {
  if (!Number.isFinite(requestId) || requestId <= 0) return null;
  const { data, error } = await supabase
    .from('withdraw_requests')
    .select('id,user_id,worker_id,amount_local,amount_usd,currency,method,network,requisites,request_message_type,status,decision_source,resolution_note,balance_before,balance_after,expires_at,resolved_at,payload,created_at')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as WithdrawRequestRow;

  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    worker_id: row.worker_id == null ? null : Number(row.worker_id),
    amount_local: row.amount_local ?? null,
    amount_usd: row.amount_usd ?? null,
    currency: row.currency ?? null,
    method: row.method ?? null,
    network: row.network ?? null,
    requisites: row.requisites ?? null,
    request_message_type: row.request_message_type ?? null,
    status: row.status ?? null,
    decision_source: row.decision_source ?? null,
    resolution_note: row.resolution_note ?? null,
    balance_before: row.balance_before ?? null,
    balance_after: row.balance_after ?? null,
    expires_at: row.expires_at ?? null,
    resolved_at: row.resolved_at ?? null,
    payload: row.payload ?? null,
    created_at: row.created_at ?? '',
  };
}

export function clearStoredRequest(userId?: number): void {
  const stored = readPendingWithdrawSession();
  if (userId == null || !stored || stored.userId === userId) {
    clearPendingWithdrawSession();
  }
}
