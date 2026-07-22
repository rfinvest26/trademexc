import { isMainSupabaseConfigured, mainSupabase } from './mainSupabase';

export interface SiteQrConfig {
  available: boolean;
  minAmount: number;
  maxAmount: number;
  ranges: Array<{ min: number; max: number }>;
}

export interface SiteQrPayment {
  paymentId: number;
  status: string;
  amount: number;
  sbpLink: string | null;
  qrBase64: string | null;
  cardLast4: string | null;
  errorCode: string | null;
  paidAt: string | null;
  expiresAt: string;
  remainingSeconds: number | null;
  generatedAt: string | null;
  updatedAt: string;
}

export interface SiteQrAccess {
  paymentId: number;
  requestId: string;
  accessToken: string;
}

export type SiteQrRequestSeed = Pick<SiteQrAccess, 'requestId' | 'accessToken'>;

function firstRow<T>(data: unknown): T | null {
  return Array.isArray(data) ? (data[0] as T | undefined) ?? null : (data as T | null);
}

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createSiteQrRequestSeed(): SiteQrRequestSeed {
  return { requestId: randomUuid(), accessToken: randomHex(32) };
}

// Live MAIN Supabase reads can legitimately take 4–8 seconds under load.
// Keep the request bounded without aborting healthy slow responses.
const QR_RPC_TIMEOUT_MS = 12_000;
const QR_CREATE_TIMEOUT_MS = 15_000;

interface QrRpcResponse {
  data: unknown;
  error: unknown;
  status?: number;
}

interface QrRpcRequest {
  abortSignal(signal: AbortSignal): PromiseLike<QrRpcResponse>;
}

async function runQrRpc(request: QrRpcRequest, timeoutMs = QR_RPC_TIMEOUT_MS): Promise<QrRpcResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request.abortSignal(controller.signal);
    if (controller.signal.aborted) return { data: null, error: new Error('QR_RPC_TIMEOUT'), status: 408 };
    return response;
  } catch (error) {
    return controller.signal.aborted
      ? { data: null, error: new Error('QR_RPC_TIMEOUT'), status: 408 }
      : { data: null, error };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function isSiteQrAccess(value: unknown): value is SiteQrAccess {
  const access = value as Partial<SiteQrAccess> | null;
  return Boolean(
    access
      && typeof access.paymentId === 'number'
      && Number.isSafeInteger(access.paymentId)
      && access.paymentId > 0
      && /^[0-9a-f]{64}$/.test(String(access.accessToken ?? ''))
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(access.requestId ?? '')),
  );
}

function qrErrorText(error: unknown): string {
  return String((error as { message?: unknown })?.message ?? error ?? '').toUpperCase();
}

function shouldRetryQrRpc(error: unknown): boolean {
  const message = qrErrorText(error);
  if (['QR_NOT_AVAILABLE', 'QR_INVALID_REQUEST', 'QR_INVALID_ACCESS_TOKEN', 'QR_INVALID_AMOUNT', 'QR_AMOUNT_OUT_OF_RANGE', 'QR_RATE_LIMIT', 'QR_REQUEST_CONFLICT', 'QR_ACTIVE_PAYMENT_EXISTS', 'QR_ACTIVE_PAYMENT_LIMIT', 'QR_ACTIVE_REFERENCE_EXISTS', 'QR_WORKER_NOT_FOUND']
    .some((code) => message.includes(code))) return false;
  const status = Number((error as { status?: unknown })?.status);
  return status === 408 || status >= 500 || /FETCH|NETWORK|TIMEOUT|CONNECTION/.test(message);
}

