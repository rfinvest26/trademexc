import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isPlaceholderSupabaseUrl(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim();
  if (!normalized) return true;
  return normalized.includes("your-project.supabase.co");
}

export function isSupabaseConfigured(url: string | undefined, key: string | undefined): boolean {
  return Boolean(url && key && !isPlaceholderSupabaseUrl(url));
}

export function createBrowserSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export function createServiceSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
