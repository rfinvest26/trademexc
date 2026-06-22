import { supabase } from '../supabase';

export async function fetchUserName(userId: number): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('username,full_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return '';

    if (!data) return '';

    return (
      (data as { username?: string | null; full_name?: string | null }).username ||
      (data as { username?: string | null; full_name?: string | null }).full_name ||
      ''
    );
  } catch {
    return '';
  }
}
