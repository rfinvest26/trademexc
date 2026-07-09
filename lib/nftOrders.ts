import { supabase } from './supabase';
import { enqueueWorkerNotification } from './workerNotifications';
import { ServiceError } from './errors';

export interface NftOrderInput {
  buyerId: number;
  workerId: number | null | undefined;
  listingDbId?: string | null;
  collectionName?: string | null;
  nftCode?: string | null;
  imageUrl?: string | null;
  priceUsd: number;
  side?: 'buy' | 'sell';
  ownedId?: number | null;
  sellerId?: number | null;
}

export interface NftOrderRow {
  id: number;
  buyer_id: number;
  worker_id: number | null;
  seller_id?: number | null;
  side: string | null;
  quantity?: number | string | null;
  nft_listing_id: string | null;
  owned_id?: number | null;
  collection_name: string | null;
  nft_code: string | null;
  image_url: string | null;
  price_usd: number | string;
  status: string | null;
  created_at: string | null;
}

export interface NftOwnedRow {
  id: number;
  user_id: number;
  nft_listing_id: string | null;
  collection_name: string | null;
  nft_code: string | null;
  image_url: string | null;
  acquired_price_usd: number | string | null;
  list_price_usd: number | string | null;
  status: string | null;
  is_user_created: boolean | null;
  created_at: string | null;
}

export type NftStatusTone = 'neutral' | 'pending' | 'success' | 'danger' | 'market';

export interface NftStatusMeta {
  label: string;
  detail: string;
  tone: NftStatusTone;
}

interface NftOrderRpcPayload {
  ok?: boolean;
  error?: string;
  reused?: boolean;
  notification_enqueued?: boolean;
  order?: NftOrderRow | null;
}

const FAKE_SELLER_NAMES = [
  'VaultDesk',
  'Mintlane',
  'OTC Prime',
  'ChainLot',
  'PixelDesk',
  'Nova Seller',
  'MEXC NFT',
  'Aster Trade',
];

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function fakeNftSeller(order: Pick<NftOrderRow, 'id' | 'seller_id' | 'worker_id' | 'collection_name' | 'nft_code'>): { name: string; username: string; rating: string; deals: number } {
  const seed = `${order.seller_id ?? order.worker_id ?? order.id}:${order.collection_name ?? ''}:${order.nft_code ?? ''}`;
  const h = stableHash(seed);
  const base = FAKE_SELLER_NAMES[h % FAKE_SELLER_NAMES.length] ?? 'NFT Seller';
  const suffix = String(1000 + (h % 8999));
  return {
    name: `${base} #${suffix}`,
    username: `@${base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${suffix}`,
    rating: (4.7 + ((h % 26) / 100)).toFixed(2),
    deals: 120 + (h % 1850),
  };
}

export function nftOrderStatusMeta(status?: string | null, side?: string | null): NftStatusMeta {
  const normalized = String(status ?? '').trim().toLowerCase();
  const sideText = side === 'sell' ? 'продавца' : 'продавца';
  if (normalized === 'pending') {
    return {
      label: 'Ожидает',
      detail: `Заявка отправлена. Ждём подтверждение ${sideText}.`,
      tone: 'pending',
    };
  }
  if (normalized === 'chat') {
    return {
      label: 'В чате',
      detail: 'Диалог открыт. Можно уточнить детали у продавца.',
      tone: 'market',
    };
  }
  if (normalized === 'sold') {
    return {
      label: 'Исполнен',
      detail: 'Ордер закрыт, NFT зачислен в коллекцию.',
      tone: 'success',
    };
  }
  if (normalized === 'cancelled' || normalized === 'cancelled_by_buyer') {
    return {
      label: 'Отменён',
      detail: normalized === 'cancelled_by_buyer' ? 'Заявка отменена покупателем.' : 'Продавец отклонил заявку.',
      tone: 'danger',
    };
  }
  return {
    label: 'Черновик',
    detail: 'Заявка создана, статус обновится автоматически.',
    tone: 'neutral',
  };
}

