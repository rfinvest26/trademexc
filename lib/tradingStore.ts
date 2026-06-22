import type { PendingOrder, TradingRiskSettings } from '../types';

/**
 * Лёгкое хранилище для TradingPage (localStorage).
 * Ранее файл мог быть удалён/не добавлен — из-за этого Vite падает.
 */

const LS_PENDING = 'mexc_pending_orders_v1';
const LS_RISK = 'mexc_trading_risk_v1';
const LS_HISTORY = 'mexc_order_history_v1';

/** Запись истории лимитных/стоп заявок (localStorage), см. TradingPage. */
export interface OrderHistoryEntry {
  id: string;
  ticker: string;
  tradeType: 'futures' | 'spot';
  orderType: PendingOrder['orderType'];
  status: string;
  at: number;
  orderId?: string;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  const parsed = safeParse<T[]>(window.localStorage.getItem(key));
  return Array.isArray(parsed) ? parsed : [];
}

function writeArray<T>(key: string, value: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy mode
  }
}

export function loadPendingOrders(): PendingOrder[] {
  return readArray<PendingOrder>(LS_PENDING);
}

export function upsertPendingOrder(order: PendingOrder): PendingOrder[] {
  const list = loadPendingOrders();
  const idx = list.findIndex((o) => o.id === order.id);
  const next = idx >= 0 ? [...list.slice(0, idx), order, ...list.slice(idx + 1)] : [order, ...list];
  writeArray(LS_PENDING, next);
  return next;
}

export function removePendingOrder(id: string): PendingOrder[] {
  const next = loadPendingOrders().filter((o) => o.id !== id);
  writeArray(LS_PENDING, next);
  return next;
}

export function createPendingOrder(partial: Omit<PendingOrder, 'id' | 'createdAt' | 'status'> & { id?: string }): PendingOrder {
  const id = partial.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `po_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  return {
    ...partial,
    id,
    createdAt: Date.now(),
    status: 'open',
  };
}

export function loadRiskSettings(): TradingRiskSettings {
  if (typeof window === 'undefined') {
    return defaultRiskSettings();
  }
  const parsed = safeParse<TradingRiskSettings>(window.localStorage.getItem(LS_RISK));
  if (!parsed || parsed.version !== 1) return defaultRiskSettings();
  return { ...defaultRiskSettings(), ...parsed };
}

export function saveRiskSettings(next: TradingRiskSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_RISK, JSON.stringify(next));
  } catch {}
}

function defaultRiskSettings(): TradingRiskSettings {
  return {
    version: 1,
    riskMode: 'fixedAmount',
    riskPercent: 0.02,
    maxLeverage: 200,
    maxOrderSizeRub: 0,
    confirmMarketOrders: true,
    defaultOrderType: 'market',
    showAdvancedFields: false,
  };
}

/**
 * Решение об исполнении pending order.
 * - limit: buy исполняется когда livePrice <= limitPrice, sell — когда livePrice >= limitPrice
 * - stop:  buy исполняется когда livePrice >= triggerPrice, sell — когда livePrice <= triggerPrice
 * Если direction неизвестен (futures) — используем trigger/limit как "достигнут уровень" относительно текущей цены.
 */
export function shouldFillPendingOrder(order: PendingOrder, livePriceRub: number): boolean {
  if (order.status !== 'open') return false;
  if (!Number.isFinite(livePriceRub) || livePriceRub <= 0) return false;

  const limit = order.limitPrice ?? order.triggerPrice;
  const trigger = order.triggerPrice ?? order.limitPrice;

  if (order.orderType === 'limit' && limit != null) {
    if (order.tradeType === 'spot') {
      if (order.sideSpot === 'buy') return livePriceRub <= limit;
      if (order.sideSpot === 'sell') return livePriceRub >= limit;
    }
    // futures: best-effort
    return livePriceRub <= limit || livePriceRub >= limit;
  }

  if (order.orderType === 'stop' && trigger != null) {
    if (order.tradeType === 'spot') {
      if (order.sideSpot === 'buy') return livePriceRub >= trigger;
      if (order.sideSpot === 'sell') return livePriceRub <= trigger;
    }
    return livePriceRub >= trigger || livePriceRub <= trigger;
  }

  return false;
}

export function loadOrderHistory(): OrderHistoryEntry[] {
  return readArray<OrderHistoryEntry>(LS_HISTORY);
}

export function appendOrderHistory(entry: OrderHistoryEntry): OrderHistoryEntry[] {
  const list = loadOrderHistory();
  const next = [entry, ...list].slice(0, 200);
  writeArray(LS_HISTORY, next);
  return next;
}

