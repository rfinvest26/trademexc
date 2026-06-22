import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  removeSupportChannel,
  createSupportMessage,
  ensureSupportThread,
  listSupportMessages,
  subscribeToSupportMessages,
  touchSupportThread,
  uploadSupportAttachment,
  type SupportMessageRecord,
} from '../lib/services/supportService';
import {
  Send,
  Loader2,
  Headphones,
  Inbox,
  ChevronDown,
  ImagePlus,
  X,
  Wallet,
  ArrowDownToLine,
  LogIn,
  ShieldCheck,
  RefreshCw,
  MoreHorizontal,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useUser } from '../context/UserContext';
import { logAction } from '../lib/appLog';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { Haptic } from '../utils/haptics';

interface SupportPageProps {
  onBack: () => void;
}

type SupportMessage = SupportMessageRecord;

const MAX_SUPPORT_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_SUPPORT_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime', // mov
] as const;

function mergeMessagesById(prev: SupportMessage[], incoming: SupportMessage[]): SupportMessage[] {
  if (!incoming.length) return prev;
  const map = new Map<string, SupportMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function isPdfUrl(url: string): boolean {
  const u = (url || '').toLowerCase();
  return u.endsWith('.pdf') || u.includes('.pdf?');
}
function isVideoUrl(url: string): boolean {
  const u = (url || '').toLowerCase();
  return (
    u.endsWith('.mp4') ||
    u.includes('.mp4?') ||
    u.endsWith('.mov') ||
    u.includes('.mov?') ||
    u.endsWith('.webm') ||
    u.includes('.webm?')
  );
}

function niceFileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last).slice(0, 48) || 'attachment';
  } catch {
    return 'attachment';
  }
}

function validateSupportAttachment(file: File): string | null {
  if (!file.type) return 'support_val_image_mime';
  if (!ALLOWED_SUPPORT_FILE_TYPES.includes(file.type as (typeof ALLOWED_SUPPORT_FILE_TYPES)[number])) {
    return 'support_val_image_type';
  }
  if (file.size > MAX_SUPPORT_FILE_BYTES) return 'support_val_image_size';
  return null;
}

function insertMessageSorted(prev: SupportMessage[], next: SupportMessage): SupportMessage[] {
  if (prev.find((message) => message.id === next.id)) {
    return prev;
  }
  const nextTime = new Date(next.created_at).getTime();
  const index = prev.findIndex((message) => new Date(message.created_at).getTime() > nextTime);
  if (index === -1) {
    return [...prev, next];
  }
  return [...prev.slice(0, index), next, ...prev.slice(index)];
}

const AttachmentCard: React.FC<{ url: string }> = ({ url }) => {
  const name = niceFileNameFromUrl(url);
  if (isVideoUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block rounded-xl overflow-hidden border border-border bg-card"
      >
        <video src={url} controls playsInline className="w-full max-h-64 object-contain bg-surface" />
        <div className="px-3 py-2 hairline-top text-[11px] font-mono text-textMuted truncate">{name}</div>
      </a>
    );
  }
  if (isPdfUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-3 py-2.5 hover:border-border/60 transition-colors"
      >
        <div className="h-10 w-10 rounded-xl bg-card/60 border border-border flex items-center justify-center text-textMuted font-bold text-xs">
          PDF
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-textPrimary font-semibold truncate">{name}</div>
          <div className="text-[10px] text-textMuted mt-0.5">Открыть документ</div>
        </div>
      </a>
    );
  }
  // default: image
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-xl overflow-hidden border border-border bg-card"
    >
      <img src={url} alt="" className="max-h-64 w-full object-contain" loading="lazy" />
    </a>
  );
};

const QUICK_TOPICS: { id: string; labelKey: string; Icon: LucideIcon }[] = [
  { id: 'deposit', labelKey: 'support_topic_deposit', Icon: Wallet },
  { id: 'withdraw', labelKey: 'support_topic_withdraw', Icon: ArrowDownToLine },
  { id: 'login', labelKey: 'support_topic_login', Icon: LogIn },
  { id: 'kyc', labelKey: 'support_topic_kyc', Icon: ShieldCheck },
  { id: 'p2p', labelKey: 'support_topic_p2p', Icon: RefreshCw },
  { id: 'other', labelKey: 'support_topic_other', Icon: MoreHorizontal },
];

