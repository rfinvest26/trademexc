import { supabase } from '../supabase';
import type { TradeRow } from '../trades';
import { tradeRowToDeal } from '../trades';
import type { Deal } from '../../types';

export async function fetchUserTrades(userId: number): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('trades')
    .select(
      'id,user_id,pair,symbol,type,amount,leverage,entry_price,final_price,start_time,duration_seconds,status,final_pnl,is_winning,engine,forced_outcome,forced_result,take_profit_price,stop_loss_price,created_at'
    )
    .eq('user_id', userId)
    .order('start_time', { ascending: false });

  if (error) {
    return [];
  }

  return (data || []).map((row) => tradeRowToDeal(row as TradeRow));
}

export interface TradeSettlementPayload {
  tradeId: string;
  userId: number;
  finalPrice: number;
  finalPnl: number;
  isWinning: boolean;
}

export interface TradeSettlementResult {
  ok?: boolean;
  applied?: boolean;
  new_balance?: number;
}

export async function settleTradeOnServer(
  payload: TradeSettlementPayload
): Promise<TradeSettlementResult | null> {
  const { data, error } = await supabase.rpc('settle_trade', {
    p_trade_id: Number(payload.tradeId),
    p_user_id: Number(payload.userId),
    p_final_price: payload.finalPrice,
    p_final_pnl: payload.finalPnl,
    p_is_winning: payload.isWinning,
  });

  if (error) {
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return (data[0] as TradeSettlementResult) || null;
}
