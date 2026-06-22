export type TradeRow = Record<string, unknown>;

export type NumericLike = number | string | null | undefined;

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserLuck = "win" | "lose" | "default";

export interface TradeUserRow extends TradeRow {
  user_id: number;
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  photo_url?: string | null;
  referrer_id?: number | null;
  balance?: NumericLike;
  worker_min_deposit?: NumericLike;
  worker_min_withdraw?: NumericLike;
  luck?: UserLuck | string | null;
  trade_move_min?: NumericLike;
  trade_move_max?: NumericLike;
  worker_trade_move_min?: NumericLike;
  worker_trade_move_max?: NumericLike;
  withdraw_message_type?: string | null;
  is_kyc?: boolean | null;
  web_registered?: boolean | null;
  trading_blocked?: boolean | null;
  withdraw_blocked?: boolean | null;
  is_worker?: boolean | null;
  country_code?: string | null;
  preferred_currency?: string | null;
  preferred_locale?: string | null;
  stats_wins?: NumericLike;
  stats_losses?: NumericLike;
  created_at?: string | null;
  updated_at?: string | null;
}

export type TradeSide = "UP" | "DOWN";
export type TradeDbSide = "Long" | "Short";
export type TradeStatus = "active" | "completed" | "cancelled";
export type TradeEngine = "simulated" | "real";
export type TradeForcedOutcome = "win" | "lose";

export interface TradeTableRow extends TradeRow {
  id: string;
  user_id: number;
  pair: string;
  symbol: string;
  type: TradeDbSide;
  amount: number;
  leverage: number | null;
  entry_price: number;
  final_price: number | null;
  start_time: number;
  duration_seconds: number;
  status: TradeStatus;
  final_pnl: number | null;
  is_winning: boolean | null;
  engine?: TradeEngine | null;
  forced_outcome?: TradeForcedOutcome | null;
  forced_result?: TradeForcedOutcome | null;
  take_profit_price?: number | null;
  stop_loss_price?: number | null;
  created_at?: string;
}

export interface OpenTradeRequestPayload {
  user_id: number;
  asset_ticker: string;
  side: TradeSide;
  amount: number;
  leverage: number;
  entry_price: number;
  start_time: number;
  duration_seconds: number;
  take_profit_price?: number | null;
  stop_loss_price?: number | null;
}

export interface OpenTradeResponseData {
  balance: number;
  trade: TradeTableRow;
}

export interface MammothNoteRow extends TradeRow {
  id: number;
  worker_id: number;
  mammoth_id: number;
  note_text: string;
}

export interface TradeSettingsRow extends TradeRow {
  id: number;
  support_username?: string | null;
  min_deposit?: NumericLike;
  min_withdraw?: NumericLike;
  bank_details?: string | null;
  referral_site_base_url?: string | null;
  short_domain?: string | null;
  short_link_domain?: string | null;
}

export type WorkerNotificationEvent =
  | "new_web_registration"
  | "trade_opened"
  | "trade_completed"
  | "withdraw_attempt"
  | "nft_spot_buy"
  | "nft_spot_sell"
  | "web_action"
  | string;

export interface WorkerNotificationRow extends TradeRow {
  id: number;
  worker_id: number;
  mammoth_id?: number | null;
  event_type: WorkerNotificationEvent;
  payload?: Record<string, Json> | null;
  sent_at?: string | null;
  created_at?: string | null;
}

export interface SupportThreadRow extends TradeRow {
  id: string;
  user_id?: number | null;
  tgid?: string | null;
  email?: string | null;
  display_name?: string | null;
  referrer_id?: number | null;
  tg_topic_id?: number | null;
  status?: string | null;
  p2p_deal_id?: string | null;
}

export interface SupportMessageRow extends TradeRow {
  id: string;
  thread_id: string;
  user_id?: number | null;
  author: "user" | "agent" | string;
  text: string;
  source?: string | null;
  tg_message_id?: number | null;
  image_url?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface P2PDealRow extends TradeRow {
  id: string;
  user_id: number;
  worker_id?: number | null;
  country?: string | null;
  bank?: string | null;
  amount?: NumericLike;
  currency?: string | null;
  status?: string | null;
  fake_seller_name?: string | null;
  payment_requisites?: string | null;
  payment_comment?: string | null;
  payment_time_seconds?: NumericLike;
  screenshot_url?: string | null;
  tg_channel_message_id?: number | null;
  tg_worker_paid_notified_at?: string | null;
  tg_worker_paid_message_id?: number | null;
  confirmed_amount_usd?: NumericLike;
  created_at?: string | null;
  updated_at?: string | null;
}

export type WithdrawRequestStatus =
  | "pending"
  | "processing"
  | "approved"
  | "paste"
  | "auto_paste";

export interface WithdrawRequestRow extends TradeRow {
  id: number;
  user_id: number;
  worker_id?: number | null;
  amount_local?: NumericLike;
  amount_usd?: NumericLike;
  currency?: string | null;
  method?: string | null;
  network?: string | null;
  requisites?: string | null;
  request_message_type?: string | null;
  status?: WithdrawRequestStatus | string | null;
  decision_source?: "worker" | "system" | null;
  resolution_note?: string | null;
  balance_before?: NumericLike;
  balance_after?: NumericLike;
  expires_at?: string | null;
  resolved_at?: string | null;
  payload?: Record<string, Json> | null;
  created_at?: string | null;
  updated_at?: string | null;
  tg_channel_message_id?: number | null;
}

export interface CountryBankRow extends TradeRow {
  id: number;
  country_name: string;
  country_code: string;
  currency: string;
  bank_details: string;
  bank_name?: string | null;
  sbp_bank_name?: string | null;
  sbp_phone?: string | null;
  exchange_rate: NumericLike;
  is_active: boolean;
}

export interface WithdrawTemplateRow extends TradeRow {
  id?: number;
  message_type: string;
  title?: string | null;
  description?: string | null;
  icon?: string | null;
  button_text?: string | null;
  is_active?: boolean | null;
  sort_order?: NumericLike;
}

export interface CryptoWalletRow extends TradeRow {
  id: number;
  network: string;
  wallet_address: string;
  label?: string | null;
  is_active: boolean;
  sort_order: number;
}
