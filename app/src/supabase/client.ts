// Supabase クライアント（テトリス v2 の実績コード準用）
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function getEnv(name: string): string {
  try { return (import.meta as unknown as { env: Record<string, string> }).env[name] ?? ''; } catch { return ''; }
}

export function supabase(): SupabaseClient | null {
  if (client) return client;
  const url = getEnv('VITE_SUPABASE_URL');
  const key = getEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) return null; // 未設定時はクラウド機能を静かに無効化（無ログインAI戦は続行可）
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
