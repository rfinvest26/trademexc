import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, RefreshCw, QrCode, ShieldCheck, WifiOff, XCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import AppInput from '../AppInput';
import { cancelSiteQrPayment, createSiteQrPayment, createSiteQrRequestSeed, formatQrRanges, getSiteQrPayment, isSiteQrAccess, qrAmountAllowed, siteQrErrorMessage, type SiteQrAccess, type SiteQrConfig, type SiteQrPayment, type SiteQrRequestSeed } from '../../lib/siteQr';

interface QrDepositStepProps {
  config: SiteQrConfig;
  userId: number;
  username?: string | null;
  workerUserId?: number | null;
  onBack: () => void;
}

const terminalStatuses = new Set(['PROCESSED', 'REJECTED', 'BLOCKED', 'EXPIRED', 'CANCELLED', 'ERROR', 'FAILED']);
const QR_CREATION_TIMEOUT_SECONDS = 10 * 60;
const QR_PAYMENT_WINDOW_SECONDS = 30 * 60;

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${Math.floor(safe % 60).toString().padStart(2, '0')}`;
}

function publicQrStatus(payment: SiteQrPayment | null): string {
  const raw = String(payment?.status ?? 'creating').trim();
  if (raw === 'processing' || (!payment?.generatedAt && Boolean(payment?.errorCode) && ['creating', 'pending'].includes(raw))) return 'CREATION_UNCERTAIN';
  return raw.toUpperCase();
}

interface StoredQrSession {
  access: SiteQrAccess;
  amount: number;
  userId: number;
}

interface StoredQrDraft {
  seed: SiteQrRequestSeed;
  amount: number;
  userId: number;
}

function qrStorageKey(userId: number): string {
  return `mexc_qr_payment_${userId}`;
}

function qrDraftStorageKey(userId: number): string {
  return `mexc_qr_draft_${userId}`;
}

function readStoredQrDraft(userId: number, amount: number): StoredQrDraft | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(qrDraftStorageKey(userId)) ?? 'null') as Partial<StoredQrDraft> | null;
    if (!parsed || parsed.userId !== userId || parsed.amount !== amount || !isSiteQrAccess({ paymentId: 1, ...parsed.seed })) return null;
    return parsed as StoredQrDraft;
  } catch {
    return null;
  }
}

function readStoredQrSession(userId: number): StoredQrSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(qrStorageKey(userId)) ?? 'null') as Partial<StoredQrSession> | null;
    if (!parsed || parsed.userId !== userId || !Number.isSafeInteger(parsed.amount) || !isSiteQrAccess(parsed.access)) return null;
    return parsed as StoredQrSession;
  } catch {
    return null;
  }
}

export default function QrDepositStep({ config, userId, username, workerUserId, onBack }: QrDepositStepProps) {
  const restored = useMemo(() => readStoredQrSession(userId), [userId]);
  const [amount, setAmount] = useState(restored ? String(restored.amount) : '');
  const [access, setAccess] = useState<SiteQrAccess | null>(restored?.access ?? null);
  const [payment, setPayment] = useState<SiteQrPayment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pollFailures, setPollFailures] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(QR_CREATION_TIMEOUT_SECONDS);
  const [cancelling, setCancelling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const createInFlight = useRef(false);
  const reduceMotion = useReducedMotion();
  const amountValue = Number(amount.replace(/[\s₽]/g, '').replace(',', '.'));
  const validAmount = Number.isSafeInteger(amountValue) && qrAmountAllowed(config, amountValue);
  const rangeLabel = useMemo(() => formatQrRanges(config), [config]);

  useEffect(() => {
    if (!access) { setElapsed(0); return; }
    const startedAt = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, [access?.paymentId]);

  useEffect(() => {
    if (!access) return;
    let stopped = false;
    let inFlight = false;
    let consecutiveFailures = 0;
    let timer: number | null = null;
    const schedule = (delay: number) => {
      if (!stopped) timer = window.setTimeout(() => void tick(), delay);
    };
    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const next = await getSiteQrPayment(access);
        if (!stopped && next) {
          setPayment(next);
          setPollFailures(0);
          consecutiveFailures = 0;
          const nextStatus = publicQrStatus(next);
          if (!terminalStatuses.has(nextStatus) || nextStatus === 'PROCESSING') {
            schedule(document.hidden ? 15_000 : nextStatus === 'PROCESSING' ? 3_000 : nextStatus === 'CREATED' ? 8_000 : nextStatus === 'CANCELLED_HELD' ? 10_000 : nextStatus === 'CREATION_UNCERTAIN' ? 4_000 : 2_000);
          }
        } else if (!stopped) {
          consecutiveFailures += 1;
          setPollFailures(consecutiveFailures);
          schedule(Math.min(10_000, 2_000 * consecutiveFailures));
        }
      } catch {
        if (!stopped) {
          consecutiveFailures += 1;
          setPollFailures(consecutiveFailures);
          schedule(Math.min(20_000, 2_000 * 2 ** Math.min(consecutiveFailures - 1, 3)));
        }
      } finally {
        inFlight = false;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) window.clearTimeout(timer);
      timer = null;
      void tick();
    };
    void tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [access, refreshVersion]);

  useEffect(() => {
    if (!payment?.expiresAt) return;
    const receivedAt = Date.now();
    const serverRemaining = payment.remainingSeconds;
    const initial = Number.isFinite(serverRemaining)
      ? Math.max(0, Number(serverRemaining))
      : Math.max(0, Math.ceil((Date.parse(payment.expiresAt) - receivedAt) / 1000));
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil(initial - (Date.now() - receivedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [payment?.expiresAt, payment?.remainingSeconds]);

  const resetPayment = () => {
    localStorage.removeItem(qrStorageKey(userId));
    localStorage.removeItem(qrDraftStorageKey(userId));
    setAccess(null);
    setPayment(null);
    setPollFailures(0);
    setRemainingSeconds(QR_CREATION_TIMEOUT_SECONDS);
    setError('');
  };

  const cancel = async () => {
    if (!access || cancelling) return;
    setCancelling(true); setError('');
    try {
      const currentStatus = await cancelSiteQrPayment(access);
      if (currentStatus === 'PROCESSING' || currentStatus === 'PROCESSED' || currentStatus === 'CREATION_UNCERTAIN' || currentStatus === 'CANCELLED_HELD') {
        setPayment((current) => current ? { ...current, status: currentStatus, sbpLink: null, qrBase64: null } : current);
        setError(currentStatus === 'CANCELLED_HELD'
          ? 'QR скрыт. Новый платёж станет доступен после окончания текущего окна. Статус операции продолжает проверяться.'
          : currentStatus === 'CREATION_UNCERTAIN'
          ? 'Запрос уже обрабатывается, но его итог ещё неизвестен. Если QR не появится за 10 минут, его можно будет пересоздать.'
          : currentStatus === 'PROCESSING'
            ? 'Банк уже обрабатывает платёж. Отменять или создавать второй QR нельзя — дождитесь итогового статуса.'
            : 'Оплата уже подтверждена. Обновляем состояние платежа.');
        return;
      }
      resetPayment();
    } catch {
      setError('Не удалось отменить QR. Проверка продолжится автоматически — повторите ещё раз.');
    } finally { setCancelling(false); }
  };

  const create = async () => {
    if (!validAmount || submitting || createInFlight.current) return;
    createInFlight.current = true;
    setSubmitting(true); setError('');
    try {
      const seed = readStoredQrDraft(userId, amountValue)?.seed ?? createSiteQrRequestSeed();
      localStorage.setItem(qrDraftStorageKey(userId), JSON.stringify({ seed, amount: amountValue, userId } satisfies StoredQrDraft));
      const next = await createSiteQrPayment({
        service: 'trade', country: 'RU', amount: amountValue,
        externalUserId: String(userId), externalUsername: username, workerUserId,
        referenceLabel: 'Пополнение баланса биржи через QR',
      }, seed);
      setAccess(next);
      localStorage.setItem(qrStorageKey(userId), JSON.stringify({ access: next, amount: amountValue, userId } satisfies StoredQrSession));
      localStorage.removeItem(qrDraftStorageKey(userId));
    } catch (cause) {
      setError(siteQrErrorMessage(cause, config));
    } finally { createInFlight.current = false; setSubmitting(false); }
  };

  const restart = async () => {
    if (submitting || cancelling) return;
    resetPayment();
    await create();
  };

  if (access) {
    const status = publicQrStatus(payment);
    const paid = status === 'PROCESSED';
    const processing = status === 'PROCESSING';
    const creationUncertain = status === 'CREATION_UNCERTAIN';
    const cancelledHeld = status === 'CANCELLED_HELD';
    const expiredByClock = Boolean(payment?.expiresAt) && remainingSeconds <= 0 && ['CREATING', 'PENDING', 'CREATED', 'CREATION_UNCERTAIN', 'CANCELLED_HELD'].includes(status);
    const holdActive = cancelledHeld && !expiredByClock;
    const expired = status === 'EXPIRED' || expiredByClock;
    const creationTimedOut = expired && !payment?.generatedAt;
    const failed = (terminalStatuses.has(status) || cancelledHeld || expiredByClock) && !paid;
    const ready = !processing && !expired && Boolean(payment?.sbpLink || payment?.qrBase64);
    const cancelled = status === 'CANCELLED' || cancelledHeld;
    const progress = Math.max(0, Math.min(100, (remainingSeconds / QR_PAYMENT_WINDOW_SECONDS) * 100));
    const creationProgress = Math.max(0, Math.min(100, (remainingSeconds / QR_CREATION_TIMEOUT_SECONDS) * 100));
    const waitLabel = creationUncertain
      ? 'Ответ задерживается — проверяем текущий запрос'
      : elapsed < 10
      ? 'Запускаем оплату'
      : elapsed < 35
        ? 'Подбираем доступный способ'
        : elapsed < 90
          ? 'Готовим платёжную ссылку'
          : 'Запрос ещё обрабатывается';
    return (
      <div className="px-4 py-5 lg:px-6 animate-fade-in">
        <div className="rounded-2xl border border-white/[0.08] bg-surfaceElevated p-5 text-center">
          <div className="mb-5 flex items-center justify-between gap-3 text-left">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-textSubtle">QR-платёж</p>
              <p className="mt-1 font-mono text-xs text-textMuted">#{access.paymentId}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/10 px-3 py-1.5 text-[11px] text-textMuted">
              <span className={`h-1.5 w-1.5 rounded-full ${paid ? 'bg-neon' : failed ? 'bg-down' : 'bg-neon animate-pulse'}`} />
              {paid ? 'Завершено' : failed ? 'Недоступно' : 'Автообновление'}
            </span>
          </div>

          {paid ? (
            <CheckCircle2 size={42} className="mx-auto text-neon" />
          ) : payment?.qrBase64 && !processing ? (
            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="relative mx-auto w-fit overflow-hidden rounded-2xl bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,.35)]">
              <img src={`data:image/png;base64,${payment.qrBase64}`} alt="QR-код для оплаты" className="h-52 w-52" />
              {!reduceMotion && <motion.span className="pointer-events-none absolute inset-x-3 h-px bg-neon shadow-[0_0_13px_rgba(20,241,149,.9)]" animate={{ top: ['10%', '90%', '10%'] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />}
            </motion.div>
          ) : ready ? (
            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-3xl border border-neon/20 bg-neon/[0.06] text-neon">
              <QrCode size={46} />
              <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border-4 border-surfaceElevated bg-neon text-black"><CheckCircle2 size={19} /></span>
            </motion.div>
          ) : failed ? (
            <WifiOff size={54} className="mx-auto text-down" />
          ) : (
            <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-3xl border border-white/[0.08] bg-black/10">
              <motion.div className="absolute h-16 w-16 rounded-2xl bg-neon/[0.08]" animate={reduceMotion ? undefined : { opacity: [0.35, 0.9, 0.35], scale: [0.94, 1.04, 0.94] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
              <QrCode size={36} className="relative text-neon" />
            </div>
          )}
          <h2 className="mt-5 text-lg font-semibold text-textPrimary">{paid ? 'Оплата подтверждена' : processing ? 'Платёж обрабатывается' : holdActive ? 'QR скрыт' : creationTimedOut ? 'QR не успел создаться' : failed ? 'QR недоступен' : ready ? 'QR готов к оплате' : creationUncertain ? 'Ответ задерживается' : 'Создаём платёж'}</h2>
          <p className="mt-1 text-sm text-textMuted">{amountValue.toLocaleString('ru-RU')} ₽</p>
          {!ready && !paid && !failed && !processing && <p className="mt-3 text-sm font-medium text-textPrimary">{waitLabel} · {elapsed} сек.</p>}
          {!ready && !paid && !failed && !processing && payment?.expiresAt && (
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/15 px-3 py-3 text-left">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs text-textMuted"><Clock3 size={14} className="text-neon" /> До пересоздания</span><strong className="font-mono text-base tracking-wider text-textPrimary">{formatRemaining(remainingSeconds)}</strong></div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-neon transition-[width] duration-1000" style={{ width: `${creationProgress}%` }} /></div>
            </div>
          )}
          {ready && !paid && !failed && !processing && payment?.expiresAt && (
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/15 px-3 py-3 text-left">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs text-textMuted"><Clock3 size={14} className="text-neon" /> Время на оплату</span><strong className="font-mono text-base tracking-wider text-textPrimary">{formatRemaining(remainingSeconds)}</strong></div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-neon transition-[width] duration-1000" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {holdActive && payment?.expiresAt && (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-3 text-left">
              <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs text-amber-200"><Clock3 size={14} /> Новый QR через</span><strong className="font-mono text-base tracking-wider text-textPrimary">{formatRemaining(remainingSeconds)}</strong></div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-amber-300 transition-[width] duration-1000" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          {pollFailures >= 3 && !paid && !failed && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-left text-xs text-amber-200">
              <WifiOff size={15} className="shrink-0" /> Связь прервалась. Платёж сохранён, проверка продолжится автоматически.
            </div>
          )}
          {!paid && !failed && !ready && !processing && <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-neon" /></div>}
          {payment?.cardLast4 && <p className="mt-3 text-xs text-textMuted">Карта получателя: •••• {payment.cardLast4}</p>}
          {payment?.sbpLink && !paid && !failed && !processing && (
            <a href={payment.sbpLink} target="_blank" rel="noopener noreferrer" className="app-button-primary mt-5 flex w-full items-center justify-center">Оплатить {amountValue.toLocaleString('ru-RU')} ₽</a>
          )}
          {!paid && !failed && !processing && !creationUncertain && <button type="button" onClick={() => void cancel()} disabled={cancelling} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-sm font-medium text-textMuted transition-colors hover:border-down/30 hover:text-down disabled:opacity-50"><XCircle size={16} />{cancelling ? 'Отменяем…' : 'Не буду оплачивать'}</button>}
          {error && <p role="alert" className="mt-3 text-xs text-down">{error}</p>}
          <p className="mt-4 text-xs leading-relaxed text-textMuted">{paid ? 'Платёж получен. Баланс обновится автоматически.' : processing ? 'Банк обрабатывает операцию. Не оплачивайте повторно.' : holdActive ? 'Ссылка скрыта. Новый QR станет доступен после окончания текущего окна.' : creationTimedOut ? 'За 10 минут ссылка не появилась. Старый запрос закрыт — можно безопасно пересоздать QR.' : expired ? '30 минут на оплату истекли. Можно создать новый QR.' : cancelled ? 'Оплата отменена. Можно создать новый QR.' : failed ? 'Попробуйте ещё раз или выберите P2P.' : creationUncertain ? 'Проверяем уже отправленный запрос. Через 10 минут станет доступно пересоздание.' : ready ? 'QR действует 30 минут. Статус обновляется автоматически.' : 'Оставьте страницу открытой — QR появится здесь автоматически.'}</p>
          {pollFailures >= 3 && !paid && !failed && <button type="button" onClick={() => { setPollFailures(0); setRefreshVersion((value) => value + 1); }} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-neon"><RefreshCw size={14} /> Проверить сейчас</button>}
          {failed && !holdActive && <button type="button" onClick={() => void restart()} disabled={submitting || cancelling} className="app-button-primary mt-5 flex w-full items-center justify-center gap-2 disabled:opacity-50"><RefreshCw size={16} className={submitting ? 'animate-spin' : ''} />{submitting ? 'Подаём новый запрос…' : creationTimedOut ? 'Пересоздать QR' : 'Попробовать ещё раз'}</button>}
          {(paid || failed) && <button type="button" onClick={() => { if (!holdActive) localStorage.removeItem(qrStorageKey(userId)); onBack(); }} className="mt-4 text-sm font-medium text-neon">Вернуться к способам</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 lg:px-6 animate-fade-in">
      <div className="rounded-2xl border border-white/[0.08] bg-surfaceElevated p-5">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-neon/10 text-neon"><QrCode size={20} /></div><div><h2 className="font-semibold text-textPrimary">Пополнение по QR</h2><p className="text-xs text-textMuted">СБП · только Россия</p></div></div>
        <div className="mt-6"><AppInput value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="Сумма в рублях" /></div>
        <p className="mt-2 text-xs text-textMuted">Лимиты активных провайдеров: {rangeLabel}</p>
        {error && <p className="mt-3 text-xs text-down">{error}</p>}
        <button type="button" onClick={create} disabled={!validAmount || submitting} className="app-button-primary mt-5 flex w-full items-center justify-center gap-2 disabled:opacity-40">{submitting && <Loader2 size={17} className="animate-spin" />}{submitting ? 'Регистрируем…' : 'Создать QR'}</button>
        <div className="mt-4 flex gap-2 text-[11px] leading-relaxed text-textMuted"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-neon" /> Сумма фиксируется при создании. Ссылка оплаты показывается только кнопкой и проверяется автоматически.</div>
      </div>
    </div>
  );
}
