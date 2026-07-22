import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Loader2, X, CheckCircle2, ChevronDown, BadgeCheck, Star, Clock, Landmark, ShieldCheck, MessageCircle, Search, Check,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import BottomSheet from '../components/BottomSheet';
import DepositMethodSheet from '../components/deposit/DepositMethodSheet';
import CryptoNetworkSheet, { type CryptoNetworkOption } from '../components/deposit/CryptoNetworkSheet';
import DepositAmountStep from '../components/deposit/DepositAmountStep';
import CryptoPaymentStep from '../components/deposit/CryptoPaymentStep';
import ProofUploadCard from '../components/deposit/ProofUploadCard';
import { P2PChatPanel } from '../components/P2PChatPanel';
import { useCurrency } from '../context/CurrencyContext';
import { Haptic } from '../utils/haptics';
import { useUser, type CountryBank } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { getSupabaseErrorMessage } from '../lib/supabaseError';
import {
  cancelPendingP2PDeal,
  createCryptoDepositRequest,
  getP2PDeal,
  openP2PDeal,
} from '../lib/services/depositService';
import { ensureP2PChatThread } from '../lib/services/p2pChatService';
import { logAction } from '../lib/appLog';
import {
  getDepositSession,
  clearDepositSession,
  saveDepositSession,
  DEPOSIT_TIMER_SECONDS,
} from '../lib/depositSession';
import BottomSheetFooter from '../components/BottomSheetFooter';
import { useWorkerUsername } from '../utils/useWorkerUsername';
import AppInput from '../components/AppInput';
import AppDrawer from '../components/AppDrawer';
import TopSearchControl from '../components/TopSearchControl';
import AccountBalanceBar from '../components/AccountBalanceBar';
import QrDepositStep from '../components/deposit/QrDepositStep';
import { getSiteQrConfig, type SiteQrConfig } from '../lib/siteQr';

// ==========================================
// ТИПЫ
// ==========================================

interface DepositPageProps {
  onBack: () => void;
  onDeposit: () => void;
  onHideNav?: (hide: boolean) => void;
}

type Step =
  | 'METHOD'
  | 'P2P_DEALS'
  | 'P2P_CHAT'
  | 'QR'
  | 'NETWORK'
  | 'AMOUNT'
  | 'PAYMENT'
  | 'CHECK'
  | 'SUCCESS';

type CryptoNetwork = 'trc20' | 'ton' | 'btc' | 'sol';

interface StoredP2PDeal {
  dealId?: string;
  threadId?: string;
  status?: string;
  country?: string;
  bank?: string;
  amount?: number;
  currency?: string;
  sellerName?: string;
}

interface FakeMerchant {
  id: string;
  sellerName: string;
  sellerDeals: number;
  sellerRating: number;
  sellerCompletion: number;
  avatarColor: string;
  avatarInitial: string;
  verified: boolean;
  online: boolean;
  responseMinutes: number;
  bankLabel: string;
  minLimit: number;
  maxLimit: number;
}

// ==========================================
// КОНСТАНТЫ
// ==========================================

