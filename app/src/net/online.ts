// オンライン対戦（基本設計書 v1.0 §3）— Supabase Realtime: Presence待機一覧/oth_invites招待/Broadcast着手同期
// 対局進行は main.ts のゲームループへコールバックを注入する形（onRemoteMove）。
import { supabase } from '../supabase/client';
import { currentProfile, refreshProfile } from '../supabase/auth';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Opponent { id: string; display_name: string; level: number; avatar_url: string | null; wins: number; losses: number; icon_stones: boolean; }

const CB = {
  onRemoteMove: null as ((cell: number) => void) | null,
  onRemotePass: null as (() => void) | null,
  onRemoteResign: null as (() => void) | null,
  onMatchStart: null as ((isBlack: boolean, opp: Opponent, moves: string) => void) | null,
  onOpponentLeft: null as (() => void) | null,
};
export const onlineCB = CB;

let matchCh: RealtimeChannel | null = null;
export let onlineState: 'offline' | 'waiting' | 'invited' | 'playing' = 'offline';
let myInvitePoll: ReturnType<typeof setInterval> | null = null;
let currentMatchId: string | null = null;
let lastSeqSent = 0;

export function isOnlinePlaying(): boolean { return onlineState === 'playing'; }
export let onlineOpponentCache: Opponent | null = null;

// ---- ロビー（待機一覧）— 2026-09-26 実機教訓: Presence廃止・oth_queue(DB)を唯一の真実としてポーリング ----
// 旧実装は同一名channnelの多重joinで Presence が壊れ「何度やり直しても相手が表示されない」現象の原因になった。
let lobbyRender: ((list: Opponent[], me: Opponent | null) => void) | null = null;
let lobbyPoll: ReturnType<typeof setInterval> | null = null;
let lobbyBeat: ReturnType<typeof setInterval> | null = null;
export let amWaiting = false;

export async function enterLobby(render: (list: Opponent[], me: Opponent | null) => void): Promise<void> {
  lobbyRender = render;
  if (!lobbyPoll) lobbyPoll = setInterval(() => { void refreshLobby(); }, 1800); // 1.8s間隔でDB照合（即時性と帯域のバランス）
  if (!myInvitePoll) myInvitePoll = setInterval(() => { void checkInvites(); }, 1500);
  await refreshLobby();
}

async function refreshLobby(): Promise<void> {
  if (!lobbyRender) return;
  const sb = supabase(); const me = currentProfile();
  if (!sb || !me) { lobbyRender([], null); return; }
  const { data, error } = await sb.from('oth_queue')
    .select('user_id,status,updated_at,profile:oth_profiles!oth_queue_user_id_fkey(display_name,level,avatar_url,wins,losses,icon_stones)')
    .eq('status', 'waiting');
  if (error || !data) { lobbyRender([], null); return; }
  const freshAgo = Date.now() - 180_000; // 3分以内に心跳の無い行=幽霊として除外
  const rows: Opponent[] = [];
  let meRow: Opponent | null = null;
  for (const r of (data as unknown as Array<Record<string, unknown>>)) {
    if (new Date(r.updated_at as string).getTime() < freshAgo) continue;
    const p = r.profile as Record<string, unknown> | null;
    if (!p) continue;
    const o: Opponent = { id: r.user_id as string, display_name: p.display_name as string, level: p.level as number, avatar_url: (p.avatar_url as string) ?? null, wins: p.wins as number, losses: p.losses as number, icon_stones: !!p.icon_stones };
    if (o.id === me.id) meRow = o; else rows.push(o);
  }
  rows.sort((a, b) => Math.abs(a.level - me.level) - Math.abs(b.level - me.level));
  lobbyRender(rows, amWaiting ? meRow : null);
}

