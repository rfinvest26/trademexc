// Shared auth-form helpers (used by LoginPage + RegisterPage).

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim().toLowerCase());
}
