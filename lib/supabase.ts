import { createBrowserSupabaseClient, isSupabaseConfigured as hasSupabaseConfig } from './shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = hasSupabaseConfig(url, key);

export const supabase = createBrowserSupabaseClient(url || '', key || '');