export async function setWaiting(on: boolean): Promise<void> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me) return;
  if (on) {
    await sb.from('oth_queue').upsert({ user_id: me.id, status: 'waiting', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    amWaiting = true;
    onlineState = 'waiting';
    if (!lobbyBeat) lobbyBeat = setInterval(() => { // 心跳: 閉じたタブ/端末を3分で幽霊化させないための寿命延長
      if (amWaiting) void sb.from('oth_queue').upsert({ user_id: me.id, status: 'waiting', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }, 60_000);
  } else {
    await sb.from('oth_queue').delete().eq('user_id', me.id);
    amWaiting = false;
    onlineState = 'offline';
    if (lobbyBeat) { clearInterval(lobbyBeat); lobbyBeat = null; }
  }
  await refreshLobby(); // 自分の行を即表示/非表示
}

// ---- 招待 ----
export async function invite(to: Opponent): Promise<'sent' | 'busy'> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me) return 'busy';
  const { data: q } = await sb.from('oth_queue').select('status,updated_at').eq('user_id', to.id).maybeSingle();
  // 一覧と同基準（3分内の心跳）で生存確認 → 幽霊待機への招待＝「既に離脱」を防止
  if (!q || q.status !== 'waiting' || Date.now() - new Date(q.updated_at as string).getTime() > 180_000) return 'busy';
  const { error } = await sb.from('oth_invites').insert({ from_user: me.id, to_user: to.id });
  if (error) return 'busy';
  onlineState = 'invited';
  void startMatch(to);   // 招待側も承諾待ちで対局開始へ進む
  return 'sent';
}

async function checkInvites(): Promise<void> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me || onlineState === 'playing') return;
  const { data } = await sb.from('oth_invites').select('id,from_user,status,created_at,from:oth_profiles!oth_invites_from_user_fkey(display_name,level,avatar_url,wins,losses,icon_stones)')
    .eq('to_user', me.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return;
  const age = Date.now() - new Date(data.created_at as string).getTime();
  if (age > 30000) {
    await sb.from('oth_invites').update({ status: 'expired' }).eq('id', data.id as string);
    return;
  }
  const f = data.from as unknown as Record<string, unknown>;
  const opp: Opponent = { id: data.from_user as string, display_name: f.display_name as string, level: f.level as number, avatar_url: (f.avatar_url as string) ?? null, wins: f.wins as number, losses: f.losses as number, icon_stones: !!f.icon_stones };
  onlineState = 'invited';
  showIncomingInvite(data.id as string, opp);
}

let onInviteUI: ((opp: Opponent, accept: () => void, decline: () => void) => void) | null = null;
export function setInviteHandler(fn: typeof onInviteUI): void { onInviteUI = fn; }

function showIncomingInvite(inviteId: string, opp: Opponent): void {
  if (!onInviteUI) return;
  onInviteUI(opp,
    async () => { await acceptInvite(inviteId, opp); },
    async () => {
      await supabase()?.from('oth_invites').update({ status: 'declined' }).eq('id', inviteId);
      onlineState = 'offline';
    });
}

async function acceptInvite(inviteId: string, opp: Opponent): Promise<void> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me) return;
  await sb.from('oth_invites').update({ status: 'accepted' }).eq('id', inviteId);
  onlineState = 'playing';
  // 招待者（黒）が oth_match_start を作り、双方が startMatch ループで合流する
  void startMatch(opp);
}

/** 招待側: 相手承諾を待って対局開始 */
async function startMatch(opp: Opponent): Promise<void> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me) return;
  const myId = me.id, oppId = opp.id;
  // 承諾済み招待が存在するかポーリング（招待側のみ進行開始）
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const { data } = await sb.from('oth_invites').select('id,from_user,to_user')
      .eq('to_user', myId).eq('from_user', oppId).eq('status', 'accepted').order('created_at', { ascending: false }).limit(1).maybeSingle();
    let accepted = !!data;
    let pair: [string, string] = data ? [data.from_user as string, data.to_user as string] : [myId, oppId];
    if (!accepted) {
      // 自分が招待側: from_user=自分 の accepted を探す
      const { data: d2 } = await sb.from('oth_invites').select('id,from_user,to_user')
        .eq('from_user', myId).eq('to_user', oppId).eq('status', 'accepted').order('created_at', { ascending: false }).limit(1).maybeSingle();
      accepted = !!d2; if (d2) pair = [d2.from_user as string, d2.to_user as string];
    }
    if (!accepted) continue;
    // 黒がマッチ作成
    const isBlack = pair[0] === myId;
    let matchId: string | null = null;
    if (isBlack) {
      const { data } = await sb.rpc('oth_match_start', { p_black: pair[0], p_white: pair[1] });
      matchId = (data as string) ?? null;
    } else {
      // 白側: 黒が作った match を待つ
      for (let k = 0; k < 15 && !matchId; k++) {
        await sleep(1000);
        const { data } = await sb.from('oth_matches').select('id').eq('black', pair[0]).eq('white', pair[1]).eq('status', 'active').order('updated_at', { ascending: false }).limit(1).maybeSingle();
        matchId = (data?.id as string) ?? null;
      }
    }
    if (!matchId) continue;
    currentMatchId = matchId; onlineOpponentCache = opp;
    await subscribeMatch(matchId, isBlack, opp);
    return;
  }
  onlineState = 'offline';
}

