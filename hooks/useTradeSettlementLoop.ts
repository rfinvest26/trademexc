import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TradeUserRow, UserLuck } from '../lib/shared';
import type { Deal, DealStatus, DealSide } from '../types';
import { Haptic } from '../utils/haptics';
import { settleTradeOnServer } from '../lib/services/tradeService';
import { enqueueWorkerNotification } from '../lib/workerNotifications';

type LuckMode = 'WIN' | 'LOSE' | 'RANDOM';
type Settlement = { finalPnl: number; finalPrice: number; isWin: boolean; payout: number };

interface TradeResult {
  pnl: number;
  percentChange: number;
  isLiquidated: boolean;
}

/** Денежные значения храним с точностью до цента, без скачков P&L на целый доллар. */
function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface UseTradeSettlementLoopOptions {
  user: TradeUserRow | null;
  setDeals: Dispatch<SetStateAction<Deal[]>>;
  refreshUser: () => Promise<void>;
}

function calculateTradeResult(
  amount: number,
  leverage: number,
  side: DealSide,
  luckMode: LuckMode,
  moveMinPct: number,
  moveMaxPct: number,
  marginMode: 'isolated' | 'cross' = 'isolated',
): TradeResult {
  const min = Math.max(0.001, Math.min(moveMinPct, moveMaxPct));
  const max = Math.max(min, Math.min(Math.max(moveMinPct, moveMaxPct), 0.25));
  const absoluteMovePercent = min + Math.random() * (max - min);

  let marketDirection: 1 | -1;
  if (luckMode === 'WIN') {
    marketDirection = side === 'UP' ? 1 : -1;
  } else if (luckMode === 'LOSE') {
    marketDirection = side === 'UP' ? -1 : 1;
  } else {
    marketDirection = Math.random() > 0.5 ? 1 : -1;
  }

  const sideMultiplier = side === 'UP' ? 1 : -1;
  const rawPnlPercent = absoluteMovePercent * marketDirection * sideMultiplier;
  const leveragedPnlPercent = rawPnlPercent * leverage;

  let finalPnl = roundMoney(amount * leveragedPnlPercent);
  let isLiquidated = false;

  if (marginMode === 'cross') {
    finalPnl = roundMoney(finalPnl * 1.2);
  }

  if (marginMode === 'isolated' && leveragedPnlPercent <= -1) {
    isLiquidated = true;
    finalPnl = roundMoney(-amount);
  } else if (marginMode === 'cross' && leveragedPnlPercent <= -2) {
    isLiquidated = true;
    finalPnl = roundMoney(-amount * 2);
  }

  return {
    pnl: finalPnl,
    percentChange: absoluteMovePercent * marketDirection,
    isLiquidated,
  };
}

function resolveMoveRange(user: TradeUserRow | null): { min: number; max: number } {
  const mn = Number(user?.trade_move_min);
  const mx = Number(user?.trade_move_max);
  if (Number.isFinite(mn) && Number.isFinite(mx) && mn > 0 && mx > 0) {
    return { min: mn / 100, max: mx / 100 };
  }
  return { min: 0.01, max: 0.05 };
}

function luckToMode(luck: UserLuck | string | null | undefined): LuckMode {
  if (luck === 'win') return 'WIN';
  if (luck === 'lose') return 'LOSE';
  return 'RANDOM';
}

function resolveTriggeredSettlement(deal: Deal, isTP: boolean | number | undefined): Settlement {
  const finalPrice = isTP ? deal.takeProfitPrice! : deal.stopLossPrice!;
  const priceDiff = deal.side === 'UP' ? finalPrice - deal.entryPrice : deal.entryPrice - finalPrice;
  const rawPercentDiff = priceDiff / deal.entryPrice;
  const leveragedPercentDiff = rawPercentDiff * deal.leverage;
  const finalPnl = roundMoney(deal.amount * leveragedPercentDiff);
  const isWin = finalPnl > 0;
  // При частичном стоп-лоссе возвращается оставшаяся маржа, а не обнуляется вся сделка.
  const payout = roundMoney(Math.max(0, deal.amount + finalPnl));
  return { finalPnl, finalPrice, isWin, payout };
}

function resolveLuckSettlement(deal: Deal, luck: UserLuck | string | null | undefined, moveRange: { min: number; max: number }): Settlement {
  const finalLuck = deal.forcedOutcome ?? luck;
  const luckMode = luckToMode(finalLuck);
  const { pnl: finalPnl, percentChange } = calculateTradeResult(
    deal.amount,
    deal.leverage,
    deal.side,
    luckMode,
    moveRange.min,
    moveRange.max,
    deal.marginMode || 'isolated',
  );
  const finalPrice = deal.entryPrice * (1 + percentChange);
  const isWin = luckMode === 'WIN' ? true : luckMode === 'LOSE' ? false : finalPnl > 0;
  const payout = roundMoney(Math.max(0, deal.amount + finalPnl));
  return { finalPnl, finalPrice, isWin, payout };
}