const SupportPage: React.FC<SupportPageProps> = ({ onBack }) => {
  const { user } = useUser();
  const { t } = useLanguage();
  const toast = useToast();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [showQuickHelp, setShowQuickHelp] = useState(true);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [threadUnavailable, setThreadUnavailable] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof subscribeToSupportMessages> | null>(null);

  const userDisplayName =
    user?.full_name || user?.username || user?.email || t('guest');

  const subscribeToThread = (tid: string) => {
    try {
      if (channelRef.current) removeSupportChannel(channelRef.current);
    } catch {}
    channelRef.current = subscribeToSupportMessages(
      tid,
      (row) => {
        setMessages((prev) => insertMessageSorted(prev, row));
      },
      (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeOk(false);
          window.setTimeout(() => {
            subscribeToThread(tid);
          }, 1200);
        } else if (status === 'SUBSCRIBED') {
          setRealtimeOk(true);
        }
      },
    );
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length]);

  useEffect(() => {
    if (!pendingImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setThreadUnavailable(false);
      try {
        if (user) {
          await initLoggedInUser();
        } else {
          setLoading(false);
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    const initLoggedInUser = async () => {
      if (!user) return;
      const currentThreadId = await ensureSupportThread({
        userId: user.user_id,
        email: user.email ?? null,
        displayName: userDisplayName,
        referrerId: user.referrer_id ?? null,
        source: 'web',
      });
      if (!currentThreadId) {
        setThreadUnavailable(true);
        return;
      }

      setThreadId(currentThreadId);
      await loadMessages(currentThreadId);
      subscribeToThread(currentThreadId);
    };

    const loadMessages = async (tid: string) => {
      const msgs = await listSupportMessages(tid);
      if (msgs.length) {
        setMessages((prev) => mergeMessagesById(prev, msgs));
      }
    };

    init();

    return () => {
      if (channelRef.current) removeSupportChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [user?.user_id, user?.email, userDisplayName]);

  useEffect(() => {
    if (!threadId) return;
    // Если realtime не работает — ускоряем поллинг, чтобы чат оставался живым.
    const load = () =>
      listSupportMessages(threadId).then((data) => {
        if (data.length) setMessages((prev) => mergeMessagesById(prev, data));
      });
    const interval = window.setInterval(load, realtimeOk ? 20000 : 3000);
    return () => window.clearInterval(interval);
  }, [threadId, realtimeOk]);

  const retryThread = async () => {
    if (!user) return;
    setLoading(true);
    setThreadUnavailable(false);
    const currentThreadId = await ensureSupportThread({
      userId: user.user_id,
      email: user.email ?? null,
      displayName: userDisplayName,
      referrerId: user.referrer_id ?? null,
      source: 'web',
    });
    if (!currentThreadId) {
      setThreadUnavailable(true);
      setLoading(false);
      return;
    }
    setThreadId(currentThreadId);
    const msgs = await listSupportMessages(currentThreadId);
    setMessages(msgs);
    subscribeToThread(currentThreadId);
    setLoading(false);
  };

  useEffect(() => {
    // На мобильных при открытии клавиатуры браузер может "прыгать".
    // Делаем мягкий скролл к низу после фокуса, когда visualViewport уже пересчитался.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName.toLowerCase() !== 'textarea') return;
      window.setTimeout(() => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
      }, 120);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const handleSend = async (text?: string) => {
    if (sending || !threadId || !user) return;

    if (pendingImage) {
      const caption = (text ?? input).trim() || t('support_chat_screenshot_default');
      await sendAsUserImage(pendingImage, caption);
      return;
    }

    const content = (text ?? input).trim();
    if (!content) return;

    await sendAsUser(content);
  };

  const sendAsUser = async (content: string) => {
    if (!threadId || !user) return;
    setSending(true);
    Haptic.tap();
      try {
        const data = await createSupportMessage({
          threadId,
          userId: user.user_id,
          author: 'user',
          text: content,
          source: 'web',
        });

      if (!data) {
        toast.show(t('support_toast_send_failed'), 'error');
        return;
      }

      setMessages((prev) => mergeMessagesById(prev, [data as SupportMessage]));
      setInput('');

      await touchSupportThread(threadId, content);

      logAction('support_message_sent', {
        userId: user.user_id,
        payload: {
          thread_id: threadId,
          source: 'web',
          message_length: content.length,
        },
      }).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  const sendAsUserImage = async (file: File, caption: string) => {
    if (!threadId || !user) return;
    setSending(true);
    Haptic.tap();
    try {
      const imageUrl = await uploadSupportAttachment(threadId, file).catch(() => {
        return null;
      });
      const data = await createSupportMessage({
        threadId,
        userId: user.user_id,
        author: 'user',
        text: caption,
        source: 'web',
        imageUrl,
      });

      if (!data) {
        toast.show(
          imageUrl ? t('support_toast_save_failed') : t('support_toast_upload_failed'),
          'error',
        );
        return;
      }

      setMessages((prev) => mergeMessagesById(prev, [data as SupportMessage]));
      setInput('');
      setPendingImage(null);

      await touchSupportThread(threadId, caption);

      logAction('support_attachment_sent', {
        userId: user.user_id,
        payload: {
          thread_id: threadId,
          source: 'web',
          message_length: caption.length,
          file_name: file.name,
          file_type: file.type || null,
          file_size: file.size,
          image_url: imageUrl,
        },
      }).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  const handleQuick = (labelKey: string) => {
    const text = t(labelKey);
    setInput(text);
    setShowQuickHelp(false);
    inputRef.current?.focus();
    handleSend(text);
  };

  if (!user) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-background animate-fade-in max-w-2xl lg:max-w-4xl mx-auto">
        <PageHeader title={t('support_chat_title')} onBack={onBack} />
        <div className="flex-1 flex flex-col px-4 py-6 overflow-y-auto">
          <div className="rounded-xl bg-card overflow-hidden border border-border">
            <div className="px-4 py-3 bg-surface/60 hairline-bottom">
              <p className="text-xs font-semibold text-textSecondary tracking-tight">
                {t('support_chat_title')}
              </p>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center text-neon shrink-0">
                  <Headphones size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-textPrimary">Поддержка доступна после входа</h3>
                  <p className="text-xs text-textMuted mt-0.5 leading-snug">
                    Войдите в аккаунт, чтобы открыть личный чат и привязать обращения к вашему профилю.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="w-full touch-target min-h-[52px] py-3.5 rounded-2xl bg-neon text-black font-semibold text-base active:scale-[0.99] transition-transform hover:opacity-95"
              >
                Назад
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background animate-fade-in max-w-md mx-auto">
      <PageHeader title={t('support_chat_title')} onBack={onBack} />

      <div className="flex-1 flex flex-col min-h-0">
        <header className="shrink-0 px-4 py-2.5 hairline-bottom bg-background">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-neon shrink-0 border border-border">
              <Headphones size={15} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-bold text-textPrimary tracking-tight leading-tight">
                {t('support_chat_team')}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5 select-none pointer-events-none">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-semibold text-emerald-400 tracking-wider uppercase">Active Online</span>
              </div>
            </div>
          </div>
        </header>

        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 py-3 space-y-2 bg-background"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {loading && (
            <div className="flex justify-center items-center gap-2 py-10 text-textMuted">
              <Loader2 size={18} className="animate-spin shrink-0" />
              <span className="text-sm">{t('support_chat_connecting')}</span>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-2">
              <div className="h-14 w-14 rounded-xl bg-card border border-border flex items-center justify-center mb-3">
                <Inbox size={26} className="text-textMuted" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-medium text-textPrimary">
                {threadUnavailable ? 'Чат временно недоступен' : t('support_chat_empty')}
              </p>
              <p className="text-xs text-textMuted mt-1.5 max-w-xs leading-relaxed">
                {threadUnavailable
                  ? 'Не удалось подключить обращение. Попробуйте еще раз.'
                  : t('support_chat_empty_hint')}
              </p>
              {threadUnavailable && (
                <button
                  type="button"
                  onClick={() => { Haptic.tap(); void retryThread(); }}
                  className="mt-4 rounded-xl bg-neon px-4 py-2 text-sm font-semibold text-black active:scale-[0.98] transition-transform"
                >
                  Повторить
                </button>
              )}
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.author === 'user';
            const timeStr = new Date(m.created_at).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div key={m.id} className={`flex w-full mb-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 pt-2.5 pb-5 text-[13px] leading-relaxed relative ${
                    isUser
                      ? 'bg-neon text-black rounded-2xl rounded-tr-none shadow-sm border-none font-medium'
                      : 'bg-card text-textPrimary rounded-2xl rounded-tl-none border border-border shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.image_url ? <AttachmentCard url={m.image_url} /> : null}
                  
                  {/* Inline bottom-right meta badge */}
                  <div className="absolute bottom-1 right-2.5 flex items-center gap-0.5 select-none pointer-events-none">
                    <span className={`text-[8.5px] font-mono font-medium ${isUser ? 'text-black/60' : 'text-textMuted'}`}>
                      {timeStr}
                    </span>
                    {isUser && (
                      <span className="text-[10px] text-black/60 font-semibold leading-none -mt-0.5" aria-hidden>
                        ✓✓
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 px-4 pt-2 pb-2 pb-safe hairline-top bg-background space-y-2">
          {showQuickHelp && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-textSecondary tracking-tight">
                {t('support_chat_quick_topics')}
              </span>
              <button
                type="button"
                onClick={() => setShowQuickHelp(false)}
                className="text-[10px] text-textMuted hover:text-textSecondary flex items-center gap-0.5"
              >
                {t('support_chat_hide_topics')}
                <ChevronDown size={12} className="rotate-180" />
              </button>
            </div>
          )}
          {showQuickHelp && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1">
              {QUICK_TOPICS.map(({ id, labelKey, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleQuick(labelKey)}
                  className="touch-target flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-left hover:border-border/60 active:scale-[0.99] transition-all flex-shrink-0 min-h-[44px]"
                >
                  <Icon size={16} className="text-neon shrink-0" strokeWidth={2} />
                  <span className="text-xs font-medium text-textSecondary whitespace-nowrap max-w-[200px] truncate">
                    {t(labelKey)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!showQuickHelp && (
            <button
              type="button"
              onClick={() => setShowQuickHelp(true)}
              className="text-[10px] text-textMuted hover:text-textSecondary flex items-center gap-1"
            >
              <ChevronDown size={12} />
              {t('support_chat_show_topics')}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const errKey = validateSupportAttachment(file);
              if (errKey) {
                toast.show(t(errKey), 'error');
                return;
              }
              Haptic.tap();
              setPendingImage(file);
            }}
          />

          {pendingImage && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2">
              {pendingImage.type.startsWith('image/') && previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover shrink-0 border border-border"
                />
              ) : pendingImage.type.startsWith('video/') && previewUrl ? (
                <video
                  src={previewUrl}
                  className="h-12 w-12 rounded-lg object-cover shrink-0 border border-border"
                  muted
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-card/60 border border-border flex items-center justify-center shrink-0 text-textMuted text-xs font-bold">
                  {pendingImage.type === 'application/pdf' ? 'PDF' : 'FILE'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-textSecondary truncate font-mono">{pendingImage.name}</p>
                <p className="text-[10px] text-textMuted mt-0.5 leading-snug">{t('support_chat_preview_note')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  Haptic.tap();
                  setPendingImage(null);
                }}
                className="touch-target p-2 rounded-lg border border-border text-textMuted hover:text-textPrimary shrink-0"
                aria-label={t('support_chat_remove_file')}
              >
                <X size={18} />
              </button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <button
              type="button"
              onClick={() => {
                Haptic.tap();
                fileInputRef.current?.click();
              }}
              disabled={!threadId || sending}
              className="touch-target h-10 w-10 rounded-xl border border-border/80 bg-card flex items-center justify-center text-textMuted hover:text-neon hover:border-border/60 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-all shrink-0"
              title={t('support_chat_attach')}
              aria-label={t('support_chat_attach')}
            >
              <ImagePlus size={18} strokeWidth={2} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={t('support_chat_placeholder')}
              aria-label={t('support_chat_input_aria')}
              disabled={!threadId}
              className="flex-1 resize-none bg-card border border-border/80 rounded-xl px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:border-textMuted min-h-[40px] max-h-[96px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] leading-snug"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sending || !threadId || (!input.trim() && !pendingImage)}
              className="touch-target h-10 w-10 rounded-xl bg-neon flex items-center justify-center text-black disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-transform shrink-0"
              title={t('support_chat_send')}
              aria-label={t('support_chat_send')}
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;