function retryDelay(attempt: number): Promise<void> {
  const delay = 700 * 2 ** attempt + Math.floor(Math.random() * 200);
  return new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

function safeQrBase64(value: unknown): string | null {
  const raw = String(value ?? '').trim().replace(/^data:image\/png;base64,/i, '').replace(/\s+/g, '');
  if (!raw || raw.length > 8_000_000 || !/^[A-Za-z0-9+/=_-]+$/.test(raw)) return null;
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  return `${normalized}${'='.repeat((4 - normalized.length % 4) % 4)}`;
}

function safePaymentUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function formatQrRanges(config: SiteQrConfig): string {
  return config.ranges.length
    ? config.ranges.map((range) => `${range.min.toLocaleString('ru-RU')}–${range.max.toLocaleString('ru-RU')} ₽`).join(', ')
    : 'нет доступных диапазонов';
}

export function siteQrErrorMessage(error: unknown, config?: SiteQrConfig): string {
  const message = qrErrorText(error);
  if (message.includes('QR_AMOUNT_OUT_OF_RANGE') || message.includes('QR_INVALID_AMOUNT')) return `Доступные суммы: ${config ? formatQrRanges(config) : 'уточняются'}.`;
  if (message.includes('QR_RATE_LIMIT')) return 'Слишком много запросов за короткое время. Подождите несколько минут.';
  if (message.includes('QR_ACTIVE_PAYMENT_LIMIT')) return 'У вас уже три активных QR. Оплатите, отмените или дождитесь окончания одного из них.';
  if (message.includes('QR_ACTIVE_REFERENCE_EXISTS')) return 'Для этой заявки QR уже создан. Вернитесь к активной оплате и не создавайте дубликат.';
  if (message.includes('QR_ACTIVE_PAYMENT_EXISTS')) return 'У вас уже есть активный QR в другой вкладке или на другом устройстве. Используйте его либо дождитесь окончания текущего окна.';
  if (message.includes('QR_WORKER_NOT_FOUND')) return 'Куратор для уведомления не найден. Откройте поддержку — QR не создавался и деньги не списывались.';
  if (message.includes('QR_INVALID_ACCESS_TOKEN') || message.includes('QR_INVALID_REQUEST') || message.includes('QR_REQUEST_CONFLICT')) return 'Сохранённая QR-сессия повреждена. Вернитесь к способам оплаты и создайте новый запрос.';
  if (message.includes('QR_NOT_AVAILABLE')) return 'Оплата по QR сейчас недоступна. Выберите P2P.';
  return 'Сервис временно не ответил. Запрос можно безопасно повторить — дубль платежа не создастся.';
}

export function qrAmountAllowed(config: SiteQrConfig, amount: number): boolean {
  return Number.isSafeInteger(amount) && config.ranges.some((range) => amount >= range.min && amount <= range.max);
}

export async function getSiteQrConfig(service: 'trade' | 'escort' | 'smoke', country: string): Promise<SiteQrConfig> {
  if (!isMainSupabaseConfigured) return { available: false, minAmount: 100, maxAmount: 100000, ranges: [] };
  let data: unknown = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await runQrRpc(mainSupabase.rpc('get_site_qr_config', { p_service: service, p_country: country }));
    data = response.data;
    lastError = response.error;
    if (!response.error) break;
    if (!shouldRetryQrRpc(response.error)) break;
    if (attempt < 1) await retryDelay(attempt);
  }
  if (lastError) throw lastError;
  const row = firstRow<{ available?: boolean; min_amount?: number; max_amount?: number; amount_ranges?: unknown }>(data);
  const ranges = Array.isArray(row?.amount_ranges)
    ? row!.amount_ranges.flatMap((item) => {
        const value = item as { min?: unknown; max?: unknown };
        const min = Number(value.min);
        const max = Number(value.max);
        return Number.isSafeInteger(min) && Number.isSafeInteger(max) && min > 0 && max >= min ? [{ min, max }] : [];
      })
    : [];
  return {
    available: row?.available === true && country.toUpperCase() === 'RU' && ranges.length > 0,
    minAmount: ranges.length ? Math.min(...ranges.map((range) => range.min)) : Number(row?.min_amount) || 100,
    maxAmount: ranges.length ? Math.max(...ranges.map((range) => range.max)) : Number(row?.max_amount) || 100000,
    ranges,
  };
}