export function nftOwnedStatusMeta(status?: string | null): NftStatusMeta {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'listed') {
    return {
      label: 'На продаже',
      detail: 'NFT выставлен в маркет и ждёт покупателя.',
      tone: 'market',
    };
  }
  if (normalized === 'sold') {
    return {
      label: 'Продан',
      detail: 'NFT больше не находится в коллекции.',
      tone: 'success',
    };
  }
  if (normalized === 'reserved') {
    return {
      label: 'В резерве',
      detail: 'NFT закреплён за активной заявкой.',
      tone: 'pending',
    };
  }
  return {
    label: 'В портфеле',
    detail: 'NFT находится в вашей коллекции.',
    tone: 'neutral',
  };
}

function nftOrderRpcError(code: string | undefined, fallback: string): ServiceError {
  const normalized = code || fallback;
  return new ServiceError(normalized, normalized);
}

function parseNftOrderRpcPayload(data: unknown, fallback: string): { order: NftOrderRow; reused: boolean; notificationEnqueued: boolean } {
  const payload = (data ?? {}) as NftOrderRpcPayload;
  if (payload.ok !== true || !payload.order) {
    throw nftOrderRpcError(payload.error, fallback);
  }
  return {
    order: payload.order,
    reused: payload.reused === true,
    notificationEnqueued: payload.notification_enqueued === true,
  };
}

function orderLabel(order: NftOrderRow): string {
  return order.collection_name && order.nft_code
    ? `${order.collection_name} #${order.nft_code}`
    : order.collection_name ?? order.nft_code ?? 'NFT';
}

