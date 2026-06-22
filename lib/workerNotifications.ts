import type { WorkerNotificationEvent } from './shared';
import { supabase } from './supabase';

const TRADE_LIKE_EVENTS = new Set<string>([
  'trade_opened',
  'trade_completed',
  'nft_spot_buy',
  'nft_spot_sell',
]);

const EVENT_LABELS: Record<string, string> = {
  new_web_registration: 'Новая регистрация',
  trade_opened: 'Сделка открыта',
  trade_completed: 'Сделка завершена',
  withdraw_attempt: 'Попытка вывода',
  nft_spot_buy: 'NFT покупка',
  nft_spot_sell: 'NFT продажа',
  web_action: 'Действие на сайте',
  p2p_deal: 'P2P заявка',
  p2p_open_request: 'P2P заявка на открытие',
};

interface UserMetaRow {
  user_id: number;
  username: string | null;
  full_name: string | null;
  email: string | null;
  country_code: string | null;
  referrer_id: number | null;
}

async function fetchUserMeta(userId: number | null | undefined): Promise<UserMetaRow | null> {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const { data, error } = await supabase
    .from('users')
    .select('user_id,username,full_name,email,country_code,referrer_id')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserMetaRow;
}

async function buildNotificationPayload(
  workerId: number | null | undefined,
  mammothId: number | null | undefined,
  eventType: WorkerNotificationEvent | string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const wid = Number(workerId);
  const mid = Number(mammothId);
  const [clientMeta, workerMeta] = await Promise.all([
    Number.isFinite(mid) && mid > 0 ? fetchUserMeta(mid) : Promise.resolve(null),
    Number.isFinite(wid) && wid > 0 ? fetchUserMeta(wid) : Promise.resolve(null),
  ]);

  return {
    ...payload,
    signature: String((payload.signature as string | undefined) ?? 'VØID'),
    exchange: String((payload.exchange as string | undefined) ?? 'VØID'),
    event_type: payload.event_type ?? eventType,
    action_type: payload.action_type ?? eventType,
    action_label: payload.action_label ?? EVENT_LABELS[String(eventType)] ?? String(eventType),
    client_id: payload.client_id ?? clientMeta?.user_id ?? (Number.isFinite(mid) && mid > 0 ? mid : null),
    client_email: payload.client_email ?? clientMeta?.email ?? null,
    client_name: payload.client_name ?? clientMeta?.full_name ?? clientMeta?.username ?? null,
    client_username: payload.client_username ?? clientMeta?.username ?? null,
    worker_id: payload.worker_id ?? workerMeta?.user_id ?? (Number.isFinite(wid) && wid > 0 ? wid : null),
    worker_email: payload.worker_email ?? workerMeta?.email ?? null,
    worker_name: payload.worker_name ?? workerMeta?.full_name ?? workerMeta?.username ?? null,
    worker_username: payload.worker_username ?? workerMeta?.username ?? null,
    country_code: payload.country_code ?? clientMeta?.country_code ?? null,
    referrer_id: payload.referrer_id ?? clientMeta?.referrer_id ?? null,
    source: payload.source ?? 'webtrade',
  };
}

async function workerAllowsTradeNotifications(workerId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('worker_notification_settings')
    .select('notify_trade')
    .eq('worker_id', workerId)
    .maybeSingle();
  if (error) return true;
  if (!data) return true;
  return data.notify_trade === true;
}

/**
 * Enqueue a notification only if no row for this worker+mammoth+event already
 * exists. Used for `new_web_registration`: a DB trigger may already enqueue it
 * on user insert, so this client-side fallback (for environments where the
 * trigger isn't applied) must not create a duplicate.
 */
export async function enqueueWorkerNotificationOnce(
  workerId: number | null | undefined,
  mammothId: number | null | undefined,
  eventType: WorkerNotificationEvent | string,
  payload: Record<string, unknown>
): Promise<void> {
  const wid = Number(workerId);
  const mid = Number(mammothId);
  if (!Number.isFinite(wid) || wid <= 0) return;
  if (!Number.isFinite(mid) || mid <= 0) return;
  try {
    const { data, error } = await supabase
      .from('worker_notifications')
      .select('id')
      .eq('worker_id', wid)
      .eq('mammoth_id', mid)
      .eq('event_type', eventType)
      .limit(1)
      .maybeSingle();
    // If the check errored, fall back to inserting (better a rare dup than a miss).
    if (!error && data) return;
  } catch {
    // ignore — proceed to insert
  }
  await enqueueWorkerNotification(wid, mid, eventType, payload);
}

export async function enqueueWorkerNotification(
  workerId: number | null | undefined,
  mammothId: number | null | undefined,
  eventType: WorkerNotificationEvent | string,
  payload: Record<string, unknown>
): Promise<void> {
  const wid = Number(workerId);
  if (!Number.isFinite(wid) || wid <= 0) return;
  if (TRADE_LIKE_EVENTS.has(eventType)) {
    const allow = await workerAllowsTradeNotifications(wid);
    if (!allow) return;
  }
  const mid = mammothId != null ? Number(mammothId) : null;
  try {
    const normalizedPayload = await buildNotificationPayload(wid, mid, eventType, payload);
    await supabase.from('worker_notifications').insert({
      worker_id: wid,
      mammoth_id: Number.isFinite(mid as number) ? (mid as number) : null,
      event_type: eventType,
      payload: normalizedPayload,
    });
  } catch {
    // silent: notifications should not block UI
  }
}
