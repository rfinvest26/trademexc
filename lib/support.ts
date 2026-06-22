import type { SupportMessageRow, TradeRealtimeChannel } from './shared';
import { removeChannelDeferred, subscribeToTableChanges } from './shared';
import { supabase } from './supabase';

export type SupportMessageAuthor = 'user' | 'agent';
export type SupportMessageSource = 'web' | string;

export interface SupportThreadRecord {
  id: string;
}

export type SupportMessageRecord = SupportMessageRow & {
  author: SupportMessageAuthor;
  created_at: string;
};

export interface EnsureSupportThreadInput {
  userId?: number | null;
  email?: string | null;
  displayName: string;
  referrerId?: number | null;
  source?: SupportMessageSource;
}

export interface CreateSupportMessageInput {
  threadId: string;
  author: SupportMessageAuthor;
  text: string;
  source: SupportMessageSource;
  userId?: number | null;
  imageUrl?: string | null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = String(value ?? '').trim().toLowerCase();
  return email || null;
}

export async function ensureSupportThread(input: EnsureSupportThreadInput): Promise<string | null> {
  const email = normalizeEmail(input.email);
  const source = input.source ?? 'web';

  if (input.userId) {
    const { data: threads, error } = await supabase
      .from('support_threads')
      .select('id')
      .eq('user_id', input.userId)
      .is('p2p_deal_id', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return null;
    const existingId = threads?.[0]?.id as string | undefined;
    if (existingId) return existingId;
  } else if (email) {
    const { data: threads, error } = await supabase
      .from('support_threads')
      .select('id')
      .eq('email', email)
      .is('user_id', null)
      .is('p2p_deal_id', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return null;
    const existingId = threads?.[0]?.id as string | undefined;
    if (existingId) return existingId;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('support_threads')
    .insert({
      user_id: input.userId ?? null,
      email,
      display_name: input.displayName,
      referrer_id: input.referrerId ?? null,
      status: 'open',
      source,
      last_message_text: null,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) return null;
  return inserted.id as string;
}

export async function listSupportMessages(threadId: string): Promise<SupportMessageRecord[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('id,thread_id,author,text,created_at,image_url')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as SupportMessageRecord[];
}

export async function createSupportMessage(input: CreateSupportMessageInput): Promise<SupportMessageRecord | null> {
  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      thread_id: input.threadId,
      user_id: input.userId ?? null,
      author: input.author,
      text: input.text,
      source: input.source,
      image_url: input.imageUrl ?? null,
    })
    .select('id,thread_id,author,text,created_at,image_url')
    .single();
  if (error || !data) return null;
  return data as SupportMessageRecord;
}

export async function createSupportMessages(
  items: Array<{
    threadId: string;
    author: SupportMessageAuthor;
    text: string;
    source: SupportMessageSource;
    userId?: number | null;
    imageUrl?: string | null;
  }>,
): Promise<SupportMessageRecord[]> {
  if (!items.length) return [];
  const { data, error } = await supabase
    .from('support_messages')
    .insert(
      items.map((item) => ({
        thread_id: item.threadId,
        user_id: item.userId ?? null,
        author: item.author,
        text: item.text,
        source: item.source,
        image_url: item.imageUrl ?? null,
      })),
    )
    .select('id,thread_id,author,text,created_at,image_url');
  if (error || !data) return [];
  return data as SupportMessageRecord[];
}

export async function touchSupportThread(threadId: string, lastMessageText: string): Promise<void> {
  await supabase
    .from('support_threads')
    .update({
      last_message_text: lastMessageText,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', threadId);
}

export function subscribeToSupportMessages(
  threadId: string,
  onInsert: (row: SupportMessageRecord) => void,
  onStatus?: (status: string) => void,
): TradeRealtimeChannel {
  return subscribeToTableChanges<SupportMessageRecord>(
    supabase,
    {
      channel: `support_thread:${threadId}`,
      table: 'support_messages',
      filter: `thread_id=eq.${threadId}`,
      event: 'INSERT',
    },
    ({ new: row }) => {
      onInsert(row);
    },
    onStatus,
  );
}

export function removeSupportChannel(channel: TradeRealtimeChannel | null | undefined): void {
  removeChannelDeferred(supabase, channel);
}