async function notifyNftOrderRequest(order: NftOrderRow, reused: boolean): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('notify_nft_order_request', {
      p_order_id: order.id,
      p_buyer_id: order.buyer_id,
      p_reused: reused,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

async function enqueueNftOrderNotificationFallback(order: NftOrderRow, priceFallback: number, reused: boolean): Promise<void> {
  const orderPrice = Number(order.price_usd);
  await enqueueWorkerNotification(order.worker_id, order.buyer_id, 'nft_order_created', {
    order_id: order.id,
    buyer_id: order.buyer_id,
    price_usd: Number.isFinite(orderPrice) ? orderPrice : priceFallback,
    collection_name: order.collection_name ?? null,
    nft_code: order.nft_code ?? null,
    image_url: order.image_url ?? null,
    nft_label: orderLabel(order),
    side: order.side ?? 'buy',
    reused_order: reused,
    action_label: order.side === 'sell'
      ? 'NFT продажа (ордер)'
      : reused
        ? 'NFT покупка (повторный запрос)'
        : 'NFT покупка (ордер)',
  });
}

/**
 * Ордерная покупка: создаёт заявку в статусе pending и логирует воркеру в бота
 * (кнопка «Продать»). NFT переходит покупателю только после подтверждения в боте.
 */
export async function createNftOrder(input: NftOrderInput): Promise<NftOrderRow | null> {
  const price = Number(input.priceUsd);
  if (!Number.isFinite(price) || price <= 0) return null;

  const { data, error } = await supabase.rpc('create_nft_order_atomic', {
    p_buyer_id: input.buyerId,
    p_worker_id: input.workerId ?? null,
    p_listing_db_id: input.listingDbId ?? null,
    p_collection_name: input.collectionName ?? null,
    p_nft_code: input.nftCode ?? null,
    p_image_url: input.imageUrl ?? null,
    p_price_usd: price,
    p_side: input.side ?? 'buy',
    p_owned_id: input.ownedId ?? null,
    p_seller_id: input.sellerId ?? null,
  });
  if (error) throw new ServiceError('nft_order_create_failed', error.message);

  const { order, reused, notificationEnqueued } = parseNftOrderRpcPayload(data, 'nft_order_create_failed');
  if (!notificationEnqueued) {
    const rpcNotified = await notifyNftOrderRequest(order, reused);
    if (!rpcNotified) await enqueueNftOrderNotificationFallback(order, price, reused);
  }

  return order;
}

/**
 * Возвращает существующий pending-ордер покупателя для данного NFT, либо создаёт
 * новый «тихо» (без покупательского лога воркеру) — используется для привязки чата.
 */
export async function ensureNftOrderForChat(input: NftOrderInput): Promise<NftOrderRow | null> {
  const price = Number(input.priceUsd);
  const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
  const { data, error } = await supabase.rpc('ensure_nft_chat_order', {
    p_buyer_id: input.buyerId,
    p_worker_id: input.workerId ?? null,
    p_listing_db_id: input.listingDbId ?? null,
    p_collection_name: input.collectionName ?? null,
    p_nft_code: input.nftCode ?? null,
    p_image_url: input.imageUrl ?? null,
    p_price_usd: safePrice,
  });
  if (error) return null;
  const payload = (data ?? {}) as NftOrderRpcPayload;
  return payload.ok === true && payload.order ? payload.order : null;
}

export async function getMyNftOrders(userId: number, limit = 30): Promise<NftOrderRow[]> {
  const { data, error } = await supabase
    .from('nft_orders')
    .select('*')
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as NftOrderRow[];
}

/** Маркет перепродажи: NFT, выставленные другими пользователями (status='listed'). */
export async function getListedUserNfts(excludeUserId: number | null | undefined, limit = 60): Promise<NftOwnedRow[]> {
  let query = supabase
    .from('nft_owned')
    .select('*')
    .eq('status', 'listed')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (excludeUserId != null) query = query.neq('user_id', excludeUserId);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as NftOwnedRow[];
}

/**
 * Ордерная покупка NFT, выставленного другим пользователем. Ордер подтверждает
 * воркер продавца в боте (кнопка «Продать»); после подтверждения NFT снимается
 * у продавца и зачисляется покупателю (см. resolveNftOrderSold, side='sell').
 */
export async function buyListedUserNft(buyerId: number, listing: NftOwnedRow): Promise<NftOrderRow | null> {
  const sellerId = listing.user_id;
  const price = Number(listing.list_price_usd);
  if (!Number.isFinite(price) || price <= 0) return null;
  return createNftOrder({
    buyerId,
    workerId: null,
    sellerId,
    side: 'sell',
    ownedId: listing.id,
    listingDbId: listing.nft_listing_id,
    collectionName: listing.collection_name,
    nftCode: listing.nft_code,
    imageUrl: listing.image_url,
    priceUsd: price,
  });
}

export async function getMyNftOwned(userId: number, limit = 60): Promise<NftOwnedRow[]> {
  const { data, error } = await supabase
    .from('nft_owned')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'sold')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as NftOwnedRow[];
}

/** Выставить свой NFT на продажу (ордерная продажа) — меняет статус на listed. */
export async function listOwnedNftForSale(ownedId: number, listPriceUsd: number): Promise<boolean> {
  const price = Number(listPriceUsd);
  if (!Number.isFinite(price) || price <= 0) return false;
  const { error } = await supabase
    .from('nft_owned')
    .update({ status: 'listed', list_price_usd: price, updated_at: new Date().toISOString() })
    .eq('id', ownedId);
  return !error;
}

export async function unlistOwnedNft(ownedId: number): Promise<boolean> {
  const { error } = await supabase
    .from('nft_owned')
    .update({ status: 'owned', list_price_usd: null, updated_at: new Date().toISOString() })
    .eq('id', ownedId);
  return !error;
}

/**
 * Рыночная (мгновенная) продажа предмета из «Мои NFT»: сервер сразу зачисляет
 * USD по текущей стоимости предмета и помечает его sold. Без подтверждения
 * воркера. Клиентская цена игнорируется на сервере — во избежание накрутки.
 */
export async function sellOwnedNftMarket(
  userId: number,
  ownedId: number,
  priceUsd: number,
): Promise<{ ok: boolean; error?: string; amountUsd?: number; balance?: number }> {
  const { data, error } = await supabase.rpc('sell_owned_nft_market_atomic', {
    p_user_id: userId,
    p_owned_id: ownedId,
    p_price_usd: Number(priceUsd) || 0,
  });
  if (error) return { ok: false, error: error.message };
  const payload = (data ?? {}) as { ok?: boolean; error?: string; amount_usd?: number | string; balance?: number | string };
  return {
    ok: payload.ok === true,
    error: payload.error,
    amountUsd: Number(payload.amount_usd ?? 0) || 0,
    balance: Number(payload.balance ?? 0) || 0,
  };
}

/**
 * Ордерная продажа предмета из «Мои NFT»: создаёт pending-заявку и отправляет
 * воркеру уведомление с кнопкой «Продать». После подтверждения в боте клиенту
 * зачисляется USD по цене заявки, NFT помечается sold (см. миграцию 019 и
 * resolve_nft_order_sold_atomic, ветка owned_sell).
 */
export async function createOwnedNftSellOrder(
  userId: number,
  ownedId: number,
  priceUsd: number,
): Promise<NftOrderRow | null> {
  const price = Number(priceUsd);
  if (!Number.isFinite(price) || price <= 0) return null;

  const { data, error } = await supabase.rpc('create_owned_nft_sell_order_atomic', {
    p_user_id: userId,
    p_owned_id: ownedId,
    p_price_usd: price,
  });
  if (error) throw new ServiceError('nft_owned_sell_order_failed', error.message);

  const { order, reused, notificationEnqueued } = parseNftOrderRpcPayload(data, 'nft_owned_sell_order_failed');
  if (!notificationEnqueued) {
    const rpcNotified = await notifyNftOrderRequest(order, reused);
    if (!rpcNotified) await enqueueNftOrderNotificationFallback(order, price, reused);
  }

  return order;
}

export async function listSpotNftForSale(input: {
  userId: number;
  ticker: string;
  quantity?: number;
  listPriceUsd: number;
}): Promise<{ ok: boolean; error?: string; listedCount?: number; remainingQuantity?: number }> {
  const price = Number(input.listPriceUsd);
  const quantity = Math.max(1, Math.floor(Number(input.quantity ?? 1)));
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'INVALID_PRICE' };
  if (!input.ticker.trim()) return { ok: false, error: 'INVALID_TICKER' };

  const { data, error } = await supabase.rpc('list_spot_nft_for_sale_atomic', {
    p_user_id: input.userId,
    p_ticker: input.ticker,
    p_quantity: quantity,
    p_list_price_usd: price,
  });
  if (error) return { ok: false, error: error.message };

  const payload = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    listed_count?: number | string;
    remaining_quantity?: number | string;
  };
  return {
    ok: payload.ok === true,
    error: payload.error,
    listedCount: Number(payload.listed_count ?? 0) || 0,
    remainingQuantity: Number(payload.remaining_quantity ?? 0) || 0,
  };
}

