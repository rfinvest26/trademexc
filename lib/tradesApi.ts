import type { OpenTradeRequestPayload, OpenTradeResponseData } from '@mainbot/trade-shared';
import type { Deal } from '../types';
import { supabase } from './supabase';
import { ApiClientError } from './apiClient';

interface OpenTradeResponse {
  data: OpenTradeResponseData;
}

export async function openTradeRequest(userId: number, deal: Deal): Promise<OpenTradeResponse['data']> {
  const payload: OpenTradeRequestPayload = {
    user_id: userId,
    asset_ticker: deal.assetTicker,
    side: deal.side,
    amount: deal.amount,
    leverage: deal.leverage,
    entry_price: deal.entryPrice,
    start_time: deal.startTime,
    duration_seconds: deal.durationSeconds,
    take_profit_price: deal.takeProfitPrice ?? null,
    stop_loss_price: deal.stopLossPrice ?? null,
  };

  const { data, error } = await supabase.rpc('open_trade_atomic', {
    p_user_id: payload.user_id,
    p_asset_ticker: payload.asset_ticker,
    p_side: payload.side,
    p_amount: payload.amount,
    p_leverage: payload.leverage,
    p_entry_price: payload.entry_price,
    p_start_time: payload.start_time,
    p_duration_seconds: payload.duration_seconds,
    p_take_profit_price: payload.take_profit_price ?? null,
    p_stop_loss_price: payload.stop_loss_price ?? null,
  });

  if (error) {
    throw new ApiClientError(error.message, 400, error);
  }

  if (!data || typeof data !== 'object' || !('trade' in data) || !('balance' in data)) {
    throw new ApiClientError('Invalid trade response', 500, data);
  }

  return data as OpenTradeResponse['data'];
}