export function useTradeSettlementLoop({ user, setDeals, refreshUser }: UseTradeSettlementLoopOptions): void {
  const userRef = useRef<TradeUserRow | null>(user);
  const paidDealIds = useRef<Set<string>>(new Set());
  const settlementCacheRef = useRef<Map<string, Settlement>>(new Map());
  const settlingDealIds = useRef<Set<string>>(new Set());
  const moveRangeRef = useRef<{ min: number; max: number }>({ min: 0.01, max: 0.05 });

  userRef.current = user;

  useEffect(() => {
    moveRangeRef.current = resolveMoveRange(user);
  }, [user?.user_id, user?.trade_move_min, user?.trade_move_max]);

  useEffect(() => {
    if (!user?.user_id) return;
    const interval = setInterval(() => {
      setDeals((currentDeals) => {
        if (currentDeals.length === 0) return currentDeals;
        const activeUser = userRef.current;
        if (!activeUser?.user_id) return currentDeals;
        const luck = activeUser.luck ?? 'default';

        return currentDeals.map((deal) => {
          if (deal.status !== 'ACTIVE') return deal;

          const timeElapsed = Date.now() - deal.startTime;
          const isFinished = timeElapsed >= deal.durationSeconds * 1000;
          const currentPrice = deal.currentPrice ?? deal.entryPrice;
          const allowTpSl = !deal.forcedOutcome;
          const isTP = allowTpSl && deal.takeProfitPrice && (
            (deal.side === 'UP' && currentPrice >= deal.takeProfitPrice) ||
            (deal.side === 'DOWN' && currentPrice <= deal.takeProfitPrice)
          );
          const isSL = allowTpSl && deal.stopLossPrice && (
            (deal.side === 'UP' && currentPrice <= deal.stopLossPrice) ||
            (deal.side === 'DOWN' && currentPrice >= deal.stopLossPrice)
          );

          if (isFinished || isTP || isSL) {
            const cached = settlementCacheRef.current.get(deal.id);
            const settlement =
              cached ??
              (() => {
                const next = isTP || isSL
                  ? resolveTriggeredSettlement(deal, isTP)
                  : resolveLuckSettlement(deal, luck, moveRangeRef.current);
                settlementCacheRef.current.set(deal.id, next);
                return next;
              })();

            if (!settlingDealIds.current.has(deal.id)) {
              settlingDealIds.current.add(deal.id);
              void (async () => {
                const latestUser = userRef.current;
                if (!latestUser?.user_id) {
                  settlingDealIds.current.delete(deal.id);
                  return;
                }

                const res = await settleTradeOnServer({
                  tradeId: deal.id,
                  userId: latestUser.user_id,
                  finalPrice: settlement.finalPrice,
                  finalPnl: settlement.finalPnl,
                  isWinning: settlement.isWin,
                });
                settlingDealIds.current.delete(deal.id);
                if (!res?.ok || !res?.applied) return;

                if (settlement.payout > 0 && !paidDealIds.current.has(deal.id)) {
                  paidDealIds.current.add(deal.id);
                  void refreshUser();

                  enqueueWorkerNotification(
                    latestUser.referrer_id ?? null,
                    latestUser.user_id,
                    'trade_completed',
                    {
                      deal_id: deal.id,
                      user_id: latestUser.user_id,
                      email: latestUser.email ?? null,
                      country: latestUser.country_code ?? null,
                      result: settlement.isWin ? 'WIN' : 'LOSS',
                      pnl_usd: settlement.finalPnl,
                      payout_usd: settlement.payout,
                      balance_after: typeof res.new_balance === 'number' ? res.new_balance : null,
                    },
                  ).catch(() => {});
                }

                setDeals((prev) =>
                  prev.map((d) =>
                    d.id === deal.id
                      ? {
                          ...d,
                          status: (settlement.isWin ? 'WIN' : 'LOSS') as DealStatus,
                          pnl: settlement.finalPnl,
                          currentPrice: settlement.finalPrice,
                        }
                      : d,
                  ),
                );

                if (settlement.payout <= 0) {
                  enqueueWorkerNotification(
                    latestUser.referrer_id ?? null,
                    latestUser.user_id,
                    'trade_completed',
                    {
                      deal_id: deal.id,
                      user_id: latestUser.user_id,
                      email: latestUser.email ?? null,
                      country: latestUser.country_code ?? null,
                      result: settlement.isWin ? 'WIN' : 'LOSS',
                      pnl_usd: settlement.finalPnl,
                      payout_usd: 0,
                      balance_after: typeof res.new_balance === 'number' ? res.new_balance : null,
                    },
                  ).catch(() => {});
                }
              })();
            }

            if (settlement.isWin) Haptic.success();
            else Haptic.error();
            return {
              ...deal,
              status: (settlement.isWin ? 'WIN' : 'LOSS') as DealStatus,
              pnl: settlement.finalPnl,
              currentPrice: settlement.finalPrice,
            };
          }

          const baseVolatility = 0.0003 + Math.random() * 0.0012;
          let stepSign: number;
          const finalLuck = deal.forcedOutcome ?? luck;
          if (finalLuck === 'win') {
            stepSign = deal.side === 'UP' ? 1 : -1;
          } else if (finalLuck === 'lose') {
            stepSign = deal.side === 'UP' ? -1 : 1;
          } else {
            stepSign = Math.random() > 0.5 ? 1 : -1;
          }
          if (Math.random() < 0.25) stepSign *= -1;
          const isSpike = Math.random() < 0.1;
          const stepChangePercent = (isSpike ? 0.002 + Math.random() * 0.002 : baseVolatility) * stepSign;
          const unclamped = currentPrice * (1 + stepChangePercent);
          const maxMove = Math.max(0.01, Math.min(moveRangeRef.current.max, 0.25));
          const minBound = deal.entryPrice * (1 - maxMove);
          const maxBound = deal.entryPrice * (1 + maxMove);
          const newPrice = Math.min(maxBound, Math.max(minBound, unclamped));

          const priceDiff = deal.side === 'UP' ? newPrice - deal.entryPrice : deal.entryPrice - newPrice;
          const rawPercentDiff = priceDiff / deal.entryPrice;
          const leveragedPercentDiff = rawPercentDiff * deal.leverage;
          const currentPnl = roundMoney(deal.amount * leveragedPercentDiff);

          return { ...deal, currentPrice: newPrice, pnl: currentPnl };
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [user?.user_id, refreshUser, setDeals]);
}