const CRYPTO_NETWORKS: CryptoNetworkOption[] = [
  { id: 'trc20', label: 'USDT', sub: 'TRC20', icon: 'https://s2.coinmarketcap.com/static/img/coins/200x200/1958.png' },
  { id: 'ton', label: 'TON', sub: 'Toncoin', icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Gram_cryptocurrency_logo.svg/960px-Gram_cryptocurrency_logo.svg.png' },
  { id: 'btc', label: 'Bitcoin', sub: 'BTC', icon: 'https://pngicon.ru/file/uploads/ikonka-bitkoin.png' },
  { id: 'sol', label: 'Solana', sub: 'SOL', icon: 'https://cdn-icons-png.flaticon.com/512/6001/6001527.png' },
];

const COUNTRY_FLAGS: Record<string, string> = {
  RU: '🇷🇺', KZ: '🇰🇿',
  DE: '🇩🇪', US: '🇺🇸', GB: '🇬🇧', TR: '🇹🇷',
  BY: '🇧🇾', UZ: '🇺🇿', AZ: '🇦🇿', TJ: '🇹🇯',
};

const SELLERS_BY_COUNTRY: Record<string, string[]> = {
  RU: ['Александр К.', 'Dmitry_P2P', 'crypto_alex77', 'Виктор С.', 'Maria_Trade', 'TradePro_RU', 'Pavel_Finance', 'Sergei_PRO', 'Nikita_FX', 'Oleg_Crypto', 'Anna_P2P', 'Max_Trader', 'Igor_Finance', 'Elena_Trade', 'Ruslan_Pro'],
  KZ: ['Nurasyl_KZ', 'AstanaTrader', 'Damir_P2P', 'kz_crypto_pro', 'Алибек Д.', 'Beibit_Trade', 'KZ_MoneyPro', 'Aibek_Finance', 'Zarina_Trade', 'Nursultan_P2P'],
  DE: ['Hans_Trade', 'Berlin_P2P', 'crypto_de_88', 'Klaus_Finance', 'DE_Trader', 'Euro_Pro', 'Frankfurt_C', 'Stefan_FX', 'Lukas_Trade', 'Mia_Finance'],
  TR: ['Ahmet_Trade', 'Istanbul_P2P', 'tr_crypto_pro', 'Mehmet_Finance', 'TR_Trader', 'Ankara_P2P', 'Emre_FX', 'Fatih_Trade', 'Selin_Pro', 'Burak_Finance'],
  BY: ['Vitaly_BY', 'Minsk_Trader', 'by_crypto', 'Artem_P2P', 'Natasha_Trade', 'BelCrypto', 'Grodno_P2P'],
  UZ: ['Bobur_UZ', 'Tashkent_P2P', 'uz_crypto', 'Jasur_Trade', 'Malika_Finance', 'UzCrypto', 'Samarkand_P2P'],
  AZ: ['Elchin_AZ', 'Baku_Trader', 'az_crypto', 'Nigar_P2P', 'Rashad_Trade', 'AzCrypto', 'Ganja_P2P'],
  TJ: ['Rustam_TJ', 'Dushanbe_P2P', 'tj_crypto', 'Alisher_Trade', 'Zarina_Finance', 'TjCrypto', 'Khujand_P2P'],
};

const DEFAULT_SELLERS = ['Александр К.', 'TraderPro99', 'CryptoPro', 'FastP2P', 'Maria_Finance', 'TradeMaster_24', 'P2P_Expert'];

const BANKS_BY_COUNTRY: Record<string, string[]> = {
  RU: ['Tinkoff', 'Sber', 'СБП', 'Альфа-Банк', 'ВТБ'],
  KZ: ['Kaspi Bank', 'Halyk Bank', 'СБП'],
  PL: ['PKO BP', 'mBank', 'BLIK'],
  UA: ['ПриватБанк', 'Monobank', 'СБП'],
  DE: ['SEPA', 'Sparkasse', 'Deutsche Bank'],
  TR: ['Ziraat Bankası', 'İş Bankası', 'Papara'],
  BY: ['Беларусбанк', 'Альфа-Банк БЛ'],
  UZ: ['Humo', 'Uzcard'],
  AZ: ['Kapital Bank', 'PASHA Bank'],
};
const DEFAULT_BANKS = ['Bank Transfer', 'СБП'];

const AVATAR_COLORS = [
  '#1a73e8', '#e53935', '#43a047', '#fb8c00',
  '#8e24aa', '#00acc1', '#f4511e', '#0097a7',
  '#c2185b', '#00796b',
];

// ==========================================
// УТИЛИТЫ
// ==========================================

const P2P_ACTIVE_STORAGE_KEY = 'mexc_active_p2p_deal';

function seededRandom(seed: number, offset = 0): number {
  const x = Math.sin(seed * 9301 + offset * 49297 + 233) * 10000;
  return x - Math.floor(x);
}

function generateFakeMerchants(countryCode: string, minLocal: number, seed: number, count = 8): FakeMerchant[] {
  const code = countryCode.toUpperCase();
  const pool = SELLERS_BY_COUNTRY[code] || DEFAULT_SELLERS;
  const banks = BANKS_BY_COUNTRY[code] || DEFAULT_BANKS;
  const shuffled = [...pool].sort((a, b) => seededRandom(seed, pool.indexOf(a)) - seededRandom(seed, pool.indexOf(b)));
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  const baseMin = minLocal > 0 ? minLocal : 1000;

  return picked
    .map((name, idx) => {
      const colorIdx = Math.floor(seededRandom(seed, idx + 1) * AVATAR_COLORS.length);
      const deals = 50 + Math.floor(seededRandom(seed, idx + 2) * 950);
      const rating = 4.5 + seededRandom(seed, idx + 3) * 0.5;
      const completion = 92 + Math.floor(seededRandom(seed, idx + 4) * 8);
      const bankIdx = Math.floor(seededRandom(seed, idx + 5) * banks.length);
      const minLimit = Math.round((baseMin * (0.8 + seededRandom(seed, idx + 6) * 0.6)) / 100) * 100;
      const maxMultiplier = 15 + seededRandom(seed, idx + 7) * 60;
      const maxLimit = Math.round((minLimit * maxMultiplier) / 100) * 100;
      const responseMinutes = 1 + Math.floor(seededRandom(seed, idx + 8) * 14);
      return {
        id: `m_${idx}_${name}`,
        sellerName: name,
        sellerDeals: deals,
        sellerRating: Math.round(rating * 10) / 10,
        sellerCompletion: completion,
        avatarColor: AVATAR_COLORS[colorIdx],
        avatarInitial: name.charAt(0).toUpperCase(),
        verified: seededRandom(seed, idx + 9) > 0.25,
        online: seededRandom(seed, idx + 10) > 0.2,
        responseMinutes,
        bankLabel: banks[bankIdx],
        minLimit,
        maxLimit,
      };
    })
    .sort((a, b) => b.sellerRating - a.sellerRating || b.sellerCompletion - a.sellerCompletion);
}

function getP2PMinLocal(country: CountryBank, minUsd: number, liveRate?: number): number {
  // `exchange_rate` in DB is treated as: 1 USD ≈ X LOCAL
  const countryRate = Number(country.exchange_rate ?? 0);
  const usdToLocal = liveRate && liveRate > 0 ? liveRate : (countryRate > 0 ? countryRate : 0);
  if (usdToLocal <= 0) return 0;
  const baseMinLocalRaw = minUsd * usdToLocal;
  return Math.round(baseMinLocalRaw / 100) * 100;
}

function getCurrSymbol(currency?: string): string {
  if (currency === 'RUB') return '₽';
  if (currency === 'KZT') return '₸';
  if (currency === 'PLN') return 'zł';
  if (currency === 'UAH') return '₴';
  if (currency === 'EUR') return '€';
  if (currency === 'USD') return '$';
  if (currency === 'BYN') return 'Br';
  return currency || '';
}

const DepositPage: React.FC<DepositPageProps> = ({ onBack, onDeposit, onHideNav }) => {
  const { rates, convertFromUsd, convertToUsd, currencyCode, rateAvailable, baseCurrency } = useCurrency();
  const { user, countries, cryptoWallets, minDepositUsd } = useUser();
  const toast = useToast();
  const { t } = useLanguage();
  const restoredSessionRef = useRef(false);
  const p2pAmountInputRef = useRef<HTMLInputElement>(null);
  const workerUsername = useWorkerUsername(user?.referrer_id);

  const [step, setStep] = useState<Step>('METHOD');
  const [submitting, setSubmitting] = useState(false);
  const [qrConfig, setQrConfig] = useState<SiteQrConfig | null>(null);

  // P2P state
  const [p2pCountry, setP2pCountry] = useState<CountryBank | null>(null);
  const [p2pAmount, setP2pAmount] = useState('');
  const [p2pMerchants, setP2pMerchants] = useState<FakeMerchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<FakeMerchant | null>(null);
  const [confirmMerchant, setConfirmMerchant] = useState<FakeMerchant | null>(null);
  const [openingDeal, setOpeningDeal] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<{ id: string; amount: number; currency?: string; bank?: string; merchantName?: string } | null>(null);
  const [p2pThreadId, setP2pThreadId] = useState<string | null>(null);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Crypto state
  const [cryptoNetwork, setCryptoNetwork] = useState<CryptoNetwork>('trc20');
  const [amount, setAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState(DEPOSIT_TIMER_SECONDS);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const isRussia = String(user?.country_code ?? p2pCountry?.country_code ?? '').toUpperCase() === 'RU';

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let hasSuccessfulSnapshot = false;
    if (!isRussia) { setQrConfig(null); return; }
    const refresh = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const config = await getSiteQrConfig('trade', 'RU');
        if (!cancelled) {
          hasSuccessfulSnapshot = true;
          setQrConfig(config.available ? config : null);
        }
      } catch {
        // A short network interruption must not make the QR method disappear
        // in the middle of checkout.  Keep the last confirmed snapshot and
        // retry automatically; only the first failed load remains hidden.
        if (!cancelled && !hasSuccessfulSnapshot) setQrConfig(null);
      } finally {
        inFlight = false;
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isRussia]);

  const cryptoWallet = cryptoWallets.find((w) => w.network === cryptoNetwork) ?? null;
  const amountNum = parseFloat(amount.replace(',', '.')) || 0;
  const minUsdValue = Number(minDepositUsd) > 0 ? Number(minDepositUsd) : 50;
  // Пользователь вводит сумму в валюте счёта; платёжная сумма фиксируется в USDT/USD.
  const cryptoSymbol = currencyCode;
  const minDepositDisplay = convertFromUsd(minUsdValue);
  const amountUsd = convertToUsd(amountNum);
  const mapDepositError = useCallback((error: unknown, fallback: string) => {
    const message = getSupabaseErrorMessage(error, fallback);
    if (message.toUpperCase().includes('MIN_DEPOSIT')) {
      return `${t('min_deposit_toast', { amount: Math.round(minDepositDisplay * 100) / 100 })} ${cryptoSymbol}`;
    }
    return message;
  }, [cryptoSymbol, minDepositDisplay, t]);

  const sortedCountries = useMemo<CountryBank[]>(() => {
    if (!countries) return [];
    return [...countries].sort((a, b) => {
      const aRu = (a.country_code || '').toUpperCase() === 'RU';
      const bRu = (b.country_code || '').toUpperCase() === 'RU';
      if (aRu && !bRu) return -1;
      if (!aRu && bRu) return 1;
      return a.country_name.localeCompare(b.country_name, 'ru');
    });
  }, [countries]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return sortedCountries;
    return sortedCountries.filter(c =>
      c.country_name.toLowerCase().includes(countrySearch.toLowerCase())
    );
  }, [sortedCountries, countrySearch]);

  useEffect(() => {
    if (p2pCountry || !sortedCountries.length) return;
    const ru = sortedCountries.find((c) => (c.country_code || '').toUpperCase() === 'RU');
    setP2pCountry(ru || sortedCountries[0]);
  }, [sortedCountries, p2pCountry]);

  const p2pUsdToLocalRate = useMemo(() => {
    const code = (p2pCountry?.currency || 'RUB').toLowerCase();
    const liveRate = rates?.usd?.[code];
    return typeof liveRate === 'number' && liveRate > 0 ? liveRate : (p2pCountry?.exchange_rate || 0);
  }, [p2pCountry, rates]);

  const p2pMinLocal = useMemo(
    () => (p2pCountry ? getP2PMinLocal(p2pCountry, minUsdValue, p2pUsdToLocalRate) : null),
    [p2pCountry, minUsdValue, p2pUsdToLocalRate],
  );

  // Генерируем список продавцов при выборе/смене страны — список виден сразу на одном экране
  useEffect(() => {
    if (!p2pCountry?.country_code) return;
    const seed = p2pCountry.country_code.length * 97 + (p2pCountry.country_name?.length ?? 0);
    setP2pMerchants(generateFakeMerchants(p2pCountry.country_code, p2pMinLocal ?? 1000, seed));
  }, [p2pCountry, p2pMinLocal]);

  // Скрываем навигацию при открытии модалок или на определённых шагах
  useEffect(() => {
    const shouldHide =
      isCountryModalOpen ||
      ['P2P_CHAT', 'QR', 'NETWORK', 'AMOUNT', 'PAYMENT', 'CHECK', 'SUCCESS'].includes(step);
    onHideNav?.(shouldHide);
  }, [step, isCountryModalOpen, onHideNav]);

  // Restore crypto session
  useEffect(() => {
    if (!countries?.length) return;
    const session = getDepositSession();
    if (!session || restoredSessionRef.current) return;
    restoredSessionRef.current = true;
    setStep('PAYMENT');
    setAmount(
      session.amountUsd && session.amountUsd > 0
        ? String(Math.round(convertFromUsd(session.amountUsd) * 100) / 100)
        : session.amount
    );
    setCryptoNetwork(session.cryptoNetwork as CryptoNetwork);
    const remaining = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    setTimeLeft(remaining);
  }, [countries, convertFromUsd]);

  // Restore active P2P
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(P2P_ACTIVE_STORAGE_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as StoredP2PDeal;
        if (!stored.dealId) return;
        const row = await getP2PDeal(stored.dealId);
        if (!row) { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); return; }
        const status = String(row.status ?? '');
        if (['paid', 'completed', 'cancelled', 'expired'].includes(status)) { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); return; }
        const amount = Number(row.amount || stored.amount || 0);
        const bank = row.bank || stored.bank || '';
        const merchantName = stored.sellerName || workerUsername || 'Мерчант';
        const dealId = stored.dealId;
        setActiveDealId(dealId);
        setActiveDeal({ id: dealId, amount, currency: stored.currency || row.currency || 'RUB', bank, merchantName });
        setStep('P2P_CHAT');
        if (stored.currency && sortedCountries.length) {
          const found = sortedCountries.find((c) => (c.currency || '').toUpperCase() === (stored.currency || '').toUpperCase());
          if (found) setP2pCountry(found);
        }
        const threadId = await ensureP2PChatThread(dealId, user?.user_id, `P2P ${amount} ${stored.currency || row.currency || 'RUB'}`);
        if (threadId) {
          setP2pThreadId(threadId);
          setStep('P2P_CHAT');
          try {
            localStorage.setItem(
              P2P_ACTIVE_STORAGE_KEY,
              JSON.stringify({
                ...stored,
                dealId,
                threadId,
                status,
                amount,
                bank,
                currency: stored.currency || row.currency || 'RUB',
                sellerName: merchantName,
              }),
            );
          } catch (_) {}
        }
      } catch (_) { try { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); } catch { } }
    })();
  }, [sortedCountries, user?.user_id, workerUsername]);

  useEffect(() => {
    if (step !== 'P2P_CHAT' || !activeDealId || p2pThreadId) return;
    let cancelled = false;

    const ensureThread = async () => {
      const amountLabel = activeDeal?.amount ?? 0;
      const currencyLabel = activeDeal?.currency || p2pCountry?.currency || 'RUB';
      const threadId = await ensureP2PChatThread(activeDealId, user?.user_id, `P2P ${amountLabel} ${currencyLabel}`);
      if (cancelled || !threadId) return;
      setP2pThreadId(threadId);
      try {
        const raw = localStorage.getItem(P2P_ACTIVE_STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) as StoredP2PDeal : null;
        localStorage.setItem(
          P2P_ACTIVE_STORAGE_KEY,
          JSON.stringify({
            ...stored,
            dealId: activeDealId,
            threadId,
            amount: activeDeal?.amount ?? stored?.amount ?? 0,
            currency: activeDeal?.currency || stored?.currency || currencyLabel,
            bank: activeDeal?.bank || stored?.bank || '',
            sellerName: activeDeal?.merchantName || stored?.sellerName || 'Мерчант',
          }),
        );
      } catch {}
    };

    void ensureThread();
    const interval = window.setInterval(() => { void ensureThread(); }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [step, activeDealId, p2pThreadId, activeDeal?.amount, activeDeal?.currency, activeDeal?.bank, activeDeal?.merchantName, p2pCountry?.currency, user?.user_id]);

  const cancelActiveP2PAndGoToDeals = useCallback(async () => {
    if (activeDealId) {
      await cancelPendingP2PDeal(activeDealId).catch(() => undefined);
    }
    setActiveDealId(null);
    setActiveDeal(null);
    setP2pThreadId(null);
    setSelectedMerchant(null);
    setStep('P2P_DEALS');
    try { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); } catch (_) {}
  }, [activeDealId]);

  // Следим за статусом сделки, пока открыт чат — если мерчант подтвердил
  // оплату в ветке ТП (status='completed'), закрываем сделку на сайте.
  useEffect(() => {
    if (step !== 'P2P_CHAT' || !activeDealId) return;
    let cancelled = false;

    const poll = async () => {
      const row = await getP2PDeal(activeDealId).catch(() => null);
      if (cancelled || !row) return;
      const status = String(row.status ?? '');
      if (status === 'completed') {
        try { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); } catch (_) {}
        Haptic.success?.();
        toast.show('Мерчант подтвердил оплату — баланс пополнен', 'success');
        setStep('SUCCESS');
        onDeposit();
      } else if (['cancelled', 'expired'].includes(status)) {
        try { localStorage.removeItem(P2P_ACTIVE_STORAGE_KEY); } catch (_) {}
        toast.show('Сделка отменена', 'error');
        setActiveDealId(null);
        setActiveDeal(null);
        setP2pThreadId(null);
        setSelectedMerchant(null);
        setStep('P2P_DEALS');
      }
    };

    const interval = window.setInterval(poll, 4000);
    void poll();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [step, activeDealId, onDeposit, toast]);

  const handlePickMerchant = (merchant: FakeMerchant) => {
    Haptic.tap();
    const parsed = Number.parseFloat(p2pAmount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Haptic.error();
      toast.show('Введите сумму сделки', 'error');
      return;
    }
    if (parsed < merchant.minLimit || parsed > merchant.maxLimit) {
      Haptic.error();
      toast.show('Сумма вне лимитов этого продавца', 'error');
      return;
    }
    setConfirmMerchant(merchant);
  };

  const handleOpenDeal = async (merchant: FakeMerchant) => {
    Haptic.tap();
    setOpeningDeal(true);
    if (!user?.user_id || !p2pCountry?.country_name || !p2pCountry?.country_code) {
      Haptic.error();
      toast.show('Профиль или параметры сделки ещё не готовы', 'error');
      setOpeningDeal(false);
      return;
    }
    const rawUserId = user?.user_id ?? 0;
    const userId = Number(rawUserId) || 0;
    const workerId = user?.referrer_id ?? null;

    const finalAmount = (() => {
      const parsed = Number.parseFloat(p2pAmount.replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    })();
    if (finalAmount <= 0) {
      Haptic.error();
      toast.show('Введите сумму сделки', 'error');
      setOpeningDeal(false);
      return;
    }
    const merchantName = merchant.sellerName;
    setSelectedMerchant(merchant);

    let openedDeal: Awaited<ReturnType<typeof openP2PDeal>> | null = null;
    try {
      openedDeal = await openP2PDeal({
        userId,
        workerId,
        country: p2pCountry.country_name,
        countryCode: p2pCountry.country_code,
        bank: p2pCountry.currency || 'RUB',
        amount: finalAmount,
        currency: p2pCountry.currency || 'RUB',
        sellerName: merchantName,
      });
    } catch (error) {
      Haptic.error();
      toast.show(mapDepositError(error, 'Ошибка создания сделки'), 'error');
      setOpeningDeal(false);
      return;
    }

    if (!openedDeal) {
      Haptic.error();
      toast.show('Ошибка создания сделки', 'error');
      setOpeningDeal(false);
      return;
    }

    const dealId = openedDeal.dealId;
    setActiveDealId(dealId);
    const bankLabel = p2pCountry?.country_name || p2pCountry?.currency || 'RUB';
    setActiveDeal({ id: dealId, amount: finalAmount, currency: p2pCountry?.currency || 'RUB', bank: bankLabel, merchantName });
    logAction('deposit_request', { userId, payload: { source: 'p2p', event: 'deal_opened', deal_id: dealId, amount: finalAmount, bank: bankLabel, country: p2pCountry?.country_name, email: user?.email ?? null, worker_username: workerUsername ?? null } });
    let threadReady = false;
    try {
      const threadId = await ensureP2PChatThread(dealId, user?.user_id, `P2P ${finalAmount} ${p2pCountry?.currency || 'RUB'}`);
      if (!threadId) {
        throw new Error('P2P chat thread was not created');
      }
      threadReady = true;
      setP2pThreadId(threadId);
      localStorage.setItem(
        P2P_ACTIVE_STORAGE_KEY,
        JSON.stringify({
          dealId,
          status: openedDeal.status,
          country: p2pCountry?.country_name || '',
          bank: bankLabel,
          amount: finalAmount,
          currency: p2pCountry?.currency || 'RUB',
          sellerName: merchantName,
          threadId,
        }),
      );
    } catch (_) {}
    setConfirmMerchant(null);
    setStep('P2P_CHAT');
    setOpeningDeal(false);
    if (threadReady) {
      Haptic.success?.();
      toast.show('Чат с мерчантом открыт', 'success');
    } else {
      Haptic.light();
      toast.show('Сделка создана, подключаем чат…', 'success');
    }
  };



  const requestCancelP2P = () => {
    setCancelConfirmOpen(true);
  };

  const handleCryptoAmountSubmit = () => {
    if (baseCurrency !== 'usd' && !rateAvailable) {
      toast.show(`Курс ${currencyCode} временно недоступен. Обновите курс или выберите USD.`, 'error');
      return;
    }
    const numAmount = parseFloat(amount.replace(',', '.')) || 0;
    if (numAmount < minDepositDisplay) {
      Haptic.error();
      toast.show(`${t('min_deposit_toast', { amount: Math.round(minDepositDisplay * 100) / 100 })} ${cryptoSymbol}`, 'error');
      return;
    }
    if (user) {
      setTimeLeft(DEPOSIT_TIMER_SECONDS);
      saveDepositSession({
        step: 'PAYMENT',
        method: 'CRYPTO',
        amount,
        amountUsd,
        displayCurrency: currencyCode,
        cryptoNetwork,
        senderName: user.full_name || user.username || '',
        guestContact: user.email || '',
        checkLink: '',
        selectedCountryId: null,
      });
      setStep('PAYMENT');
      return;
    }
    setTimeLeft(DEPOSIT_TIMER_SECONDS);
    saveDepositSession({
      step: 'PAYMENT',
      method: 'CRYPTO',
      amount,
      amountUsd,
      displayCurrency: currencyCode,
      cryptoNetwork,
      senderName: '',
      guestContact: '',
      checkLink: '',
      selectedCountryId: null,
    });
    setStep('PAYMENT');
  };

  const runSubmitDeposit = () => {
    if (baseCurrency !== 'usd' && !rateAvailable) {
      toast.show(`Курс ${currencyCode} временно недоступен. Обновите курс или выберите USD.`, 'error');
      return;
    }
    const numAmount = parseFloat(amount.replace(',', '.')) || 0;
    if (numAmount < minDepositDisplay) {
      Haptic.error();
      toast.show(`${t('min_deposit_toast', { amount: Math.round(minDepositDisplay * 100) / 100 })} ${cryptoSymbol}`, 'error');
      return;
    }
    if (user) {
      (async () => {
        setSubmitting(true);
        try {
          const inserted = await createCryptoDepositRequest({
            userId: user.user_id,
            workerId: user.referrer_id,
            amountLocal: numAmount,
            amountUsd,
            currency: currencyCode,
          });
          if (!inserted) { Haptic.error(); toast.show(t('deposit_error'), 'error'); setSubmitting(false); return; }
          logAction('deposit_request', { userId: user.user_id, payload: { request_id: inserted.id, amount_usd: amountUsd, method: 'crypto' } });
          clearDepositSession();
          setStep('SUCCESS');
          onDeposit();
        } catch (error) {
          Haptic.error();
          toast.show(mapDepositError(error, t('deposit_error')), 'error');
        } finally {
          setSubmitting(false);
        }
      })();
    } else {
      clearDepositSession();
      setStep('SUCCESS');
      onDeposit();
    }
  };

  // ==========================================
  // РЕНДЕР
  // ==========================================

  // Auto P2P removed (UX requirement)

  const renderP2PDealsStep = () => {
    const flagEmoji = COUNTRY_FLAGS[(p2pCountry?.country_code || '').toUpperCase()] || '🌍';
    const currSym = getCurrSymbol(p2pCountry?.currency);
    const usdToLocalRate = p2pUsdToLocalRate;
    const minLocal = p2pMinLocal;
    const amountNum = Number.parseFloat(p2pAmount.replace(',', '.'));
    const isAmountValid = Number.isFinite(amountNum) && amountNum > 0;
    const isBelowMin = !!(minLocal && isAmountValid && amountNum < minLocal);
    const approxUsd = usdToLocalRate > 0 && isAmountValid ? amountNum / usdToLocalRate : 0;
    const quickAmounts = minLocal ? [minLocal, minLocal * 2, minLocal * 5] : [];

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Sticky header: currency + amount, flat Binance/Bybit style */}
        <div className="shrink-0 px-4 pt-3 pb-2 hairline-bottom bg-background">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <button
              type="button"
              onClick={() => { Haptic.tap(); setIsCountryModalOpen(true); }}
              className="h-9 px-3 rounded-xl bg-surface text-[12px] font-semibold text-textPrimary flex items-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <span className="text-[15px] leading-none" aria-hidden>{flagEmoji}</span>
              <span className="font-mono">{(p2pCountry?.currency || 'RUB').toUpperCase()}</span>
              <ChevronDown size={13} strokeWidth={2.2} className="text-textMuted" />
            </button>
            <div className="text-right">
              <div className="text-[9px] text-textMuted uppercase tracking-wider leading-none">Курс</div>
              <div className="text-[12px] font-mono font-semibold text-textPrimary leading-tight">
                {usdToLocalRate > 0 ? `1$ ≈ ${currSym}${usdToLocalRate.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <AppInput
              ref={p2pAmountInputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={p2pAmount}
              onChange={(e) => setP2pAmount(e.target.value)}
              borderless
              invalid={isBelowMin}
              className="flex-1 min-w-0 text-[28px] font-mono font-bold leading-none"
              placeholder="0"
            />
            <span className="text-base font-semibold text-textMuted shrink-0 pb-0.5">{currSym}</span>
            {p2pAmount ? (
              <button type="button" onClick={() => setP2pAmount('')} className="shrink-0 p-1 rounded-lg hover:bg-surfaceElevated transition-colors">
                <X size={14} strokeWidth={1.75} className="text-textMuted/80" aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5 mb-2">
            <span className={`text-[10px] ${isBelowMin ? 'text-down' : 'text-textMuted'}`}>
              {minLocal ? `Мин. ${minLocal.toLocaleString('ru-RU')} ${currSym}` : 'Минимум не задан'}
            </span>
            {approxUsd > 0 && <span className="text-[10px] text-textMuted">≈ ${approxUsd.toFixed(2)}</span>}
          </div>

          {quickAmounts.length > 0 && (
            <div className="flex gap-1.5 pb-2.5 overflow-x-auto no-scrollbar">
              {quickAmounts.map((qa) => (
                <button
                  key={qa}
                  type="button"
                  onClick={() => { Haptic.tap(); setP2pAmount(String(qa)); }}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-surface text-[11px] font-mono font-medium text-textSecondary hover:text-textPrimary active:scale-[0.97] transition-all"
                >
                  {qa.toLocaleString('ru-RU')} {currSym}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Merchant list — flat rows, hairline separators like real exchanges */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          {p2pMerchants.length === 0 ? (
            <div className="py-10 text-center text-textMuted text-sm">Загрузка продавцов...</div>
          ) : (
            p2pMerchants.map((merchant) => {
              const outOfRange = isAmountValid && (amountNum < merchant.minLimit || amountNum > merchant.maxLimit);
              return (
                <button
                  key={merchant.id}
                  type="button"
                  onClick={() => handlePickMerchant(merchant)}
                  className="w-full flex items-center gap-3 py-3 hairline-bottom text-left active:bg-surfaceElevated transition-colors disabled:opacity-40"
                  disabled={openingDeal}
                >
                  <div className="relative shrink-0">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                      style={{ backgroundColor: merchant.avatarColor }}
                    >
                      {merchant.avatarInitial}
                    </div>
                    {merchant.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-textPrimary truncate">{merchant.sellerName}</span>
                      {merchant.verified && <BadgeCheck size={13} className="text-neon shrink-0" strokeWidth={2.2} />}
                    </div>
                    <div className="text-[11px] text-textMuted flex items-center gap-1 mt-0.5">
                      <span>{merchant.sellerDeals} сделок</span>
                      <span>·</span>
                      <span>{merchant.sellerCompletion}%</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><Clock size={10} />~{merchant.responseMinutes} мин</span>
                    </div>
                    <div className="text-[10px] text-textMuted mt-1 flex items-center gap-1">
                      <Landmark size={11} className="shrink-0" />
                      <span className="truncate">{merchant.bankLabel}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-0.5 justify-end text-[11px] font-semibold text-textPrimary">
                      <Star size={11} className="text-amber-400 fill-amber-400" />
                      {merchant.sellerRating.toFixed(1)}
                    </div>
                    <div className={`text-[10px] mt-1 ${outOfRange ? 'text-down' : 'text-textMuted'}`}>
                      {merchant.minLimit.toLocaleString('ru-RU')}–{merchant.maxLimit.toLocaleString('ru-RU')}
                    </div>
                  </div>
                </button>
              );
            })
          )}
          <div className="h-4" />
        </div>
      </div>
    );
  };

  const renderMerchantConfirmSheet = () => {
    const merchant = confirmMerchant;
    const currSym = getCurrSymbol(p2pCountry?.currency);
    const amountNum = Number.parseFloat(p2pAmount.replace(',', '.')) || 0;
    const approxUsd = p2pUsdToLocalRate > 0 ? amountNum / p2pUsdToLocalRate : 0;

    return (
      <BottomSheet
        open={!!merchant}
        onClose={() => { if (!openingDeal) setConfirmMerchant(null); }}
        title="Подтверждение сделки"
        closeOnBackdrop={!openingDeal}
        variant="partial"
      >
        {merchant && (
          <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Minimal Merchant Row */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base"
                  style={{ backgroundColor: merchant.avatarColor }}
                >
                  {merchant.avatarInitial}
                </div>
                {merchant.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-textPrimary tracking-tight">{merchant.sellerName}</span>
                  {merchant.verified && <BadgeCheck size={14} className="text-neon shrink-0" strokeWidth={2.5} />}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-textMuted">
                  <span>{merchant.sellerDeals} сделок</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="text-emerald-400">{merchant.sellerCompletion}%</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="flex items-center gap-0.5 text-amber-400"><Star size={10} className="fill-amber-400" />{merchant.sellerRating.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Compact Amount Card */}
            <div className="bg-surface/50 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-textMuted">К оплате</span>
                <div className="text-right">
                  <div className="text-lg font-mono font-bold text-textPrimary leading-tight">
                    {amountNum.toLocaleString('ru-RU')} <span className="text-neon">{currSym}</span>
                  </div>
                  {approxUsd > 0 && <div className="text-[10px] text-textMuted">≈ ${approxUsd.toFixed(2)}</div>}
                </div>
              </div>
              <div className="h-px w-full bg-border/40" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-textMuted">Способ</span>
                <span className="font-medium text-textPrimary">{merchant.bankLabel}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-textMuted">Время ответа</span>
                <span className="font-medium text-textPrimary">~{merchant.responseMinutes} мин</span>
              </div>
            </div>

            {/* Tiny Notice */}
            <div className="text-[11px] text-center text-textMuted">
              Чат с продавцом откроется после подтверждения
            </div>
          </div>
        )}

        <BottomSheetFooter
          onCancel={() => setConfirmMerchant(null)}
          onConfirm={() => { if (merchant) void handleOpenDeal(merchant); }}
          confirmLabel="Подтвердить сделку"
          confirmLoading={openingDeal}
          confirmDisabled={openingDeal}
        />
      </BottomSheet>
    );
  };

  const renderP2PChatStep = () => {
    const currSym = getCurrSymbol(p2pCountry?.currency);
    const merchantName = selectedMerchant?.sellerName || activeDeal?.merchantName || 'Мерчант';

    return (
      <AppDrawer open onClose={handleBack} panelClassName="md:w-[460px]">
        <div className="app-chat-shell">
          <div className="shrink-0 px-3 py-2 hairline-bottom flex items-center justify-between gap-2 bg-background">
            <button
              type="button"
              onClick={handleBack}
              className="app-icon-button shrink-0"
              aria-label="Закрыть чат"
            >
              <X size={16} />
            </button>
            <div className="min-w-0 flex-1 text-[11px] text-textMuted">
              Сумма сделки:{' '}
              <span className="font-mono font-semibold text-textPrimary">
                {activeDeal?.amount ? `${activeDeal.amount.toLocaleString('ru-RU')} ${currSym}` : '—'}
              </span>
            </div>
            <button
              onClick={() => { Haptic.tap(); requestCancelP2P(); }}
              className="shrink-0 text-[11px] font-medium text-down active:opacity-70 transition-opacity"
            >
              Отменить
            </button>
          </div>

          <div className="flex-1 min-h-0">
            {p2pThreadId ? (
              <P2PChatPanel
                threadId={p2pThreadId}
                userId={user?.user_id}
                dealId={activeDealId ?? undefined}
                merchantName={merchantName}
                merchantOnline={selectedMerchant?.online ?? true}
                merchantAvatarColor={selectedMerchant?.avatarColor}
                merchantAvatarInitial={selectedMerchant?.avatarInitial}
                merchantResponseMinutes={selectedMerchant?.responseMinutes}
              />
            ) : (
              <div className="h-full flex items-center justify-center px-6 text-center text-textMuted">
                <div>
                  <div className="text-sm font-semibold text-textPrimary">Создаём ветку чата</div>
                  <div className="mt-1 text-xs">Пожалуйста, подождите несколько секунд.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppDrawer>
    );
  };

  const renderCancelConfirmSheet = () => (
    <BottomSheet
      open={cancelConfirmOpen}
      onClose={() => setCancelConfirmOpen(false)}
      title={t('p2p_cancel_title')}
      closeOnBackdrop
      variant="partial"
    >
      <div className="px-4 pb-2">
        <p className="text-sm text-textSecondary leading-snug">
          {t('p2p_cancel_warning')}
        </p>
      </div>
      <BottomSheetFooter
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={async () => {
          setCancelConfirmOpen(false);
          await cancelActiveP2PAndGoToDeals();
        }}
        confirmLabel={t('p2p_cancel_confirm')}
        variant="destructive"
      />
    </BottomSheet>
  );

  const renderCountryPickerSheet = () => (
    <BottomSheet
      open={isCountryModalOpen}
      onClose={() => { setIsCountryModalOpen(false); setCountrySearch(''); }}
      title="Выбор страны"
      closeOnBackdrop
      variant="fullscreen"
    >
      <div className="px-4 pb-2">
        <TopSearchControl
          variant="input"
          size="md"
          value={countrySearch}
          onChange={setCountrySearch}
          onClear={() => setCountrySearch('')}
          placeholder="Поиск страны"
          autoFocus
          className="w-full"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
        {filteredCountries.length === 0 ? (
          <div className="py-10 text-center text-textMuted text-sm">Страна не найдена</div>
        ) : (
          filteredCountries.map((country) => {
            const flagEmoji = COUNTRY_FLAGS[(country.country_code || '').toUpperCase()] || '🌍';
            const isSelected = (country.id === p2pCountry?.id);
            return (
              <button
                key={country.id}
                type="button"
                onClick={() => {
                  Haptic.tap();
                  setP2pCountry(country);
                  setIsCountryModalOpen(false);
                  setCountrySearch('');
                }}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl active:bg-surfaceElevated transition-colors text-left"
              >
                <span className="text-[18px] leading-none" aria-hidden>{flagEmoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-textPrimary truncate">{country.country_name}</div>
                  <div className="text-[11px] text-textMuted font-mono">{(country.currency || '').toUpperCase()}</div>
                </div>
                {isSelected && <Check size={16} className="text-neon shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })
        )}
      </div>
    </BottomSheet>
  );

  const renderCheckStep = () => (
    <div className="pt-8 px-4 flex flex-col items-center h-full">
      <h2 className="text-lg font-bold text-textPrimary mb-2">{t('confirm_title')}</h2>
      <p className="text-sm text-textMuted text-center mb-6 max-w-xs">{t('deposit_check_step_desc')}</p>
      <ProofUploadCard
        file={selectedFile}
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        emptyTitle={t('deposit_upload_check')}
        emptyDescription="JPG · PNG · WEBP · GIF · PDF"
        selectedTitle="Файл выбран"
        selectedDescription={selectedFile?.name}
        onFileSelect={(file) => {
          Haptic.light();
          setSelectedFile(file);
          return true;
        }}
        onFileClear={() => setSelectedFile(null)}
        className="w-full mb-6"
      />

      <button
        onClick={runSubmitDeposit}
        disabled={submitting}
        className="app-button-primary w-full mt-auto mb-6"
      >
        {submitting ? <Loader2 size={18} className="animate-spin" /> : t('deposit_submit_review')}
      </button>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 p-6 text-center bg-background animate-fade-in">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5 bg-neon/10 border border-neon/20">
        <CheckCircle2 size={28} className="text-neon animate-check-stroke" />
      </div>
      <p className="text-base font-semibold text-textPrimary mb-1.5">{t('deposit_request_created')}</p>
      <p className="text-textSubtle mb-7 max-w-xs text-xs">{t('deposit_success_desc')}</p>
      <button
        onClick={() => { Haptic.tap(); onBack(); }}
        className="px-7 py-3 rounded-card font-medium text-sm text-textPrimary transition-etoro active:scale-95 hover-row bg-card app-border hover:bg-surfaceElevated"
      >
        {t('return_to_home')}
      </button>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 'METHOD':
        return (
          <DepositMethodSheet
            open
            onClose={() => { Haptic.light(); onBack(); }}
            onSelectP2P={() => setStep('P2P_DEALS')}
            onSelectCrypto={() => setStep('NETWORK')}
            onSelectQr={() => setStep('QR')}
            showQr={Boolean(isRussia && qrConfig?.available)}
          />
        );
      case 'QR':
        return qrConfig && user ? (
          <QrDepositStep
            config={qrConfig}
            userId={user.user_id}
            username={user.username ?? user.email ?? null}
            workerUserId={user.referrer_id ?? null}
            onBack={() => setStep('METHOD')}
          />
        ) : null;
      case 'P2P_DEALS':         return renderP2PDealsStep();
      case 'P2P_CHAT':
        return (
          <div className="flex flex-col h-full min-h-0 md:grid md:grid-cols-[1fr_400px] md:relative">
            <div className="hidden md:flex flex-col min-h-0 border-r border-border">
              {renderP2PDealsStep()}
            </div>
            <div className="flex-1 flex flex-col min-h-0 relative bg-background">
              {renderP2PChatStep()}
            </div>
          </div>
        );
      case 'NETWORK':
        return (
          <CryptoNetworkSheet
            open
            onClose={() => { Haptic.light(); setStep('METHOD'); }}
            networks={CRYPTO_NETWORKS}
            onSelect={(networkId) => {
              setCryptoNetwork(networkId as CryptoNetwork);
              setStep('AMOUNT');
            }}
          />
        );
      case 'AMOUNT':
        return (
          <DepositAmountStep
            amount={amount}
            symbol={cryptoSymbol}
            minAmount={minDepositDisplay}
            maxAmount={convertFromUsd(50_000)}
            presets={[50, 100, 500, 1_000].map((value) => Math.round(convertFromUsd(value) * 100) / 100)}
            setAmount={setAmount}
            onSubmit={handleCryptoAmountSubmit}
            submitting={submitting}
          />
        );
      case 'PAYMENT':
        return (
          <CryptoPaymentStep
            net={CRYPTO_NETWORKS.find((n) => n.id === cryptoNetwork)}
            cryptoWallet={cryptoWallet}
            amountLabel={amount ? `≈ ${amountUsd.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} USDT · ${amount} ${cryptoSymbol}` : undefined}
            instruction={t('deposit_instruction_crypto')}
            onCancel={() => { clearDepositSession(); setStep('METHOD'); }}
            onProceed={() => setStep('CHECK')}
          />
        );
      case 'CHECK':             return renderCheckStep();
      case 'SUCCESS':           return renderSuccessStep();
      default:                  return null;
    }
  };

  const getTitle = () => {
    if (step === 'P2P_DEALS') return 'П2П Торговля';
    if (step === 'P2P_CHAT') return 'Чат с мерчантом';
    if (step === 'QR') return 'Оплата по QR';
    if (step === 'NETWORK') return 'Выбор сети';
    if (step === 'AMOUNT') return 'Сумма пополнения';
    if (step === 'PAYMENT') return 'Пополнение криптой';
    return t('deposit_title');
  };

  const handleBack = () => {
    Haptic.light();
    // P2P: "Назад" сразу на главную (по требованию UX)
    if (step === 'P2P_DEALS' || step === 'P2P_CHAT') {
      onBack();
      return;
    }
    if (step === 'NETWORK') { setStep('METHOD'); return; }
    if (step === 'QR') { setStep('METHOD'); return; }
    if (step === 'AMOUNT') { setStep('NETWORK'); return; }
    if (step === 'PAYMENT') { setStep('AMOUNT'); return; }
    if (step === 'CHECK') { setStep('PAYMENT'); return; }
    onBack();
  };

  return (
    <>
      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <div className="flex flex-col h-full min-h-0 bg-background relative max-w-[720px] mx-auto lg:max-w-4xl">
        <PageHeader title={getTitle()} onBack={handleBack} />
        {user ? (
          <div className="px-4 pt-3 lg:px-6">
            <AccountBalanceBar balanceUsd={Number(user.balance) || 0} label={t('available')} compact className="w-full" />
          </div>
        ) : null}
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain relative lg:px-6"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {renderStepContent()}
        </div>
        {renderCancelConfirmSheet()}
        {renderMerchantConfirmSheet()}
        {renderCountryPickerSheet()}
      </div>
    </>
  );
};

export default DepositPage;
