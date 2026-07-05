import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2, Gem } from 'lucide-react';
import { Haptic } from '../utils/haptics';
import { useKeyboard } from '../context/KeyboardContext';
import AppDrawer from './AppDrawer';
import AppTextarea from './AppTextarea';
import {
  listNftChatMessages,
  sendNftChatMessage,
  subscribeNftChat,
  closeNftChatChannel,
  type NftChatMessageRow,
} from '../lib/nftChat';
import { nftOrderStatusMeta, type NftStatusTone } from '../lib/nftOrders';
import type { TradeRealtimeChannel } from '../lib/shared';

interface NftChatPanelProps {
  orderId: number;
  buyerId: number;
  workerId: number | null | undefined;
  title: string;
  imageUrl?: string | null;
  collectionName?: string | null;
  nftCode?: string | null;
  sellerName?: string | null;
  status?: string | null;
  onClose: () => void;
}

function mergeById(prev: NftChatMessageRow[], incoming: NftChatMessageRow[]): NftChatMessageRow[] {
  const map = new Map<number, NftChatMessageRow>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : a.id;
    const tb = b.created_at ? Date.parse(b.created_at) : b.id;
    return ta - tb;
  });
}

function statusToneClass(tone: NftStatusTone): string {
  switch (tone) {
    case 'pending':
      return 'bg-amber-400/10 text-amber-300 ring-amber-300/15';
    case 'success':
      return 'bg-emerald-400/10 text-emerald-300 ring-emerald-300/15';
    case 'danger':
      return 'bg-red-400/10 text-red-300 ring-red-300/15';
    case 'market':
      return 'bg-accent/10 text-accent ring-accent/15';
    default:
      return 'bg-white/[0.04] text-textMuted ring-border';
  }
}

const NftChatPanel: React.FC<NftChatPanelProps> = ({
  orderId,
  buyerId,
  workerId,
  title,
  imageUrl,
  collectionName,
  nftCode,
  sellerName,
  status,
  onClose,
}) => {
  const [messages, setMessages] = useState<NftChatMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const { keyboardOffset } = useKeyboard();
  const channelRef = useRef<TradeRealtimeChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusMeta = nftOrderStatusMeta(status);
  const closed = status === 'sold' || status === 'cancelled' || status === 'cancelled_by_buyer';

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await listNftChatMessages(orderId);
      if (!alive) return;
      setMessages(rows);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [orderId]);

  useEffect(() => {
    channelRef.current = subscribeNftChat(orderId, (row) => {
      setMessages((prev) => mergeById(prev, [row]));
    });
    return () => {
      closeNftChatChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [orderId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    Haptic.tap();
    const sent = await sendNftChatMessage({ orderId, buyerId, workerId, collectionName, nftCode, text });
    if (sent) {
      setMessages((prev) => mergeById(prev, [sent]));
      setInput('');
    }
    setSending(false);
  };

  return (
    <AppDrawer
      open
      onClose={() => { Haptic.light(); onClose(); }}
      labelledBy="nft-chat-title"
      panelClassName="md:w-[460px]"
    >
      <div
        className="app-chat-shell"
        style={{
          height: '100dvh',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: keyboardOffset || undefined,
        }}
      >
        {/* Header */}
        <header className="app-chat-header">
          <button type="button" onClick={() => { Haptic.light(); onClose(); }} className="app-icon-button -ml-2">
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-xl overflow-hidden bg-surfaceElevated shrink-0 flex items-center justify-center">
            {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Gem size={16} className="text-accent" />}
          </div>
          <div className="min-w-0 flex-1">
            <div id="nft-chat-title" className="text-[14px] font-semibold text-textPrimary truncate">{title}</div>
            <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
              <span className="text-[11px] text-textMuted truncate">{sellerName || 'Продавец NFT'}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold ring-1 ${statusToneClass(statusMeta.tone)}`}>
                {statusMeta.label}
              </span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="app-chat-list no-scrollbar space-y-2">
          {loading && <div className="text-center text-textMuted text-sm py-8">…</div>}
          {!loading && messages.length === 0 && (
            <div className="text-center text-textMuted text-[13px] py-8 px-6">
              Напишите {sellerName || 'продавцу'}, чтобы обсудить покупку NFT.
            </div>
          )}
          {messages.map((m) => {
            const mine = m.sender === 'buyer';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`app-message whitespace-pre-wrap ${
                    mine ? 'app-message-user' : 'app-message-peer'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input — закреплён внизу (shrink-0): всегда виден, листать не нужно */}
        <div className="app-chat-inputbar" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {closed && (
            <div className="mb-2 rounded-xl bg-surfaceElevated px-3 py-2 text-[11px] text-textMuted">
              {statusMeta.detail}
            </div>
          )}
          <div className="flex items-end gap-2">
            <AppTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              rows={1}
              enterKeyHint="send"
              disabled={closed}
              placeholder={closed ? 'Диалог закрыт' : 'Сообщение...'}
              className="flex-1 resize-none min-h-[40px] max-h-[96px] leading-snug disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={closed || sending || !input.trim()}
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-accent text-black disabled:opacity-40 active:scale-95 transition-transform"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>
    </AppDrawer>
  );
};

export default NftChatPanel;