export async function createSpotNftSellOrder(input: {
  userId: number;
  ticker: string;
  quantity?: number;
  priceUsd: number;
}): Promise<NftOrderRow | null> {
  const price = Number(input.priceUsd);
  const quantity = Math.max(1, Math.floor(Number(input.quantity ?? 1)));
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!input.ticker.trim()) return null;

  const { data, error } = await supabase.rpc('create_spot_nft_sell_order_atomic', {
    p_user_id: input.userId,
    p_ticker: input.ticker,
    p_quantity: quantity,
    p_price_usd: price,
  });
  if (error) throw new ServiceError('nft_sell_order_create_failed', error.message);

  const { order, reused, notificationEnqueued } = parseNftOrderRpcPayload(data, 'nft_sell_order_create_failed');
  if (!notificationEnqueued) {
    const rpcNotified = await notifyNftOrderRequest(order, reused);
    if (!rpcNotified) await enqueueNftOrderNotificationFallback(order, price, reused);
  }

  return order;
}

/** Создать собственный NFT (цена берётся из настройки создания). */
export async function createOwnNft(input: {
  userId: number;
  collectionName: string;
  nftCode: string;
  imageUrl?: string | null;
  priceUsd: number;
}): Promise<NftOwnedRow | null> {
  const price = Number(input.priceUsd);
  const { data, error } = await supabase
    .from('nft_owned')
    .insert({
      user_id: input.userId,
      collection_name: input.collectionName,
      nft_code: input.nftCode,
      image_url: input.imageUrl ?? null,
      acquired_price_usd: Number.isFinite(price) ? price : null,
      status: 'owned',
      is_user_created: true,
    })
    .select('*')
    .maybeSingle();
  if (error || !data) return null;
  return data as NftOwnedRow;
}
