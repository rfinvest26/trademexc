import { Asset } from './types';

export const MOCK_ASSETS: Asset[] = [
  // Fallback-цены (RUB, ~90 RUB/USD) — показываются мгновенно при первом визите,
  // пока не придут реальные котировки из API. priceUnavailable=false чтобы UI не фильтровал.
  { id: '1', ticker: 'BTC', name: 'Bitcoin', price: 100000, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=029' },
  { id: '2', ticker: 'ETH', name: 'Ethereum', price: 3333, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=029' },
  { id: '3', ticker: 'SOL', name: 'Solana', price: 166.67, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=029' },
  { id: '4', ticker: 'TON', name: 'Toncoin', price: 5.56, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/toncoin-ton-logo.svg?v=029' },
  { id: '5', ticker: 'USDT', name: 'Tether', price: 1, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=029' },
  { id: '6', ticker: 'XRP', name: 'Ripple', price: 0.2778, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=029' },
  { id: '7', ticker: 'DOGE', name: 'Dogecoin', price: 0.02, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=029' },
  { id: '8', ticker: 'ADA', name: 'Cardano', price: 0.0778, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/cardano-ada-logo.svg?v=029' },
  { id: '9', ticker: 'AVAX', name: 'Avalanche', price: 22.22, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=029' },
  { id: '10', ticker: 'DOT', name: 'Polkadot', price: 0.4444, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/polkadot-new-dot-logo.svg?v=029' },
  { id: '11', ticker: 'LINK', name: 'Chainlink', price: 14.44, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/chainlink-link-logo.svg?v=029' },
  { id: '12', ticker: 'MATIC', name: 'Polygon', price: 0.5556, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=029' },
];

export const MARKET_ASSETS: Asset[] = [
  ...MOCK_ASSETS,
  // Криптовалюты — fallback-цены (RUB) для мгновенного отображения
  { id: '13', ticker: 'SHIB', name: 'Shiba Inu', price: 0, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/shiba-inu-shib-logo.svg?v=029' },
  { id: '14', ticker: 'LTC', name: 'Litecoin', price: 100, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/litecoin-ltc-logo.svg?v=029' },
  { id: '15', ticker: 'TRX', name: 'Tron', price: 0.0278, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=029' },
  { id: '16', ticker: 'BCH', name: 'Bitcoin Cash', price: 50, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/bitcoin-cash-bch-logo.svg?v=029' },
  { id: '17', ticker: 'NEAR', name: 'NEAR Protocol', price: 3.11, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/near-protocol-near-logo.svg?v=029' },
  { id: '18', ticker: 'APT', name: 'Aptos', price: 5.56, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/aptos-apt-logo.svg?v=029' },
  { id: '19', ticker: 'ATOM', name: 'Cosmos', price: 1, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/cosmos-atom-logo.svg?v=029' },
  { id: '20', ticker: 'XLM', name: 'Stellar', price: 0.0444, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/stellar-xlm-logo.svg?v=029' },
  { id: '21', ticker: 'ARB', name: 'Arbitrum', price: 0.4444, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/arbitrum-arb-logo.svg?v=029' },
  { id: '22', ticker: 'OP', name: 'Optimism', price: 0.8889, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.svg?v=029' },
  { id: '23', ticker: 'INJ', name: 'Injective', price: 11.11, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/injective-inj-logo.svg?v=029' },
  { id: '24', ticker: 'RNDR', name: 'Render', price: 5, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/render-token-rndr-logo.svg?v=029' },
  { id: '25', ticker: 'PEPE', name: 'Pepe', price: 0, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/pepe-pepe-logo.svg?v=029' },
  { id: '26', ticker: 'FIL', name: 'Filecoin', price: 0.5556, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/filecoin-fil-logo.svg?v=029' },
  { id: '27', ticker: 'HBAR', name: 'Hedera', price: 0.2, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/hedera-hbar-logo.svg?v=029' },
  { id: '28', ticker: 'KAS', name: 'Kaspa', price: 0.1333, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/kaspa-kas-logo.svg?v=029' },
  { id: '29', ticker: 'VET', name: 'VeChain', price: 0.0278, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/vechain-vet-logo.svg?v=029' },
  { id: '30', ticker: 'ICP', name: 'Internet Computer', price: 1, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/internet-computer-icp-logo.svg?v=029' },
  { id: '31', ticker: 'SUI', name: 'Sui', price: 3.11, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=029' },
  { id: '32', ticker: 'SEI', name: 'Sei', price: 0.2778, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/sei-sei-logo.svg?v=029' },
  { id: '33', ticker: 'WIF', name: 'dogwifhat', price: 0.7778, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/dogwifhat-dogwifhat-logo.svg?v=029' },
  { id: '34', ticker: 'BONK', name: 'Bonk', price: 0, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/bonk1-bonk-logo.svg?v=029' },
  { id: '35', ticker: 'FLOKI', name: 'Floki', price: 0, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/floki-inu-floki-logo.svg?v=029' },
  { id: '36', ticker: 'STX', name: 'Stacks', price: 0.8889, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/stacks-stx-logo.svg?v=029' },
  { id: '37', ticker: 'TIA', name: 'Celestia', price: 0.5556, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/celestia-tia-logo.svg?v=029' },
  { id: '38', ticker: 'IMX', name: 'Immutable X', price: 1.44, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/immutable-x-imx-logo.svg?v=029' },
  { id: '39', ticker: 'FET', name: 'Fetch.ai', price: 0.7778, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/fetch-ai-fet-logo.svg?v=029' },
  { id: '40', ticker: 'RUNE', name: 'THORChain', price: 1.22, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/thorchain-rune-logo.svg?v=029' },
  { id: '41', ticker: 'AAVE', name: 'Aave', price: 16.67, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/aave-aave-logo.svg?v=029' },
  { id: '42', ticker: 'MKR', name: 'Maker', price: 15555, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/maker-mkr-logo.svg?v=029' },
  { id: '43', ticker: 'CRV', name: 'Curve DAO', price: 0.3889, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/curve-dao-token-crv-logo.svg?v=029' },
  { id: '44', ticker: 'UNI', name: 'Uniswap', price: 0.7778, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/uniswap-uni-logo.svg?v=029' },
  { id: '45', ticker: 'SAND', name: 'The Sandbox', price: 0.3333, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/the-sandbox-sand-logo.svg?v=029' },
  { id: '46', ticker: 'MANA', name: 'Decentraland', price: 0.3889, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/decentraland-mana-logo.svg?v=029' },
  { id: '47', ticker: 'AXS', name: 'Axie Infinity', price: 0.5556, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/axie-infinity-axs-logo.svg?v=029' },
  { id: '48', ticker: 'EGLD', name: 'MultiversX', price: 22.22, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/multiversx-egld-logo.svg?v=029' },
  { id: '49', ticker: 'FTM', name: 'Fantom', price: 0.4444, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/fantom-ftm-logo.svg?v=029' },
  { id: '50', ticker: 'ALGO', name: 'Algorand', price: 0.2, volume24h: 0, change24h: 0, category: 'crypto', priceUnavailable: false, logoUrl: 'https://cryptologos.cc/logos/algorand-algo-logo.svg?v=029' },
];

/** US-акции: удалены по запросу, это чистая криптобиржа */
export const STOCK_MARKET_ASSETS: Asset[] = [];

/** Локальный логотип из `public/mexc-logo.png` — без внешних CDN */
export const ETORO_LOGO_URL = `${import.meta.env.BASE_URL}mexc-logo.png`;