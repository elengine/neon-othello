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
  onInviteDeclined: null as ((opp: Opponent) => void) | null,
  onInviteTimeout: null as ((opp: Opponent) => void) | null,
  onOpponentBye: null as (() => void) | null,
};
export const onlineCB = CB;

let matchCh: RealtimeChannel | null = null;
let matchWatch: ReturnType<typeof setInterval> | null = null;   // v2.1.2: byeブロードキャスト取りこぼし時のDBフォールバック監視
let oppLeftNotified = false;   // 切断/byeハンドラの多重発火防止
export let onlineState: 'offline' | 'waiting' | 'invited' | 'playing' = 'offline';
export function getOnlineState(): typeof onlineState { return onlineState; }
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
let byeSent = false;   // v2.1.2: sendBye→unsubscribe の競合防止（endMatch側で重複送信しない）

export async function enterLobby(render: (list: Opponent[], me: Opponent | null) => void): Promise<void> {
  lobbyRender = render;
  if (!lobbyPoll) lobbyPoll = setInterval(() => { void refreshLobby(); }, 1800); // 1.8s間隔でDB照合（即時性と帯域のバランス）
  if (!myInvitePoll) myInvitePoll = setInterval(() => { void checkInvites(); }, 1500);
  await refreshLobby();
}

/** v2.1.2: フォア復帰時に心跳を即更新し、一覧に即復帰させる（トグルONと実待機状態の同期窓を縮める） */
export async function rebeat(): Promise<void> {
  if (!amWaiting) return;
  const sb = supabase(); const me = currentProfile(); if (!sb || !me) return;
  await sb.from('oth_queue').upsert({ user_id: me.id, status: 'waiting', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
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
  const { data: ins, error } = await sb.from('oth_invites').insert({ from_user: me.id, to_user: to.id }).select('id').single();
  if (error || !ins) return 'busy';
  onlineState = 'invited';
  void awaitInviteThenStart(ins.id as string, to);   // この招待IDの応答だけを待つ（v1.5.0: 古いaccepted行の流用バグ修正）
  return 'sent';
}

/** 招待側: 自分が出した招待IDの status 変化（accepted/declined/expired）だけを監視して合流 */
async function awaitInviteThenStart(inviteId: string, opp: Opponent): Promise<void> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me) return;
  const myId = me.id, oppId = opp.id;
  onlineState = 'invited';
  for (let i = 0; i < 40; i++) { // 最大40秒
    await sleep(1000);
    const { data } = await sb.from('oth_invites').select('status').eq('id', inviteId).maybeSingle();
    const st = data?.status as string | undefined;
    if (st === 'declined') {
      onlineState = amWaiting ? 'waiting' : 'offline';
      CB.onInviteDeclined?.(opp);
      void refreshLobby();
      return;
    }
    if (st !== 'accepted') continue;
    // 承諾された → 招待者（自分）=黒 でマッチ作成（既存RPC・2値版）
    const { data: md } = await sb.rpc('oth_match_start', { p_black: myId, p_white: oppId });
    const matchId = (md as string) ?? null;
    if (!matchId) { CB.onInviteTimeout?.(opp); onlineState = amWaiting ? 'waiting' : 'offline'; return; }
    currentMatchId = matchId; onlineOpponentCache = opp;
    onlineState = 'playing';
    await subscribeMatch(matchId, true, opp);
    return;
  }
  // タイムアウト: 招待を行ごと expired にして消す（相手には出っ放しにしない）
  await sb.from('oth_invites').update({ status: 'expired' }).eq('id', inviteId).eq('status', 'pending');
  if (onlineState === 'invited') {
    onlineState = amWaiting ? 'waiting' : 'offline';
    CB.onInviteTimeout?.(opp);
    void refreshLobby();
  }
}

async function checkInvites(): Promise<void> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me || onlineState === 'playing' || onlineState === 'invited') return;
  const { data } = await sb.from('oth_invites').select('id,from_user,status,created_at,from:oth_profiles!oth_invites_from_user_fkey(display_name,level,avatar_url,wins,losses,icon_stones)')
    .eq('to_user', me.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return;
  const age = Date.now() - new Date(data.created_at as string).getTime();
  if (age > 45000) { // 招待側の待機が40秒で切れるため、45秒過ぎた自分宛pendingのみ消す
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
      onlineState = amWaiting ? 'waiting' : 'offline';
      void refreshLobby();
    });
}