async function subscribeMatch(matchId: string, iAmBlack: boolean, opp: Opponent): Promise<void> {
  const sb = supabase(); if (!sb) return;
  await setWaiting(false);
  matchCh = sb.channel('oth-match:' + matchId, { config: { broadcast: { self: false } } });
  await matchCh.on('broadcast', { event: 'mv' }, ({ payload }) => {
    const p = payload as { cell: number; seq: number };
    if (p.seq <= lastSeqSent && p.seq !== lastSeqSent + 0) { /* 重複無視 */ }
    CB.onRemoteMove?.(p.cell);
  }).on('broadcast', { event: 'pass' }, () => CB.onRemotePass?.())
    .on('broadcast', { event: 'resign' }, () => CB.onRemoteResign?.())
    .on('presence', { event: 'sync' }, () => {
      const st = matchCh!.presenceState(); const n = Object.keys(st).length;
      if (n === 1) CB.onOpponentLeft?.();
    })
    .subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await matchCh!.track({ uid: currentProfile()?.id });
        CB.onMatchStart?.(iAmBlack, opp, '');
      }
    });
}

// ---- 対局中の送信・盤同期 ----
export function sendMove(cell: number): void {
  const sb = supabase(); if (!matchCh || !sb || !currentMatchId) return;
  lastSeqSent += 1;
  void matchCh.send({ type: 'broadcast', event: 'mv', payload: { cell, seq: lastSeqSent } });
  void sb.rpc('oth_match_update', { p_match: currentMatchId, p_moves: '', p_status: 'active' }).then(() => {});
}
export function sendPass(): void { void matchCh?.send({ type: 'broadcast', event: 'pass', payload: {} }); }
export function sendResign(): void { void matchCh?.send({ type: 'broadcast', event: 'resign', payload: {} }); }

/** 盤面スナップショット（復元・照合用）をDBへ保存 */
export async function saveSnapshot(movesSvg: string): Promise<void> {
  const sb = supabase(); if (!sb || !currentMatchId) return;
  await sb.rpc('oth_match_update', { p_match: currentMatchId, p_moves: movesSvg, p_status: 'active' });
}
export async function endMatch(ended = true): Promise<void> {
  const sb = supabase(); if (!sb || !currentMatchId) return;
  await sb.rpc('oth_match_update', { p_match: currentMatchId, p_moves: '', p_status: ended ? 'ended' : 'abandoned' });
  await matchCh?.unsubscribe(); matchCh = null; currentMatchId = null;
  onlineState = 'offline'; lastSeqSent = 0;
  await refreshProfile();
}

export function onboardingHooks(): typeof CB { return CB; }
export function leaveLobby(): void {
  if (myInvitePoll) { clearInterval(myInvitePoll); myInvitePoll = null; }
  if (lobbyPoll) { clearInterval(lobbyPoll); lobbyPoll = null; }
  lobbyRender = null;
  // 待機状態そのものは維持（タイトルに戻るだけ＝離脱ではない。閉じた端末は心跳停止で3分後に自動消える）
}
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

/** 起動時に一度だけ呼ぶ。セッション復元後に招待を拾えるようにする。 */
export function initOnline(): void {
  // 待機状態の残骸クリーン（再起動時は常にオフライン扱い）
  void (async () => {
    const sb = supabase(); const me = currentProfile(); if (!sb || !me) return;
    await sb.from('oth_queue').delete().eq('user_id', me.id);
  })();
}
