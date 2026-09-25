// 認証＋レベル/戦績（設計書 §2 / 基本設計書 §6）
import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';

export interface OthProfile {
  id: string; display_name: string; avatar_url: string | null;
  xp: number; level: number; wins: number; losses: number; draws: number;
  streak: number; best_streak: number; icon_stones: boolean;
  stone_pref: Record<string, unknown>;
}

let cached: OthProfile | null = null;
export function currentProfile(): OthProfile | null { return cached; }
export async function refreshProfile(): Promise<OthProfile | null> {
  const sb = supabase(); if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { cached = null; return null; }
  const { data, error } = await sb.from('oth_profiles').select('*').eq('id', user.id).single();
  if (error || !data) {
    // トリガ未作動の保険: Google名・アイコンでupsert
    const name = (user.user_metadata?.['name'] as string | undefined)?.slice(0, 20) ?? '名無し';
    const avatar = (user.user_metadata?.['avatar_url'] as string | undefined) ?? null;
    const { data: d2 } = await sb.from('oth_profiles').upsert(
      { id: user.id, display_name: name, avatar_url: avatar },
      { onConflict: 'id' }).select('*').single();
    cached = (d2 as OthProfile | null) ?? null;
  } else cached = data as OthProfile;
  return cached;
}

export async function initAuth(onChange: (s: Session | null) => Promise<void>): Promise<void> {
  const sb = supabase(); if (!sb) return;
  const { data } = await sb.auth.getSession();
  await onChange(data.session);
  sb.auth.onAuthStateChange((_e, s) => { void onChange(s); });
}

export function loginWithGoogle(): void {
  const sb = supabase(); if (!sb) return;
  void sb.auth.signInWithOAuth({ provider: 'google',
    options: { redirectTo: location.origin + location.pathname } });
}

export async function logout(): Promise<void> {
  await supabase()?.auth.signOut();
  cached = null;
}

export async function setDisplayName(name: string): Promise<void> {
  await supabase()?.rpc('oth_set_display_name', { new_name: name.slice(0, 20) });
  await refreshProfile();
}

/** 対局投稿。level_up があれば戻り値で受け取る（設計書 §6 検知）。 */
export interface SubmitResult { xp_gained: number; xp: number; new_level: number; leveled_to: number | null; }
export async function submitGame(args: {
  mode: 'ai' | 'online' | 'local'; result: 'win' | 'lose' | 'draw';
  ai_level?: number; black_count: number; white_count: number;
  moves: number; moves_svg: string; opp_user?: string | null;
}): Promise<SubmitResult | null> {
  const sb = supabase(); if (!sb) return null;
  const { data, error } = await sb.rpc('othello_submit_game', {
    p_mode: args.mode, p_result: args.result, p_ai_level: args.ai_level ?? null,
    p_black_count: args.black_count, p_white_count: args.white_count,
    p_moves: args.moves, p_moves_svg: args.moves_svg, p_opp_user: args.opp_user ?? null,
  });
  if (error) { console.warn('submit_game failed:', error.message); return null; }
  await refreshProfile();
  return data as SubmitResult;
}

// ---- ランキング ----
export interface RankRow { id: string; display_name: string; avatar_url: string | null; level: number; xp: number; wins: number; losses: number; draws: number; }
export type RankSort = 'xp' | 'wins' | 'winrate';
export async function fetchRanking(sort: RankSort, limit = 100): Promise<RankRow[]> {
  const sb = supabase(); if (!sb) return [];
  let q = sb.from('oth_profiles').select('id,display_name,avatar_url,level,xp,wins,losses,draws');
  q = q.or('wins.gt.0,losses.gt.0,draws.gt.0');  // 実績ゼロのユーザーはランキングに出さない
  if (sort === 'winrate') {
    const { data } = await q.order('wins', { ascending: false }).limit(500);
    const rows = (data ?? []) as RankRow[];
    return rows
      .map((r) => ({ ...r, _wr: r.wins / Math.max(1, r.wins + r.losses + r.draws) }))
      .sort((a, b) => b._wr - a._wr || b.xp - a.xp)
      .slice(0, limit);
  }
  const col = sort === 'wins' ? 'wins' : 'xp';
  const { data } = await q.order(col, { ascending: false }).order('xp', { ascending: false }).limit(limit);
  return (data ?? []) as RankRow[];
}
export async function myRank(sort: 'xp' | 'wins'): Promise<number | null> {
  const me = currentProfile(); if (!me) return null;
  const sb = supabase(); if (!sb) return null;
  const col = sort === 'wins' ? 'wins' : 'xp';
  const { count, error } = await sb.from('oth_profiles').select('id', { count: 'exact', head: true })
    .or(`${col}.gt.${me[col as 'wins' | 'xp']},${col}.eq.${me[col as 'wins' | 'xp']}.xp.gt.${me.xp}`);
  return error ? null : (count ?? 0) + 1;
}

// ---- 履歴 ----
export interface GameRow { id: string; mode: string; ai_level: number | null; result: string; black_count: number; white_count: number; moves: number; xp_gained: number; played_at: string; opp: { display_name: string } | null; }
export async function fetchHistory(limit = 50): Promise<GameRow[]> {
  const sb = supabase(); if (!sb) return [];
  const { data, error } = await sb.from('oth_games')
    .select('id,mode,ai_level,result,black_count,white_count,moves,xp_gained,played_at,opp:oth_profiles!oth_games_opp_user_id_fkey(display_name)')
    .eq('user_id', (await sb.auth.getUser()).data.user?.id ?? '00000000-0000-0000-0000-000000000000')
    .order('played_at', { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as GameRow[];
}

// ---- レベル→称号（設計書 §6） ----
export function titleFor(level: number): string {
  if (level >= 50) return '名人';
  if (level >= 40) return '皆伝';
  if (level >= 30) return '高段';
  if (level >= 20) return '有段';
  if (level >= 10) return '初段';
  if (level >= 5) return '級位者';
  return '見習い';
}