/** 招待された側: 承諾 → 自分宛招待の accepted を見張り、招待側が作った match に合流する */
async function acceptInvite(inviteId: string, opp: Opponent): Promise<void> {
  const sb = supabase(); const me = currentProfile(); if (!sb || !me) return;
  const myId = me.id, inviterId = opp.id;
  await sb.from('oth_invites').update({ status: 'accepted' }).eq('id', inviteId);
  onlineState = 'invited'; // 対局作成待ち
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    // 招待側がマッチを作ったか（招待された側=白）
    const { data } = await sb.from('oth_matches').select('id')
      .eq('black', inviterId).eq('white', myId).eq('status', 'active')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const matchId = (data?.id as string) ?? null;
    if (matchId) {
      currentMatchId = matchId; onlineOpponentCache = opp;
      onlineState = 'playing';
      await subscribeMatch(matchId, false, opp);
      return;
    }
    // 招待側が途中で切れた（expired/削除）ら待つのをやめる
    const { data: inv } = await sb.from('oth_invites').select('status').eq('id', inviteId).maybeSingle();
    if (!inv || inv.status === 'expired') break;
  }
  onlineState = amWaiting ? 'waiting' : 'offline';
  CB.onInviteTimeout?.(opp);
  void refreshLobby();
}

async function subscribeMatch(matchId: string, iAmBlack: boolean, opp: Opponent): Promise<void> {
  const sb = supabase(); if (!sb) return;
  await setWaiting(false);
  oppLeftNotified = false; byeSent = false;
  if (matchWatch) { clearInterval(matchWatch); matchWatch = null; }
  matchCh = sb.channel('oth-match:' + matchId, { config: { broadcast: { self: false } } });
  await matchCh.on('broadcast', { event: 'mv' }, ({ payload }) => {
    const p = payload as { cell: number; seq: number };
    if (p.seq <= lastSeqSent && p.seq !== lastSeqSent + 0) { /* 重複無視 */ }
    CB.onRemoteMove?.(p.cell);
  }).on('broadcast', { event: 'pass' }, () => CB.onRemotePass?.())
    .on('broadcast', { event: 'resign' }, () => CB.onRemoteResign?.())
    .on('broadcast', { event: 'bye' }, () => { oppLeftNotified = true; CB.onOpponentBye?.(); })   // 正常終了操作（ゲーム終了/再挑戦等）
    .on('presence', { event: 'sync' }, () => {
      if (oppLeftNotified) return;
      const st = matchCh!.presenceState(); const n = Object.keys(st).length;
      if (n === 1) { oppLeftNotified = true; CB.onOpponentLeft?.(); }  // 多重syncでの二重発火防止
    })
    .subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await matchCh!.track({ uid: currentProfile()?.id });
        CB.onMatchStart?.(iAmBlack, opp, '');
        // v2.1.2: bye/resignブロードキャストがRealtime断で相手に届かなかった場合の保険。
        // 5秒ごとにマッチ行のDB status を見て ended/abandoned なら onOpponentBye と同扱いで発火。
        if (!matchWatch) matchWatch = setInterval(() => {
          if (onlineState !== 'playing' || !currentMatchId || byeSent) return;
          void (async () => {
            const { data } = await sb.from('oth_matches').select('status').eq('id', currentMatchId!).maybeSingle();
            if (data && (data.status === 'ended' || data.status === 'abandoned')) {
              oppLeftNotified = true; CB.onOpponentBye?.();
            }
          })();
        }, 5000);
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
/** 対局中に「ゲーム終了/再挑戦/タイトルへ」等で離脱する旨を先に伝える（相手は即不戦勝表示できる） */
export function sendBye(): void { if (matchCh && !byeSent) { byeSent = true; void matchCh.send({ type: 'broadcast', event: 'bye', payload: {} }); } }

/** 盤面スナップショット（復元・照合用）をDBへ保存 */
export async function saveSnapshot(movesSvg: string): Promise<void> {
  const sb = supabase(); if (!sb || !currentMatchId) return;
  await sb.rpc('oth_match_update', { p_match: currentMatchId, p_moves: movesSvg, p_status: 'active' });
}
export async function endMatch(ended = true): Promise<void> {
  const sb = supabase(); if (!sb || !currentMatchId) return;
  // v2.1.2: 未終局離脱（abandoned）のみbyeを送る。自然終了は双方が最終手で自局判定済みのためbye不要
  //（送ると相手のローカル終局判定と競合して誤「不戦勝」になり得る）。送信後フラッシュ待ち→DB更新→unsubscribe。
  if (!ended && !byeSent && matchCh) { byeSent = true; void matchCh.send({ type: 'broadcast', event: 'bye', payload: {} }); await sleep(80); }
  await sb.rpc('oth_match_update', { p_match: currentMatchId, p_moves: '', p_status: ended ? 'ended' : 'abandoned' });
  await matchCh?.unsubscribe(); matchCh = null; currentMatchId = null;
  if (matchWatch) { clearInterval(matchWatch); matchWatch = null; }
  onlineState = 'offline'; lastSeqSent = 0; byeSent = false;
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
