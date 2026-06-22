import type { TradeRealtimeChannel, WithdrawRequestRow } from '../shared';
import { removeChannelDeferred, subscribeToRowUpdates } from '../shared';
import {
  clearPendingWithdrawSession,
  clearStoredRequest,
  createWithdrawRequest,
  getWithdrawRequest,
  readPendingWithdrawSession,
  savePendingWithdrawSession,
} from '../withdrawRequests';
import { supabase } from '../supabase';

export function subscribeToWithdrawRequest(
  requestId: number,
  onUpdate: (row: WithdrawRequestRow) => void,
  onStatus?: (status: string) => void,
): TradeRealtimeChannel {
  return subscribeToRowUpdates<WithdrawRequestRow>(
    supabase,
    {
      channel: `withdraw_req:${requestId}`,
      table: 'withdraw_requests',
      filter: `id=eq.${requestId}`,
    },
    ({ new: row }) => {
      onUpdate(row);
    },
    onStatus,
  );
}

export function removeWithdrawChannel(channel: TradeRealtimeChannel | null | undefined): void {
  removeChannelDeferred(supabase, channel);
}

export {
  clearPendingWithdrawSession,
  clearStoredRequest,
  createWithdrawRequest,
  getWithdrawRequest,
  readPendingWithdrawSession,
  savePendingWithdrawSession,
};
