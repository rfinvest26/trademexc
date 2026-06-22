export const BANNER_MARKET_IDS = ['bitcoin', 'ethereum', 'solana', 'ripple'] as const;
export type BannerMarketId = (typeof BANNER_MARKET_IDS)[number];
