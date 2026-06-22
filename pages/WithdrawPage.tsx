import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CreditCard, Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import {
  normalizeCurrencyCode,
  type TradeRealtimeChannel,
} from '../lib/shared';
import PageHeader from '../components/PageHeader';
import { useCurrency } from '../context/CurrencyContext';
import { Haptic } from '../utils/haptics';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { getSupabaseErrorMessage } from '../lib/supabaseError';
import { logAction } from '../lib/appLog';
import {
  clearPendingWithdrawSession,
  createWithdrawRequest,
  getWithdrawRequest,
  removeWithdrawChannel,
  readPendingWithdrawSession,
  savePendingWithdrawSession,
  subscribeToWithdrawRequest,
} from '../lib/services/withdrawService';
import BottomSheetFooter from '../components/BottomSheetFooter';
import FormField from '../components/FormField';

type WithdrawMethod = 'CARD' | 'CRYPTO';
type CryptoNetwork = 'trc20' | 'ton' | 'btc' | 'sol';

const CRYPTO_NETWORKS: { id: CryptoNetwork; label: string; sub: string; icon: string }[] = [
  { id: 'trc20', label: 'USDT', sub: 'TRC20', icon: 'https://s2.coinmarketcap.com/static/img/coins/200x200/1958.png' },
  { id: 'ton', label: 'TON', sub: 'Toncoin', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Gram_cryptocurrency_logo.svg/960px-Gram_cryptocurrency_logo.svg.png' },
  { id: 'btc', label: 'Bitcoin', sub: 'BTC', icon: 'https://pngicon.ru/file/uploads/ikonka-bitkoin.png' },
  { id: 'sol', label: 'Solana', sub: 'SOL', icon: 'https://cdn-icons-png.flaticon.com/512/6001/6001527.png' },
];

const POLL_INTERVAL_MS = 3_000;

interface WithdrawPageProps {
  balance: number;
  onBack: () => void;
  onWithdraw: (amount: number) => void;
}

type Step =
  | 'METHOD'
  | 'NETWORK'
  | 'AMOUNT'
  | 'REQUISITES'
  | 'CONFIRM'
  | 'WAITING'
  | 'SUCCESS_APPROVED'
  | 'SUCCESS_PASTE';

const WithdrawPage: React.FC<WithdrawPageProps> = ({ balance, onBack, onWithdraw }) => {
  const { formatPrice, symbol, convertToUsd, convertFromUsd, currencyCode } = useCurrency();
  const { user, withdrawTemplates, supportLink, minWithdraw, refreshUser } = useUser();
  const toast = useToast();
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>('METHOD');
  const [method, setMethod] = useState<WithdrawMethod>('CARD');
  const [cryptoNetwork, setCryptoNetwork] = useState<CryptoNetwork>('trc20');
  const [amount, setAmount] = useState('');
  const [requisites, setRequisites] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Active request tracking
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null);
  const [activeAmountUsd, setActiveAmountUsd] = useState<number>(0);
  const [activeTemplateType, setActiveTemplateType] = useState<string | null>(null);
  const [activeExpiresAt, setActiveExpiresAt] = useState<string | null>(null);
  const [waitingSecondsLeft, setWaitingSecondsLeft] = useState<number>(60);
  const [waitingLate, setWaitingLate] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeChannelRef = useRef<TradeRealtimeChannel | null>(null);

  const template =
    withdrawTemplates.find((t) => t.message_type === (activeTemplateType || user?.withdraw_message_type || 'default')) ||
    withdrawTemplates[0];

  const amountNumDisplay = parseFloat(amount.replace(',', '.')) || 0;
  const amountNumUsd = convertToUsd(amountNumDisplay);
  const requisitesNormalized = requisites.replace(/\s/g, '');
  const formattedMin = formatPrice(minWithdraw);
  const formattedAmount =
    amountNumDisplay > 0
      ? new Intl.NumberFormat('ru-RU', {
          style: 'decimal',
          minimumFractionDigits: amountNumDisplay < 1 ? 6 : amountNumDisplay < 100 ? 2 : 0,
          maximumFractionDigits: amountNumDisplay < 1 ? 6 : amountNumDisplay < 100 ? 2 : 0,
        }).format(amountNumDisplay)
      : '0';

  const currentNetwork = CRYPTO_NETWORKS.find((n) => n.id === cryptoNetwork);

  const waitingCountdownLabel =
    waitingSecondsLeft > 0
      ? `${waitingSecondsLeft} сек.`
      : 'Ожидаем итоговое решение...';

  const maskRequisites = (s: string, isCrypto = false) => {
    const n = s.replace(/\s/g, '');
    if (!n) return '—';
    if (isCrypto) {
      if (n.length <= 12) return n;
      return n.slice(0, 8) + '…' + n.slice(-8);
    }
    if (n.length <= 4) return n;
    return '•••• ' + n.slice(-4);
  };

  // -------------------------------------------------------
  // Resolve a completed request status → update UI
  // -------------------------------------------------------
  const resolveStatus = useCallback(
    (status: string, resolvedTemplateType?: string) => {
      stopPolling();
      if (resolvedTemplateType) {
        setActiveTemplateType(resolvedTemplateType);
      }
      if (status === 'approved') {
        setActiveRequestId(null);
        setActiveExpiresAt(null);
        setWaitingLate(false);
        refreshUser().catch(() => {});
        onWithdraw(activeAmountUsd);
        Haptic.success();
        setStep('SUCCESS_APPROVED');
        clearPendingWithdrawSession();
      } else if (status === 'paste' || status === 'auto_paste') {
        setActiveRequestId(null);
        setActiveExpiresAt(null);
        setWaitingLate(false);
        Haptic.light();
        setStep('SUCCESS_PASTE');
        clearPendingWithdrawSession();
      }
    },
    [activeAmountUsd]
  );

  // -------------------------------------------------------
  // Stop all timers and subscriptions
  // -------------------------------------------------------
  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (realtimeChannelRef.current) {
      const ch = realtimeChannelRef.current;
      removeWithdrawChannel(ch);
      realtimeChannelRef.current = null;
    }
  }

  // -------------------------------------------------------
  // Poll server for request status
  // -------------------------------------------------------
  const pollStatus = useCallback(
    async (requestId: number): Promise<string | null> => {
      try {
        const data = await getWithdrawRequest(requestId);
        if (!data) return null;
        const status = data.status ?? '';
        const template_type = data.request_message_type;
        if (['approved', 'paste', 'auto_paste'].includes(status)) {
          resolveStatus(status, template_type);
        }
        return status;
      } catch {
        return null;
      }
    },
    [resolveStatus]
  );

  // -------------------------------------------------------
  // Start polling + realtime + client timeout
  // -------------------------------------------------------
  const startWaiting = useCallback(
    (requestId: number, amountUsd: number, expiresAt?: string | null) => {
      setActiveRequestId(requestId);
      setActiveAmountUsd(amountUsd);
      setActiveExpiresAt(expiresAt ?? null);
      setWaitingLate(false);
      setWaitingSecondsLeft(
        expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 60,
      );
      setStep('WAITING');
      stopPolling();

      // Supabase Realtime subscription
      const channel = subscribeToWithdrawRequest(
        requestId,
        (next: Record<string, unknown>) => {
          const newStatus = String(next.status ?? '');
          const templateType = String(next.request_message_type ?? '');
          const nextExpiresAt = String(next.expires_at ?? expiresAt ?? '');
          if (nextExpiresAt) {
            setActiveExpiresAt(nextExpiresAt);
            setWaitingSecondsLeft(Math.max(0, Math.ceil((new Date(nextExpiresAt).getTime() - Date.now()) / 1000)));
          }
          if (['approved', 'paste', 'auto_paste'].includes(newStatus)) {
            resolveStatus(newStatus, templateType);
          }
        },
      );
      realtimeChannelRef.current = channel;

      // Polling fallback every 3s
      pollIntervalRef.current = setInterval(() => {
        pollStatus(requestId);
      }, POLL_INTERVAL_MS);
    },
    [resolveStatus, pollStatus]
  );

  // -------------------------------------------------------
  // Restore WAITING state after page reload
  // -------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    const stored = readPendingWithdrawSession();
    if (!stored || stored.userId !== user.user_id) return;

    // Check if still pending
    const checkStatus = async () => {
      try {
        const data = await getWithdrawRequest(stored.requestId);
        if (!data) throw new Error('withdraw request not found');
        const status = data.status ?? '';
        const template_type = data.request_message_type;
        if (status === 'pending' || status === 'processing') {
          setActiveAmountUsd(stored.amountUsd);
          startWaiting(stored.requestId, stored.amountUsd, data.expires_at ?? stored.expiresAt);
        } else if (['approved', 'paste', 'auto_paste'].includes(status)) {
          resolveStatus(status, template_type);
          clearPendingWithdrawSession();
        }
      } catch {
        clearPendingWithdrawSession();
      }
    };
    checkStatus();
  // only on mount
  }, [user?.user_id]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (step !== 'WAITING' || !activeExpiresAt) return;
    const tick = () => {
      setWaitingSecondsLeft(Math.max(0, Math.ceil((new Date(activeExpiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [step, activeExpiresAt]);

  useEffect(() => {
    if (step !== 'WAITING' || !activeRequestId || !activeExpiresAt) return;
    const delayMs = Math.max(0, new Date(activeExpiresAt).getTime() - Date.now()) + 15_000;
    const timer = window.setTimeout(() => {
      void pollStatus(activeRequestId).then((status) => {
        if (!status || status === 'pending' || status === 'processing') {
          setWaitingLate(true);
        }
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [step, activeRequestId, activeExpiresAt, pollStatus]);

  const handleManualStatusCheck = useCallback(async () => {
    if (!activeRequestId) return;
    setWaitingLate(false);
    const status = await pollStatus(activeRequestId);
    if (!status || status === 'pending' || status === 'processing') {
      setWaitingLate(true);
    }
  }, [activeRequestId, pollStatus]);

  const mapWithdrawError = useCallback((err: unknown) => {
    const message = getSupabaseErrorMessage(err, t('withdraw_error')).toUpperCase();
    if (message.includes('TRADING_BLOCKED')) return t('trading_blocked_toast');
    if (message.includes('INSUFFICIENT_BALANCE')) return t('insufficient_balance');
    if (message.includes('REQUISITES_REQUIRED')) {
      return method === 'CRYPTO' ? t('withdraw_enter_address_toast') : t('withdraw_enter_requisites_toast');
    }
    if (message.includes('INVALID_AMOUNT')) return t('withdraw_error');
    if (message.includes('FORBIDDEN')) return t('withdraw_error');
    return getSupabaseErrorMessage(err, t('withdraw_error'));
  }, [method, t]);

  // -------------------------------------------------------
  // Submit withdraw form
  // -------------------------------------------------------
  const handleConfirmWithdraw = async () => {
    const userId = user?.user_id;
    if (!userId || !user) {
      Haptic.error();
      toast.show(t('withdraw_error'), 'error');
      return;
    }
    if (amountNumUsd <= 0 || amountNumUsd > balance) {
      Haptic.error();
      toast.show(t('insufficient_balance'), 'error');
      return;
    }
    if (!requisitesNormalized) {
      Haptic.error();
      toast.show(t('withdraw_error'), 'error');
      return;
    }
    if (user.trading_blocked) {
      const reason = 'trading_blocked';
      void logAction('withdraw_blocked', {
        userId: user.user_id,
        payload: {
          reason,
          source: 'withdraw_page',
          email: user.email ?? null,
          client_name: user.full_name ?? user.username ?? null,
        },
      });
      Haptic.error();
      toast.show(t('trading_blocked_toast'), 'error');
      return;
    }
    Haptic.light();
    setSubmitting(true);

    try {
      const countryCode = user.country_code ?? null;
      const requestCurrency = normalizeCurrencyCode(currencyCode);

      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      const wrRow = await createWithdrawRequest({
        userId: user.user_id,
        workerId: user.referrer_id ?? null,
        amountUsd: amountNumUsd,
        amountLocal: amountNumDisplay,
        currency: requestCurrency,
        method,
        network: method === 'CRYPTO' ? cryptoNetwork : null,
        requisites: requisitesNormalized,
        requestMessageType: user.withdraw_message_type ?? 'default',
        payload: { country: countryCode ?? null },
        expiresAt,
      });

      const requestId: number = wrRow.id;
      savePendingWithdrawSession({
        requestId,
        userId: user.user_id,
        amountLocal: amountNumDisplay,
        amountUsd: amountNumUsd,
        currency: requestCurrency,
        method,
        network: method === 'CRYPTO' ? cryptoNetwork : null,
        requisites: requisitesNormalized,
        expiresAt,
      });

      logAction('withdraw_request', {
        userId: user.user_id,
        payload: {
          amount_display: amountNumDisplay,
          amount_usd: amountNumUsd,
          currency: requestCurrency,
          method,
          request_id: requestId,
        },
      }).catch(() => {});

      startWaiting(requestId, amountNumUsd, wrRow.expires_at ?? expiresAt);
    } catch (err) {
      Haptic.error();
      toast.show(mapWithdrawError(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------
  // Navigation
  // -------------------------------------------------------
  const handleBack = () => {
    Haptic.tap();
    if (step === 'METHOD') { onBack(); return; }
    if (step === 'AMOUNT') { setStep('METHOD'); return; }
    if (step === 'NETWORK') { setStep('METHOD'); return; }
    if (step === 'REQUISITES') { setStep('AMOUNT'); return; }
    if (step === 'CONFIRM') { setStep('REQUISITES'); return; }
    onBack();
  };

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------
  const renderStepContent = () => {
    switch (step) {
      case 'METHOD':
        return (
          <div className="px-4 pt-4 space-y-3">
            <p className="text-xs text-textSubtle mb-2">{t('withdraw_method_select')}</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  Haptic.light();
                  setMethod('CARD');
                  setStep('AMOUNT');
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card transition-all active:scale-[0.98] hover-row"
              >
                <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center">
                  <CreditCard className="text-neon" size={22} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-textPrimary">{t('withdraw_to_card')}</div>
                  <div className="text-[11px] text-textSubtle">{t('withdraw_to_card_desc')}</div>
                </div>
              </button>

              <button
                onClick={() => {
                  Haptic.light();
                  setMethod('CRYPTO');
                  setStep('NETWORK');
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card transition-all active:scale-[0.98] hover-row"
              >
                <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center">
                  <Wallet className="text-neon" size={22} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-textPrimary">{t('withdraw_to_crypto')}</div>
                  <div className="text-[11px] text-textSubtle">{t('withdraw_to_crypto_desc')}</div>
                </div>
              </button>
            </div>
          </div>
        );

      case 'NETWORK':
        return (
          <div className="max-w-md mx-auto pt-6 px-4 pb-8">
            <p className="text-textMuted text-sm mb-4">{t('withdraw_crypto_title')}</p>
            <div className="grid grid-cols-2 gap-4">
              {CRYPTO_NETWORKS.map((net) => (
                <button
                  key={net.id}
                  type="button"
                  onClick={() => {
                    Haptic.light();
                    setCryptoNetwork(net.id);
                    setStep('AMOUNT');
                  }}
                  className="flex flex-col items-center py-6 px-4 rounded-2xl bg-card active:scale-[0.98] transition-all"
                >
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-surface flex items-center justify-center mb-3">
                    <img src={net.icon} alt="" className="w-12 h-12 object-contain" />
                  </div>
                  <span className="font-semibold text-textPrimary text-sm">{net.label}</span>
                  <span className="text-xs text-textMuted mt-0.5">{net.sub}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case 'AMOUNT':
        return (
          <div className="space-y-6 pt-6 px-4">
            <div className="hairline-bottom pb-4 mb-6">
              <FormField
                id="withdraw-amount"
                label={t('amount_withdraw')}
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
                rightSlot={<span className="text-lg font-mono text-textSubtle">$</span>}
                containerClassName="space-y-0"
                inputClassName="h-16 border-0 bg-transparent px-0 text-2xl font-mono font-bold shadow-none placeholder:text-textMuted focus:border-transparent focus:ring-0"
              />
              <div className="flex justify-between items-center mt-1">
                <div className="text-[10px] text-textSubtle">
                  {t('available')}: <span className="text-textPrimary">{formatPrice(balance)} $</span>
                </div>
                <button
                  onClick={() => {
                    Haptic.tap();
                    setAmount(String(convertFromUsd(balance)));
                  }}
                  className="text-[10px] text-neon font-bold uppercase tracking-wider"
                >
                  {t('max')}
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                if (!amount || isNaN(amountNumDisplay) || amountNumUsd < minWithdraw) {
                  Haptic.error();
                  toast.show(`${t('min_withdraw_toast', { amount: formattedMin })} ${symbol}`, 'error');
                  return;
                }
                if (amountNumUsd > balance) {
                  Haptic.error();
                  toast.show(t('insufficient_balance'), 'error');
                  return;
                }
                Haptic.light();
                setStep('REQUISITES');
              }}
              disabled={!amount || amountNumUsd < minWithdraw || amountNumUsd > balance}
              className="w-full py-4 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
            >
              {t('withdraw_further')}
            </button>
          </div>
        );

      case 'REQUISITES':
        return (
          <div className="space-y-6 pt-6 px-4">
            <div className="hairline-bottom pb-4">
              <span className="text-xs text-textMuted uppercase">{t('withdraw_amount_label')}</span>
              <div className="text-xl font-mono font-bold text-textPrimary">{formattedAmount} {symbol}</div>
              {method === 'CRYPTO' && currentNetwork && (
                <div className="text-xs text-textSecondary mt-1">{t('network_label')}: {currentNetwork.label} ({currentNetwork.sub})</div>
              )}
            </div>
            <FormField
              id="withdraw-requisites"
              label={method === 'CRYPTO' ? t('withdraw_address_for_receive') : t('withdraw_requisites_for_receive')}
              type="text"
              inputMode={method === 'CRYPTO' ? 'text' : 'numeric'}
              value={requisites}
              onChange={(e) => {
                const nextValue = method === 'CRYPTO' ? e.target.value.trim() : e.target.value.replace(/\D/g, '').slice(0, 24);
                setRequisites(nextValue);
              }}
              placeholder={method === 'CRYPTO'
                ? (currentNetwork ? `${t('withdraw_crypto_address')} ${currentNetwork.label} (${currentNetwork.sub})` : t('withdraw_crypto_address'))
                : t('withdraw_requisites_hint')}
              containerClassName="space-y-2"
              inputClassName="font-mono text-sm sm:text-base break-all bg-card border border-border rounded-xl"
              helper={method === 'CRYPTO' ? t('withdraw_address_hint') : t('withdraw_requisites_hint_long')}
            />
            <button
              onClick={() => {
                if (!requisites.trim()) {
                  Haptic.error();
                  toast.show(method === 'CRYPTO' ? t('withdraw_enter_address_toast') : t('withdraw_enter_requisites_toast'), 'error');
                  return;
                }
                Haptic.light();
                setStep('CONFIRM');
              }}
              disabled={!requisites.trim()}
              className="w-full py-4 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none"
            >
              {t('withdraw_further')}
            </button>
          </div>
        );

      case 'CONFIRM':
        return (
          <div className="pt-6 px-4 flex flex-col">
            <div className="bg-card rounded-xl p-5 space-y-4 mb-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-neon" />
              <div>
                <div className="text-xs text-textMuted uppercase tracking-wider mb-1">{t('withdraw_amount_label')}</div>
                <div className="text-2xl font-mono font-bold text-textPrimary">{formattedAmount} {symbol}</div>
              </div>
              <div className="h-px bg-border w-full" />
              {method === 'CRYPTO' && currentNetwork && (
                <div>
                  <div className="text-xs text-textMuted uppercase tracking-wider mb-1">{t('network_label')}</div>
                  <div className="text-sm font-medium text-textPrimary">{currentNetwork.label} ({currentNetwork.sub})</div>
                </div>
              )}
              <div>
                <div className="text-xs text-textMuted uppercase tracking-wider mb-1">
                  {method === 'CRYPTO' ? t('withdraw_crypto_address') : t('withdraw_requisites_label')}
                </div>
                <div className="text-sm font-mono text-textPrimary bg-surface rounded-lg p-3 break-all">
                  {requisitesNormalized ? maskRequisites(requisitesNormalized, method === 'CRYPTO') : '—'}
                </div>
              </div>
            </div>
            <BottomSheetFooter
              onCancel={() => {
                Haptic.tap();
                setStep('REQUISITES');
              }}
              onConfirm={() => {
                if (submitting) return;
                handleConfirmWithdraw();
              }}
              confirmLabel={t('withdraw_confirm_btn')}
              confirmLoading={submitting}
              sticky
              reserveBottomNav
            />
          </div>
        );

      case 'WAITING':
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-50 animate-fade-in p-6">
            <div className="relative flex items-center justify-center h-24 w-24 rounded-full bg-card mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-neon/40 border-t-transparent animate-spin" />
              <Loader2 size={40} className="text-neon animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-textPrimary mb-2">
              {waitingLate ? 'Решение задерживается' : t('withdraw_processing')}
            </h2>
            <p className="text-textMuted text-sm text-center max-w-xs">
              {waitingLate
                ? 'Заявка еще не закрыта в системе. Проверьте статус еще раз или откройте поддержку.'
                : `Окно решения: ${waitingCountdownLabel}`}
            </p>
            {waitingLate && (
              <div className="mt-6 w-full max-w-xs space-y-3">
                <button
                  onClick={() => { Haptic.tap(); void handleManualStatusCheck(); }}
                  className="w-full py-3 bg-neon text-black font-bold rounded-xl active:scale-95 transition-transform"
                >
                  Проверить статус
                </button>
                <a
                  href={supportLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 text-center rounded-xl border border-border text-textPrimary active:scale-95 transition-transform"
                  onClick={() => Haptic.tap()}
                >
                  Открыть поддержку
                </a>
              </div>
            )}
          </div>
        );

      case 'SUCCESS_APPROVED':
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-50 animate-fade-in p-6 text-center">
            <div className="relative flex items-center justify-center h-28 w-28 rounded-full bg-green-500/10 mb-6">
              <div className="absolute inset-0 rounded-full border-2 border-green-500/50 animate-pulse" />
              <CheckCircle2 size={56} className="text-up" />
            </div>
            <h2 className="text-2xl font-bold text-textPrimary mb-2">{t('withdraw_approved')}</h2>
            <p className="text-textSecondary mb-2">
              <span className="font-mono text-textPrimary">{formattedAmount} {symbol}</span> {t('withdrawn_from_balance')}.
            </p>
            <p className="text-textMuted text-sm mb-8 max-w-xs">
              {t('withdraw_funds_note')}
            </p>
            <button
              onClick={() => { Haptic.tap(); onBack(); }}
              className="px-8 py-3 rounded-full bg-neon text-black font-bold active:scale-95"
            >
              {t('withdraw_to_profile')}
            </button>
          </div>
        );

      case 'SUCCESS_PASTE':
        return (
          <div className="absolute inset-0 flex flex-col bg-background z-50 animate-in fade-in zoom-in-95 duration-500 overflow-y-auto">
            {/* Ambient Background */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
              <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[50%] bg-gradient-to-b from-surfaceElevated to-transparent opacity-50 blur-3xl" />
            </div>

            <div className="relative z-10 flex-1 flex flex-col px-4 pt-12 pb-safe-bottom">
              
              <div className="flex flex-col items-center text-center mb-8">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-neon/20 blur-xl rounded-full" />
                  <div className="relative h-20 w-20 rounded-full bg-gradient-to-b from-surface to-surfaceElevated border border-border/50 flex items-center justify-center text-4xl shadow-2xl">
                    {template?.icon || '⚠️'}
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight mb-3">
                  {template?.title || t('withdraw_request_title')}
                </h2>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/80 border border-border/50">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[13px] font-mono font-medium text-textSecondary">
                    {formattedAmount} {symbol}
                  </span>
                </div>
              </div>

              <div className="relative w-full rounded-2xl bg-surface/40 backdrop-blur-md border border-border/50 p-6 mb-8 overflow-hidden group">
                {/* Subtle highlight line */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <p className="text-[15px] text-textSecondary leading-relaxed whitespace-pre-wrap">
                  {template?.description || t('withdraw_contact_support_desc')}
                </p>
              </div>

              <div className="mt-auto space-y-3 pb-6">
                <a
                  href={supportLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full h-14 bg-neon text-black font-bold text-[15px] rounded-xl active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(20,241,149,0.2)]"
                  onClick={() => Haptic.tap()}
                >
                  {template?.button_text || t('write_to_support')}
                </a>
                <button
                  onClick={() => { Haptic.tap(); onBack(); }}
                  className="w-full h-14 bg-transparent text-textMuted font-medium text-[15px] rounded-xl hover:text-white transition-colors"
                >
                  {t('withdraw_to_profile')}
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const showHeader =
    step !== 'WAITING' &&
    step !== 'SUCCESS_APPROVED' &&
    step !== 'SUCCESS_PASTE';

  return (
    <div className="flex flex-col h-full bg-background animate-fade-in relative">
      {showHeader && <PageHeader title={t('withdraw_title')} onBack={handleBack} />}
      <div className="flex-1 overflow-y-auto no-scrollbar relative">
        {renderStepContent()}
      </div>
    </div>
  );
};

export default WithdrawPage;
