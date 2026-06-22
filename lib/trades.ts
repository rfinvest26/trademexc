import type { TradeTableRow } from '@mainbot/trade-shared';
import { Deal, DealStatus, type ForcedOutcome } from '../types';

export type TradeRow = TradeTableRow;

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toTimestampMs(value: unknown): number {
  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const n = Number(value);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }
  return Date.now();
}

export function tradeRowToDeal(row: TradeRow): Deal {
  const status: DealStatus =
    row.status === 'active'
      ? 'ACTIVE'
      : row.is_winning === true
        ? 'WIN'
        : 'LOSS';
  return {
    id: row.id,
    assetTicker: row.symbol,
    side: row.type === 'Long' ? 'UP' : 'DOWN',
    amount: toNumber(row.amount),
    leverage: toNumber(row.leverage, 1),
    entryPrice: toNumber(row.entry_price),
    currentPrice: row.final_price == null ? undefined : toNumber(row.final_price),
    startTime: toTimestampMs(row.start_time),
    durationSeconds: Math.max(1, Math.round(toNumber(row.duration_seconds, 0))),
    status,
    pnl: row.final_pnl == null ? undefined : toNumber(row.final_pnl),
    engine: row.engine === 'real' || row.engine === 'simulated' ? row.engine : 'simulated',
    forcedOutcome: ((row.forced_outcome ?? row.forced_result) as ForcedOutcome | undefined) ?? null,
    takeProfitPrice: row.take_profit_price == null ? undefined : toNumber(row.take_profit_price),
    stopLossPrice: row.stop_loss_price == null ? undefined : toNumber(row.stop_loss_price),
  };
}

export function dealToTradeInsert(deal: Deal, userId: number) {
  /**
   * Только колонки из базового `baza.sql` — без `engine` / `forced_outcome`,
   * иначе PostgREST падает, если миграция `supabase_trades_modes_migration.sql` не применена.
   */
  return {
    user_id: userId,
    pair: deal.assetTicker,
    symbol: deal.assetTicker,
    type: deal.side === 'UP' ? 'Long' : 'Short',
    amount: deal.amount,
    leverage: deal.leverage,
    entry_price: deal.entryPrice,
    start_time: deal.startTime,
    duration_seconds: deal.durationSeconds,
    status: 'active',
    take_profit_price: deal.takeProfitPrice ?? null,
    stop_loss_price: deal.stopLossPrice ?? null,
  };
}
