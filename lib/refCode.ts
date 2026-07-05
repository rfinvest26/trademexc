/**
 * Обратимая маскировка реф-кода воркера: скрывает сырой Telegram-ID в реф-ссылке.
 * Кодек ДОЛЖЕН совпадать 1:1 с ботом (maintps/src/utils/refCode.ts).
 *
 * Схема: token = base36(id * MUL + ADD), с префиксом 'w'. decodeRefCode понимает
 * и новый вид ('w…'), и legacy — сырой числовой id.
 */

const MUL = 1000003n; // простое число
const ADD = 90210n;
const PREFIX = 'w';

function fromBase36(s: string): bigint {
  let r = 0n;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let d: number;
    if (c >= 48 && c <= 57) d = c - 48; // 0-9
    else if (c >= 97 && c <= 122) d = c - 87; // a-z
    else if (c >= 65 && c <= 90) d = c - 55; // A-Z
    else return -1n;
    r = r * 36n + BigInt(d);
  }
  return r;
}

export function encodeRefCode(id: number): string {
  if (!Number.isFinite(id) || id <= 0) return '';
  return PREFIX + (BigInt(Math.trunc(id)) * MUL + ADD).toString(36);
}

/** Декод маскированного или legacy-числового кода в числовой id (строкой), либо null. */
export function decodeRefCode(code: string | null | undefined): string | null {
  const s = String(code ?? '').trim();
  if (!s) return null;

  const masked = /^w([0-9a-z]+)$/i.exec(s);
  if (masked) {
    const raw = fromBase36(masked[1]!.toLowerCase());
    if (raw < 0n) return null;
    const v = raw - ADD;
    if (v <= 0n || v % MUL !== 0n) return null;
    const n = Number(v / MUL);
    return Number.isSafeInteger(n) && n > 0 ? String(n) : null;
  }

  // legacy: сырой числовой id (обратная совместимость)
  if (/^\d+$/.test(s)) return s;
  return null;
}
