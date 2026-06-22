/**
 * Дисплей-only: множитель ≈ ±0.5%…±5% от базовой котировки (ETH×RUB или fallback),
 * плавное «дыхание» цены NFT для UI.
 */
export function nftDisplayUsdMultiplier(seed: string, timeMs: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const s = ((h >>> 0) % 10000) / 10000;
  const t = timeMs * 0.001;
  const minPct = 0.001;
  const maxPct = 0.005;
  const amp = minPct + (Math.sin(t * 0.03 + s * 6.28318530718) * 0.5 + 0.5) * (maxPct - minPct);
  const wave = Math.sin(t * 0.05 + s * 9.17) * amp;
  return 1 + wave;
}

export function withNftDisplayWobbleUsd(baseUsd: number, seed: string, timeMs: number): number {
  if (!Number.isFinite(baseUsd) || baseUsd <= 0) return baseUsd;
  return Math.max(1e-12, baseUsd * nftDisplayUsdMultiplier(seed, timeMs));
}
