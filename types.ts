import React from 'react';

export type AssetCategory = 'crypto' | 'stock' | 'commodity' | 'nft';

/** Данные NFT для категории nft: цена позиции в ETH, котировка RUB считается от ETH/USDT × priceEth. */
export interface NftMeta {
  collectionSlug: string;
  collectionName: string;
  codeDisplay: string;
  codeKey: string;
  priceEth: number;
  imageUrl: string;
  /** Fixed USD price set by worker — when present, use directly as baseline, skip ETH × rate. */
  customPriceUsd?: number;
}

export interface Asset {
  id: string;
  ticker: string;
  name: string;
  price: number;
  volume24h: number; // In RUB
  change24h: number; // Percentage
  isNew?: boolean;
  /** Метаданные NFT (только category === 'nft'). */
  nft?: NftMeta;
  /**
   * Тип актива: криптовалюта, акция, сырьё или валютная пара (Forex).
   * Если не указан, по умолчанию считаем crypto.
   */
  category?: AssetCategory;
  /** Явный символ TradingView (например FX_IDC:EURUSD). Если не задан — выводится из ticker и category. */
  tradingViewSymbol?: string;
  /** Идентификатор CoinGecko (нужен для виджета GCK). Опционально: можно вычислять по ticker. */
  coingeckoId?: string;
  /** true, если цену не удалось получить (например, CORS для Yahoo Finance) — в UI показывать "—". */
  priceUnavailable?: boolean;
  /** Короткий подзаголовок в списке рынков (например для акций). */
  tagline?: string;
  /** URL логотипа (акции в списке рынков и т.п.). */
  logoUrl?: string;
}

/** Открытие экрана торговли из рынков / кошелька / поиска. */
export type NavigateToTradingOptions = {
  tradeType?: 'futures' | 'spot';
  spotAction?: 'buy' | 'sell';
  /** Вкладка: график или панель ордера. Если не задано — вычисляется в App (рынки → график; NFT / явный spot buy|sell → панель). */
  initialActiveTab?: 'CHART' | 'TRADE';
};

export type PageView =
  | 'HOME'
  | 'COINS'
  | 'TRADING'
  | 'DEALS'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'QR_SCANNER'
  | 'PROFILE'
  | 'KYC'
  | 'CURRENCY'
  | 'LANGUAGE'
  | 'SUPPORT'
  | 'NFT_COLLECTION'
  | 'NFT_ITEM';

export interface IconProps {
  active?: boolean;
  className?: string;
  size?: number;
}

export interface NavItem {
  id: PageView;
  label: string;
  icon: React.FC<IconProps>;
}

export type DealStatus = 'ACTIVE' | 'WIN' | 'LOSS';
export type DealSide = 'UP' | 'DOWN';

export type TradeType = 'futures' | 'spot' | 'real' | 'fixed';
export type DealEngine = 'simulated' | 'real';
export type ForcedOutcome = 'win' | 'lose' | null;

export interface Deal {
    id: string;
    assetTicker: string;
    side: DealSide;
    amount: number;
    leverage: number;
    entryPrice: number;
    currentPrice?: number; // Dynamic price for active deals
    startTime: number;
    durationSeconds: number; // in seconds
    status: DealStatus;
    pnl?: number; // Profit and Loss
    /** Как рассчитывается движение/результат: simulated (как раньше) или real (по реальной цене). */
    engine?: DealEngine;
    /** Цена для автоматического закрытия в плюс. */
    takeProfitPrice?: number;
    /** Цена для автоматического закрытия в минус. */
    stopLossPrice?: number;
    /**
     * Для режима FIXED: принудительный исход сделки.
     * null => использовать users.luck (win/lose/default) как и раньше.
     */
    forcedOutcome?: ForcedOutcome;
    marginMode?: 'isolated' | 'cross';
}

/** Спотовая позиция: купленный актив (количество + средняя цена в рублях). */
export interface SpotHolding {
  ticker: string;
  amount: number;
  avgPriceUsd: number;
}

/** Запись истории операций (покупка/продажа спот, вывод, сделка) — из БД. */
export type ActivityType = 'spot_buy' | 'spot_sell' | 'trade';

export interface ActivityHistoryItem {
  id: number;
  activity_type: ActivityType;
  ticker: string | null;
  quantity: number | null;
  amount_usd: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Тип заявки в UI (рынок — исполнение сразу, лимит/стоп — в очереди). */
export type OrderTypeUI = 'market' | 'limit' | 'stop';

export type PendingOrderStatus = 'open' | 'filled' | 'cancelled' | 'expired';

export type SpotOrderSide = 'buy' | 'sell';

/**
 * Ожидающая заявка (клиентская, localStorage). Цены в RUB, как `livePrice`.
 * Futures при исполнении превращается в Deal через onOpenDeal.
 */
export interface PendingOrder {
  id: string;
  ticker: string;
  tradeType: 'futures' | 'spot';
  orderType: 'limit' | 'stop';
  /** Только spot. */
  sideSpot?: SpotOrderSide;
  /** Только для futures. */
  sideFutures?: DealSide;
  /** Сумма маржи/спота в RUB (как в Deal.amount / spot buy). */
  amountUsd: number;
  /** Спот-продажа: количество базового актива. */
  quantity?: number;
  limitPrice?: number;
  triggerPrice?: number;
  leverage: number;
  durationSeconds: number;
  createdAt: number;
  status: PendingOrderStatus;
  filledAt?: number;
  cancelReason?: string;
}

export type RiskMode = 'fixedAmount' | 'percentBalance';

export interface TradingRiskSettings {
  version: 1;
  riskMode: RiskMode;
  /** 0.01 = 1% */
  riskPercent: number;
  maxLeverage: number;
  /** 0 = без жёсткого потолка по сумме в RUB */
  maxOrderSizeRub: number;
  confirmMarketOrders: boolean;
  defaultOrderType: OrderTypeUI;
  showAdvancedFields: boolean;
}