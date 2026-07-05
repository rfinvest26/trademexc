import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Inbox, ImagePlus, X, ShieldCheck } from 'lucide-react';
import {
  listP2PChatMessages,
  sendP2PChatMessage,
  subscribeToP2PChatMessages,
  uploadP2PChatAttachment,
  touchP2PChatThread,
  removeP2PChatChannel,
  type P2PChatMessage,
} from '../lib/services/p2pChatService';
import type { TradeRealtimeChannel } from '../lib/shared';
import { Haptic } from '../utils/haptics';
import { useToast } from '../context/ToastContext';
import AppTextarea from './AppTextarea';

interface P2PChatPanelProps {
  threadId: string;
  userId?: number;
  dealId?: string;
  merchantName?: string;
  merchantOnline?: boolean;
  merchantAvatarColor?: string;
  merchantAvatarInitial?: string;
  merchantResponseMinutes?: number;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

function mergeMessagesById(prev: P2PChatMessage[], incoming: P2PChatMessage[]): P2PChatMessage[] {
  if (!incoming.length) return prev;
  const map = new Map<string, P2PChatMessage>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function insertMessageSorted(prev: P2PChatMessage[], next: P2PChatMessage): P2PChatMessage[] {
  if (prev.find((m) => m.id === next.id)) return prev;
  const nextTime = new Date(next.created_at).getTime();
  const index = prev.findIndex((m) => new Date(m.created_at).getTime() > nextTime);
  if (index === -1) return [...prev, next];
  return [...prev.slice(0, index), next, ...prev.slice(index)];
}

function isPdfUrl(url: string): boolean {
  const u = (url || '').toLowerCase();
  return u.endsWith('.pdf') || u.includes('.pdf?');
}

function isVideoUrl(url: string): boolean {
  const u = (url || '').toLowerCase();
  return ['.mp4', '.mov', '.webm', '.mkv', '.avi'].some((ext) => u.endsWith(ext) || u.includes(`${ext}?`));
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

function validateAttachment(file: File): string | null {
  if (!file.type) return 'Файл без типа (mime).';
  if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
    return 'Допустимы: JPG/PNG/WEBP/GIF, PDF или видео (MP4/MOV/WEBM).';
  }
  if (file.size > MAX_FILE_BYTES) return 'Файл слишком большой (макс. 15MB).';
  return null;
}

const AttachmentCard: React.FC<{ url: string }> = ({ url }) => {
  const name = niceFileNameFromUrl(url);
  if (isVideoUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-xl overflow-hidden bg-surfaceElevated">
        <video src={url} controls playsInline className="w-full max-h-64 object-contain bg-surface" />
        <div className="px-3 py-2 hairline-top text-[11px] font-mono text-textMuted truncate">{name}</div>
      </a>
    );
  }
  if (isPdfUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-3 rounded-xl bg-surfaceElevated px-3 py-2.5 hover:bg-surface transition-all duration-200 cursor-pointer">
        <div className="h-10 w-10 rounded-xl bg-background/40 flex items-center justify-center text-textMuted font-bold text-xs">PDF</div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-textPrimary font-semibold truncate">{name}</div>
          <div className="text-[10px] text-textMuted mt-0.5">Открыть документ</div>
        </div>
      </a>
    );
  }
  return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-xl overflow-hidden bg-surfaceElevated">
      <img src={url} alt="" className="max-h-64 w-full object-contain" loading="lazy" />
    </a>
  );
};

