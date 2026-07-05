import { supabase } from './supabase';
import { subscribeToTableChanges, removeChannelDeferred, type TradeRealtimeChannel } from './shared';
import { enqueueWorkerNotification } from './workerNotifications';

export type NftChatSender = 'buyer' | 'seller';

export interface NftChatMessageRow {
  id: number;
  order_id: number;
  buyer_id: number;
  worker_id: number | null;
  sender: NftChatSender | string;
  text: string;
  created_at: string | null;
  [key: string]: unknown;
}

export async function listNftChatMessages(orderId: number, limit = 200): Promise<NftChatMessageRow[]> {
  const { data, error } = await supabase
    .from('nft_chat_messages')
    .select('id,order_id,buyer_id,worker_id,sender,text,created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data as NftChatMessageRow[];
}

/**
 * Отправка сообщения покупателем. Сохраняет в чат и логирует продавцу (воркеру)
 * в бота событие nft_order_chat с кнопкой «Ответить».
 */
export async function sendNftChatMessage(input: {
  orderId: number;
  buyerId: number;
  workerId: number | null | undefined;
  collectionName?: string | null;
  nftCode?: string | null;
  text: string;
}): Promise<NftChatMessageRow | null> {
  const text = input.text.trim();
  if (!text) return null;

  const { data, error } = await supabase
    .from('nft_chat_messages')
    .insert({
      order_id: input.orderId,
      buyer_id: input.buyerId,
      worker_id: input.workerId ?? null,
      sender: 'buyer',
      text,
    })
    .select('id,order_id,buyer_id,worker_id,sender,text,created_at')
    .maybeSingle();

  if (error || !data) return null;

  const nftLabel =
    input.collectionName && input.nftCode
      ? `${input.collectionName} #${input.nftCode}`
      : input.collectionName ?? 'NFT';

  await enqueueWorkerNotification(input.workerId, input.buyerId, 'nft_order_chat', {
    order_id: input.orderId,
    buyer_id: input.buyerId,
    nft_label: nftLabel,
    collection_name: input.collectionName ?? null,
    nft_code: input.nftCode ?? null,
    comment: text,
    action_label: 'NFT: сообщение от покупателя',
  });

  return data as NftChatMessageRow;
}

export function subscribeNftChat(
  orderId: number,
  onInsert: (row: NftChatMessageRow) => void,
  onStatus?: (status: string) => void,
): TradeRealtimeChannel {
  return subscribeToTableChanges<NftChatMessageRow>(
    supabase,
    {
      channel: `nft-chat-${orderId}`,
      table: 'nft_chat_messages',
      event: 'INSERT',
      filter: `order_id=eq.${orderId}`,
    },
    ({ new: row }) => {
      if (row?.id) onInsert(row);
    },
    onStatus,
  );
}

export function closeNftChatChannel(channel: TradeRealtimeChannel | null | undefined): void {
  removeChannelDeferred(supabase, channel, 0);
}
