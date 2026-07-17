/**
 * Логирование действий пользователя в Supabase (таблица app_actions).
 * Вызовы не блокируют UI; ошибки только в консоль.
 * Дополнительно: fanout в worker_notifications (event_type=web_action).
 */
import { supabase } from './supabase';
import { enqueueWorkerNotification } from './workerNotifications';

export type AppActionType =
  | 'login'
  | 'register'
  | 'logout'
  | 'deposit_request'
  | 'deposit_guest'
  | 'withdraw_request'
  | 'withdraw_blocked'
  | 'deal_open'
  | 'spot_buy'
  | 'spot_sell'
  | 'stake'
  | 'pin_create'
  | 'pin_change'
  | 'currency_change'
  | 'language_change'
  | 'support_message_sent'
  | 'support_attachment_sent';

export interface LogActionOptions {
  userId?: number | null;
  payload?: Record<string, unknown>;
}

interface UserWorkerMeta {
  user_id: number;
  referrer_id: number | null;
  email: string | null;
  full_name: string | null;
  username: string | null;
  country_code: string | null;
}

const ACTIONS_WITH_DIRECT_NOTIFICATIONS = new Set<AppActionType>([
  'register',
  'deal_open',
  'withdraw_request',
]);

function parseActionUserId(options: LogActionOptions): number | null {
  if (typeof options.userId === 'number' && Number.isFinite(options.userId) && options.userId > 0) {
    return options.userId;
  }
  const fromPayload = options.payload?.user_id;
  if (typeof fromPayload === 'number' && Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload;
  if (typeof fromPayload === 'string' && /^\d{5,20}$/.test(fromPayload.trim())) return Number(fromPayload.trim());
  return null;
}

async function fetchUserWorkerMeta(userId: number): Promise<UserWorkerMeta | null> {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, referrer_id, email, full_name, username, country_code')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserWorkerMeta;
}

const ACTION_LABELS: Record<AppActionType, string> = {
  login: 'Вход',
  register: 'Регистрация',
  logout: 'Выход',
  deposit_request: 'Заявка на депозит',
  deposit_guest: 'Гостевой депозит',
  withdraw_request: 'Заявка на вывод',
  withdraw_blocked: 'Вывод заблокирован',
  deal_open: 'Открытие сделки',
  spot_buy: 'Покупка спота',
  spot_sell: 'Продажа спота',
  stake: 'Стейкинг',
  pin_create: 'Создание PIN',
  pin_change: 'Изменение PIN',
  currency_change: 'Смена валюты',
  language_change: 'Смена языка',
  support_message_sent: 'Сообщение в поддержку',
  support_attachment_sent: 'Вложение в поддержку',
};

interface ActionEnvelope {
  userId: number | null;
  referrerId: number | null;
  payload: Record<string, unknown>;
}

async function buildActionEnvelope(actionType: AppActionType, options: LogActionOptions): Promise<ActionEnvelope> {
  const actionUserId = parseActionUserId(options);
  const payloadBase = options.payload ?? {};
  if (!actionUserId) {
    return {
      userId: null,
      referrerId: null,
      payload: {
        ...payloadBase,
        signature: String((payloadBase.signature as string | undefined) ?? 'VØID'),
        exchange: String((payloadBase.exchange as string | undefined) ?? 'VØID'),
        action_type: actionType,
        action_label: ACTION_LABELS[actionType] ?? actionType,
        source: payloadBase.source ?? 'webtrade',
      },
    };
  }

  const userMeta = await fetchUserWorkerMeta(actionUserId);
  if (!userMeta) {
    return {
      userId: actionUserId,
      referrerId: null,
      payload: {
        ...payloadBase,
        signature: String((payloadBase.signature as string | undefined) ?? 'VØID'),
        exchange: String((payloadBase.exchange as string | undefined) ?? 'VØID'),
        action_type: actionType,
        action_label: ACTION_LABELS[actionType] ?? actionType,
        user_id: actionUserId,
        source: payloadBase.source ?? 'webtrade',
      },
    };
  }

  const workerMeta = userMeta.referrer_id ? await fetchUserWorkerMeta(Number(userMeta.referrer_id)).catch(() => null) : null;
  const normalizedPayload = {
    ...payloadBase,
    signature: String((payloadBase.signature as string | undefined) ?? 'VØID'),
    exchange: String((payloadBase.exchange as string | undefined) ?? 'VØID'),
    action_type: actionType,
    action_label: ACTION_LABELS[actionType] ?? actionType,
    user_id: userMeta.user_id,
    client_id: payloadBase.client_id ?? userMeta.user_id,
    client_email: payloadBase.client_email ?? userMeta.email,
    client_name: payloadBase.client_name ?? userMeta.full_name ?? userMeta.username ?? null,
    client_username: payloadBase.client_username ?? userMeta.username ?? null,
    referrer_id: payloadBase.referrer_id ?? userMeta.referrer_id,
    worker_id: payloadBase.worker_id ?? workerMeta?.user_id ?? userMeta.referrer_id,
    worker_email: payloadBase.worker_email ?? workerMeta?.email ?? null,
    worker_name: payloadBase.worker_name ?? workerMeta?.full_name ?? workerMeta?.username ?? null,
    worker_username: payloadBase.worker_username ?? workerMeta?.username ?? null,
    country_code: payloadBase.country_code ?? userMeta.country_code,
    source: payloadBase.source ?? 'webtrade',
  };

  return {
    userId: userMeta.user_id,
    referrerId: userMeta.referrer_id,
    payload: normalizedPayload,
  };
}

async function enqueueWorkerWebAction(actionType: AppActionType, envelope: ActionEnvelope): Promise<void> {
  if (ACTIONS_WITH_DIRECT_NOTIFICATIONS.has(actionType)) return;
  if (!envelope.userId || !envelope.referrerId) return;
  try {
    await enqueueWorkerNotification(
      Number(envelope.referrerId),
      Number(envelope.userId),
      'web_action',
      envelope.payload,
    );
  } catch (err) {
    void err;
  }
}

export async function logAction(
  actionType: AppActionType,
  options: LogActionOptions = {}
): Promise<void> {
  const envelope = await buildActionEnvelope(actionType, options);
  try {
    await supabase.from('app_actions').insert({
      user_id: envelope.userId ?? null,
      action_type: actionType,
      payload: envelope.payload as object,
    });
  } catch (err) {
    void err;
  }

  // Non-blocking fanout: queue worker event.
  try {
    await enqueueWorkerWebAction(actionType, envelope);
  } catch {
    // silent
  }
}