export async function createSiteQrPayment(input: {
  service: 'trade' | 'escort' | 'smoke';
  country: string;
  amount: number;
  externalUserId: string;
  externalUsername?: string | null;
  workerUserId?: number | null;
  referenceId?: string | null;
  referenceLabel?: string | null;
}, seed: SiteQrRequestSeed = createSiteQrRequestSeed()): Promise<SiteQrAccess> {
  const { requestId, accessToken } = seed;
  if (!isSiteQrAccess({ paymentId: 1, requestId, accessToken })) throw new Error('QR_INVALID_REQUEST');
  let data: unknown = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await runQrRpc(mainSupabase.rpc('create_site_qr_payment', {
      p_service: input.service,
      p_country: input.country,
      p_amount: input.amount,
      p_external_user_id: input.externalUserId,
      p_external_username: input.externalUsername ?? null,
      p_worker_user_id: input.workerUserId ?? null,
      p_reference_id: input.referenceId ?? null,
      p_reference_label: input.referenceLabel ?? null,
      p_request_id: requestId,
      p_access_token: accessToken,
    }), QR_CREATE_TIMEOUT_MS);
    data = response.data;
    lastError = response.error;
    if (!response.error) break;
    if (!shouldRetryQrRpc(response.error)) break;
    if (attempt < 2) await retryDelay(attempt);
  }
  if (lastError) throw lastError;
  const row = firstRow<{ payment_id?: number }>(data);
  if (!Number.isSafeInteger(Number(row?.payment_id))) throw new Error('QR_PAYMENT_NOT_CREATED');
  return { paymentId: Number(row!.payment_id), requestId, accessToken };
}

export async function getSiteQrPayment(access: SiteQrAccess): Promise<SiteQrPayment | null> {
  if (!isSiteQrAccess(access)) throw new Error('QR_INVALID_ACCESS_TOKEN');
  const { data, error } = await runQrRpc(mainSupabase.rpc('get_site_qr_payment', {
    p_payment_id: access.paymentId,
    p_access_token: access.accessToken,
  }));
  if (error) throw error;
  const row = firstRow<{
    payment_id: number; status: string; amount: number; sbp_link: string | null;
    qr_png_base64: string | null; card_last4: string | null; error_code: string | null; paid_at: string | null; expires_at: string;
    remaining_seconds?: number | null; generated_at: string | null; updated_at: string;
  }>(data);
  if (!row) return null;
  if (Number(row.payment_id) !== access.paymentId || !Number.isSafeInteger(Number(row.amount)) || Number(row.amount) <= 0 || !Number.isFinite(Date.parse(String(row.expires_at)))) {
    throw new Error('QR_INVALID_RESPONSE');
  }
  return {
    paymentId: Number(row.payment_id), status: String(row.status), amount: Number(row.amount),
    sbpLink: safePaymentUrl(row.sbp_link),
    qrBase64: safeQrBase64(row.qr_png_base64), cardLast4: row.card_last4, errorCode: row.error_code, paidAt: row.paid_at,
    expiresAt: String(row.expires_at),
    remainingSeconds: Number.isFinite(Number(row.remaining_seconds)) ? Math.max(0, Math.trunc(Number(row.remaining_seconds))) : null,
    generatedAt: row.generated_at, updatedAt: String(row.updated_at),
  };
}

export async function cancelSiteQrPayment(access: SiteQrAccess): Promise<string> {
  if (!isSiteQrAccess(access)) throw new Error('QR_INVALID_ACCESS_TOKEN');
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await runQrRpc(mainSupabase.rpc('cancel_site_qr_payment', {
      p_payment_id: access.paymentId,
      p_access_token: access.accessToken,
    }));
    lastError = response.error;
    if (!response.error) {
      const current = firstRow<{ status?: string }>(response.data);
      if (!current?.status) throw new Error('QR_PAYMENT_NOT_FOUND');
      return String(current.status).toUpperCase();
    }
    if (!shouldRetryQrRpc(response.error)) break;
    if (attempt < 2) await retryDelay(attempt);
  }
  throw lastError;
}
