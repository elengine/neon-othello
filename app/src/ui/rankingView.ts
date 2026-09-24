// ランキング/履歴/プロフィール画面（設計書 S8/S9）
import { fetchRanking, myRank, fetchHistory, currentProfile, titleFor, type RankRow } from '../supabase/auth';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export async function renderRanking(): Promise<void> {
  const list = $('rank-list');
  const tab = (document.querySelector('[data-rank-tab.active]') as HTMLElement)?.dataset.rankTab ?? 'xp';
  list.innerHTML = '<li class="rank-loading">読み込み中…</li>';
  const rows = await fetchRanking(tab as 'xp' | 'wins' | 'winrate');
  const me = currentProfile();
  list.innerHTML = '';
  rows.forEach((r, i) => list.appendChild(rankRow(r, i + 1, me?.id === r.id)));
  if (me && !rows.some((r) => r.id === me.id)) {
    const rank = await myRank(tab === 'wins' ? 'wins' : 'xp');
    const sep = document.createElement('li'); sep.className = 'rank-sep'; sep.textContent = '…';
    list.appendChild(sep);
    list.appendChild(rankRow({ ...me, losses: me.losses, draws: me.draws } as RankRow, rank ?? 0, true));
  }
  const meBar = $('rank-me');
  meBar.textContent = me ? `Lv${me.level} ${titleFor(me.level)}｜${me.wins}勝${me.losses}敗${me.draws}分（連勝${me.streak}/最長${me.best_streak}）`
    : 'ログインするとあなたの順位が出ます';
}

function rankRow(r: RankRow, pos: number, isMe: boolean): HTMLElement {
  const li = document.createElement('li');
  li.className = 'rank-item' + (isMe ? ' me' : '');
  const wr = r.wins + r.losses + r.draws > 0 ? Math.round(100 * r.wins / (r.wins + r.losses + r.draws)) : 0;
  li.innerHTML = `<span class="rank-pos">${pos}</span>
    <img class="rank-ava" src="${escapeAttr(r.avatar_url ?? '')}" alt="" onerror="this.style.visibility='hidden'">
    <span class="rank-name">${escapeHtml(r.display_name)}</span>
    <span class="rank-lv">Lv${r.level} ${escapeHtml(titleFor(r.level))}</span>
    <span class="rank-num">${r.wins}勝 ${wr}%</span>`;
  return li;
}

export async function renderHistory(): Promise<void> {
  const list = $('history-list');
  list.innerHTML = '<li class="rank-loading">読み込み中…</li>';
  const rows = await fetchHistory(30);
  const me = currentProfile();
  list.innerHTML = '';
  if (!me) { list.innerHTML = '<li class="rank-loading">ログインすると履歴が見られます</li>'; return; }
  if (rows.length === 0) { list.innerHTML = '<li class="rank-loading">まだ対局記録がありません</li>'; return; }
  for (const g of rows) {
    const li = document.createElement('li');
    li.className = 'hist-item';
    const d = new Date(g.played_at);
    const modeTxt = g.mode === 'ai' ? `AI(Lv${g.ai_level ?? '?'})` : g.mode === 'online' ? 'オンライン' : 'ローカル';
    li.innerHTML = `<span class="hist-date">${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>
      <span class="hist-mode">${modeTxt}</span>
      <span class="hist-result r-${g.result}">${g.result === 'win' ? '勝ち' : g.result === 'lose' ? '負け' : '引き分け'}</span>
      <span class="hist-score">${g.black_count}-${g.white_count}・${g.moves}手</span>
      <span class="hist-xp">+${g.xp_gained}</span>`;
    list.appendChild(li);
  }
}

function escapeHtml(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }
function escapeAttr(s: string): string { return escapeHtml(s); }
