/**
 * Общая математика количества/суммы для NFT-сделок (используется и на
 * TradingPage, и на NFTDetailPage — единая страница покупки/продажи NFT).
 */

export function parseDiscreteNftQtyString(raw: string, fallbackMin: number): number {
  const only = raw.replace(/\D/g, '');
  if (!only) return fallbackMin;
  const n = parseInt(only, 10);
  return Number.isFinite(n) && n >= fallbackMin ? n : fallbackMin;
}

/** raw — как вводит пользователь (без ограничения); committed зажат по maxWhole для превью. */
export function nftSellWishFromUi(
  raw: string,
  maxWhole: number
): { rawWish: number; committedWish: number } {
  if (maxWhole < 1) return { rawWish: 0, committedWish: 0 };
  const only = raw.replace(/\D/g, '');
  const rawWish = only === '' ? 1 : Math.max(parseInt(only, 10) || 0, 0);
  if (!Number.isFinite(rawWish) || rawWish < 1) return { rawWish: 1, committedWish: 1 };
  return { rawWish, committedWish: Math.min(rawWish, maxWhole) };
}

export function nftSpotBuyTotals(liveUsd: number, balanceUsd: number, qtyRaw: string, minUsd: number) {
  const qtyWish = parseDiscreteNftQtyString(qtyRaw, 1);
  if (!Number.isFinite(liveUsd) || liveUsd <= 0) {
    return { qtyWish, maxAffordableQty: 0, amountUsd: 0, affordable: false };
  }
  const maxAffordableQty = balanceUsd >= liveUsd ? Math.floor(balanceUsd / liveUsd + 1e-9) : 0;
  const amountUsd = Math.round(qtyWish * liveUsd * 10000) / 10000;
  const affordable =
    qtyWish >= 1 &&
    amountUsd <= balanceUsd &&
    amountUsd >= minUsd &&
    (maxAffordableQty <= 0 || qtyWish <= maxAffordableQty);
  return { qtyWish, maxAffordableQty, amountUsd, affordable };
}
