import { supabase } from '../supabase';
import { ensureSupportThread, createSupportMessage, listSupportMessages, subscribeToSupportMessages, touchSupportThread } from '../support';
import type { SupportMessageRecord } from '../support';
import type { TradeRealtimeChannel } from '../shared';

export type P2PChatMessage = SupportMessageRecord;

/**
 * Ensure a P2P deal's chat thread exists, creating it if needed.
 * Called when the user opens the P2P chat UI for a deal.
 */
export async function ensureP2PChatThread(dealId: string, userId: number | undefined, displayName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('ensure_p2p_chat_thread', {
      p_deal_id: dealId,
      p_display_name: displayName || 'P2P Deposit',
    });

    if (error || !data) {
      console.error('Failed to ensure P2P chat thread:', error);
      return null;
    }

    return data as string;
  } catch (err) {
    console.error('Exception in ensureP2PChatThread:', err);
    return null;
  }
}

/**
 * Upload a file attachment to Supabase Storage for the P2P chat.
 * Reuses the support-attachments bucket with a p2p_chat/ prefix.
 */
export async function uploadP2PChatAttachment(threadId: string, file: File): Promise<string | null> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const fileName = `p2p_chat/${threadId}/${Math.random().toString(36).substring(2)}.${ext}`;

    const { error, data } = await supabase.storage
      .from('support-attachments')
      .upload(fileName, file);

    if (error) {
      console.error('Failed to upload attachment:', error);
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from('support-attachments')
      .getPublicUrl(fileName);

    return publicUrl.publicUrl;
  } catch (err) {
    console.error('Exception uploading attachment:', err);
    return null;
  }
}

/**
 * Get all messages in a P2P chat thread.
 * This is a re-export of the support message list function, same API.
 */
export function listP2PChatMessages(threadId: string): Promise<P2PChatMessage[]> {
  return listSupportMessages(threadId);
}

/**
 * Send a message in a P2P chat thread.
 * Reuses the support message creation, with source='web' and author='user'.
 */
export async function sendP2PChatMessage(
  threadId: string,
  userId: number | undefined,
  text: string,
  imageUrl?: string | null,
): Promise<P2PChatMessage | null> {
  return createSupportMessage({
    threadId,
    author: 'user',
    text,
    source: 'web',
    userId,
    imageUrl: imageUrl ?? null,
  });
}

/**
 * Subscribe to new messages in a P2P chat thread (realtime).
 * Reuses the support message subscription, same API.
 */
export function subscribeToP2PChatMessages(
  threadId: string,
  onInsert: (row: P2PChatMessage) => void,
  onStatus?: (status: string) => void,
): TradeRealtimeChannel {
  return subscribeToSupportMessages(threadId, onInsert, onStatus);
}

/**
 * Touch a P2P chat thread to update its last_message_text and last_message_at.
 * Reuses the support touch function, same API.
 */
export function touchP2PChatThread(threadId: string, lastMessageText: string): Promise<void> {
  return touchSupportThread(threadId, lastMessageText);
}

// Re-export the removal function for cleanup
export { removeSupportChannel as removeP2PChatChannel } from '../support';
