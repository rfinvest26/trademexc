import { createBrowserSupabaseClient } from './shared';

// Public browser credentials of MAIN Supabase. The anon key is intentionally
// bundled into the static site; access is restricted by RLS and token-scoped RPCs.
const url = 'https://yzvavkllierbwuegfmhd.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6dmF2a2xsaWVyYnd1ZWdmbWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzcwNjEsImV4cCI6MjA5MTc1MzA2MX0.1dzQVOhjJrlc3AAwGynW-7Xunfj0ZcW04IL42rBWV24';

export const isMainSupabaseConfigured = true;
export const mainSupabase = createBrowserSupabaseClient(url, key);