export function P2PChatPanel({
  threadId,
  userId,
  merchantName = 'Мерчант',
  merchantOnline = true,
  merchantAvatarColor = '#1a73e8',
  merchantAvatarInitial,
  merchantResponseMinutes,
}: P2PChatPanelProps) {
  const toast = useToast();
  const [messages, setMessages] = useState<P2PChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [input, setInput] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<TradeRealtimeChannel | null>(null);

  const avatarInitial = merchantAvatarInitial || merchantName.charAt(0).toUpperCase();

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length]);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  useEffect(() => {
    let isMounted = true;

    const subscribe = () => {
      channelRef.current = subscribeToP2PChatMessages(
        threadId,
        (row) => {
          if (!isMounted) return;
          setMessages((prev) => insertMessageSorted(prev, row));
        },
        (status) => {
          if (!isMounted) return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setRealtimeOk(false);
            window.setTimeout(() => {
              try {
                if (channelRef.current) removeP2PChatChannel(channelRef.current);
              } catch {}
              subscribe();
            }, 1200);
          } else if (status === 'SUBSCRIBED') {
            setRealtimeOk(true);
          }
        },
      );
    };

    const init = async () => {
      setLoading(true);
      try {
        const msgs = await listP2PChatMessages(threadId);
        if (isMounted && msgs.length) setMessages((prev) => mergeMessagesById(prev, msgs));
        subscribe();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (channelRef.current) removeP2PChatChannel(channelRef.current);
    };
  }, [threadId]);

  useEffect(() => {
    const load = () =>
      listP2PChatMessages(threadId).then((data) => {
        if (data.length) setMessages((prev) => mergeMessagesById(prev, data));
      });
    const interval = window.setInterval(load, realtimeOk ? 20000 : 3000);
    return () => window.clearInterval(interval);
  }, [threadId, realtimeOk]);

  const handleSend = async (text?: string) => {
    if (sending) return;

    if (pendingFile) {
      const caption = (text ?? input).trim() || (pendingFile.type.startsWith('video/') ? '[видео]' : pendingFile.type === 'application/pdf' ? '[документ]' : '[фото]');
      setSending(true);
      Haptic.tap();
      try {
        const imageUrl = await uploadP2PChatAttachment(threadId, pendingFile).catch(() => null);
        const data = await sendP2PChatMessage(threadId, userId, caption, imageUrl);
        if (!data) {
          toast.show(imageUrl ? 'Не удалось отправить сообщение' : 'Не удалось загрузить файл', 'error');
          return;
        }
        setMessages((prev) => mergeMessagesById(prev, [data]));
        setInput('');
        setPendingFile(null);
        await touchP2PChatThread(threadId, caption);
      } finally {
        setSending(false);
      }
      return;
    }

    const content = (text ?? input).trim();
    if (!content) return;

    setSending(true);
    Haptic.tap();
    try {
      const data = await sendP2PChatMessage(threadId, userId, content);
      if (!data) {
        toast.show('Не удалось отправить сообщение', 'error');
        return;
      }
      setMessages((prev) => mergeMessagesById(prev, [data]));
      setInput('');
      await touchP2PChatThread(threadId, content);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="app-chat-shell">
      <header className="app-chat-header">
        <div className="relative shrink-0">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-white font-semibold text-xs"
            style={{ backgroundColor: merchantAvatarColor }}
          >
            {avatarInitial}
          </div>
          {merchantOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold text-textPrimary tracking-tight leading-tight flex items-center gap-1">
            {merchantName}
            <ShieldCheck size={12} className="text-neon shrink-0" />
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5 select-none pointer-events-none">
            {merchantOnline ? (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-semibold text-emerald-400 tracking-wider uppercase">Online</span>
              </>
            ) : (
              <span className="text-[10px] font-medium text-textMuted">Не в сети</span>
            )}
            {merchantResponseMinutes != null && (
              <span className="text-[10px] text-textMuted">· отвечает ~{merchantResponseMinutes} мин</span>
            )}
          </div>
        </div>
      </header>

      <div
        ref={listRef}
        className="app-chat-list no-scrollbar space-y-2"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {loading && (
          <div className="flex justify-center items-center gap-2 py-10 text-textMuted">
            <Loader2 size={18} className="animate-spin shrink-0" />
            <span className="text-sm">Подключение...</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-2">
            <div className="h-12 w-12 rounded-xl bg-surfaceElevated flex items-center justify-center mb-3">
              <Inbox size={22} className="text-textMuted" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-medium text-textPrimary">Сообщений пока нет</p>
            <p className="text-xs text-textMuted mt-1.5 max-w-xs leading-relaxed">
              {merchantName} скоро отправит реквизиты для перевода
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.author === 'user';
          const timeStr = new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={m.id} className={`flex w-full mb-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`app-message ${
                  isUser
                    ? 'app-message-user font-medium'
                    : 'app-message-peer'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                {m.image_url ? <AttachmentCard url={m.image_url} /> : null}
                <div className={`app-message-meta ${isUser ? 'app-message-meta-user' : 'app-message-meta-peer'}`}>
                  <span>{timeStr}</span>
                  {isUser && <span className="app-message-checks" aria-hidden>✓✓</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="app-chat-inputbar pb-safe">
        {React.createElement('input', {
          ref: fileInputRef,
          type: 'file',
          accept: 'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime',
          className: 'hidden',
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const err = validateAttachment(file);
            if (err) {
              toast.show(err, 'error');
              return;
            }
            Haptic.tap();
            setPendingFile(file);
          },
        })}

        {pendingFile && (
          <div className="flex items-center gap-2 rounded-xl bg-surfaceElevated px-2.5 py-2">
            {pendingFile.type.startsWith('image/') && previewUrl ? (
              <img src={previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
            ) : pendingFile.type.startsWith('video/') && previewUrl ? (
              <video src={previewUrl} className="h-12 w-12 rounded-lg object-cover shrink-0" muted />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-background/40 flex items-center justify-center shrink-0 text-textMuted text-xs font-bold">
                {pendingFile.type === 'application/pdf' ? 'PDF' : 'FILE'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-textSecondary truncate font-mono">{pendingFile.name}</p>
              <p className="text-[10px] text-textMuted mt-0.5 leading-snug">Будет отправлено с вашим сообщением</p>
            </div>
            <button
              type="button"
              onClick={() => { Haptic.tap(); setPendingFile(null); }}
              className="touch-target p-2 rounded-lg text-textMuted hover:text-textPrimary shrink-0"
              aria-label="Убрать файл"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <button
            type="button"
            onClick={() => { Haptic.tap(); fileInputRef.current?.click(); }}
            disabled={sending}
            className="touch-target h-10 w-10 rounded-xl bg-surfaceElevated flex items-center justify-center text-textMuted hover:text-neon disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-all duration-200 shrink-0 cursor-pointer"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
          >
            <ImagePlus size={18} strokeWidth={2} />
          </button>
          <AppTextarea
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
            placeholder="Сообщение..."
            aria-label="Сообщение"
            className="flex-1 resize-none min-h-[40px] max-h-[96px] hide-scrollbar leading-snug"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={sending || (!input.trim() && !pendingFile)}
            className="touch-target h-10 w-10 rounded-xl bg-neon flex items-center justify-center text-black disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-transform shrink-0"
            title="Отправить"
            aria-label="Отправить"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </div>
  );
}
