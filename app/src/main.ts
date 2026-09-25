// NEON OTHELLO — メイン（P2c: タイトル/AI対戦/石色設定まで）
import './style.css';
import {
  initialBoard, applyMove, applyPass, gameStatus, stoneCount, winner,
  legalBB, BLACK, WHITE, type Stone,
} from './core/board';
import { aiMove } from './core/ai';
import { makeRenderer, NEON_DEFAULT, CLASSIC } from './render/renderer';
import { PRESETS, prefToTheme, savePref, loadPref, loadImage } from './ui/stonePrefs';
import gsap from 'gsap';
import { initAuth, currentProfile, loginWithGoogle, logout, submitGame, titleFor, refreshProfile } from './supabase/auth';
import { supabaseConfigured } from './supabase/client';
import { celebrateLevelUp } from './ui/celebrate';
import { sfx, toggleMute, setSound } from './audio/sfx';
import { renderRanking, renderHistory } from './ui/rankingView';
import { initOnline, enterLobby, setWaiting, invite, isOnlinePlaying, onlineCB, setInviteHandler, endMatch, sendMove, sendPass, sendResign, saveSnapshot, type Opponent } from './net/online';
import { encodeMoves } from './core/board';

declare const __APP_VERSION__: string | undefined;
export const APP_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0');

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

type Screen = 'title' | 'difficulty' | 'game' | 'result' | 'settings' | 'ranking' | 'lobby';
const state = {
  screen: 'title' as Screen,
  board: initialBoard(),
  aiLevel: 3,
  humanStone: BLACK as Stone,
  thinking: false,
  pendingFlip: { cells: [] as number[], anim: 0, fromCell: -1 },
  prevLevel: 1,
  mode: 'ai' as 'ai' | 'online',
  opp: null as Opponent | null,
  oppTimeout: 0 as ReturnType<typeof setInterval> | 0,
  theme: NEON_DEFAULT,
  themeName: 'neon' as 'neon' | 'classic' | 'custom',
};

type PaceMode = 'normal' | 'slow' | 'fast' | 'jitter';
const Prefs = {
  pace: 'jitter' as PaceMode,   // デフォルトはゆらぎ
  sound: true,
  mkRing: 0.9,                  // マーカー外枠の不透明度 (0.1〜1)
  mkDot: 1.0,                   // マーカー中心ドットの不透明度
};
const PACE_KEY = 'otv2:prefs';
function savePrefs(): void { try { localStorage.setItem(PACE_KEY, JSON.stringify({ pace: Prefs.pace, sound: Prefs.sound, mkRing: Prefs.mkRing, mkDot: Prefs.mkDot })); } catch { /* 非対応環境 */ } }
function loadPrefs(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(PACE_KEY) ?? '{}');
    if (raw.pace) Prefs.pace = raw.pace;
    if (typeof raw.sound === 'boolean') Prefs.sound = raw.sound;
    if (typeof raw.mkRing === 'number') Prefs.mkRing = raw.mkRing;
    if (typeof raw.mkDot === 'number') Prefs.mkDot = raw.mkDot;
  } catch { /* 破損時は既定 */ }
}

let renderer: ReturnType<typeof makeRenderer>;
let paused = false;

function setPaused(on: boolean): void {
  paused = on;
  $('overlay-pause').classList.toggle('show', on);
  $('btn-pause').textContent = on ? '▶' : '⏸';
  if (on) cancelAI();               // AI思考待ちを停止（再開時に再スケジュール）
  else if (state.screen === 'game' && state.board.turn !== state.humanStone
           && gameStatus(state.board) === 'playing' && !aiTimer) { void scheduleAIReturn(); }
}

function scheduleAIReturn(): void { scheduleAI(); }  // 再開時のAI再開（AI手番のときだけここに到達）


function show(s: Screen): void {
  state.screen = s;
  for (const id of ['screen-title', 'screen-difficulty', 'screen-game', 'screen-result', 'screen-settings', 'screen-ranking', 'screen-lobby']) {
    $(id).classList.toggle('active', id === 'screen-' + s);
  }
  if (s === 'game') layoutBoard();
  if (s === 'ranking') { void renderRanking(); void renderHistory(); }
}

function layoutBoard(): void {
  const stage = $('board-stage');
  const rect = stage.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  renderer.resize(size);
  drawAll({ legal: true });
}

function drawAll(opts: { legal?: boolean } = {}): void {
  renderer.draw(state.board, {
    legal: opts.legal && gameStatus(state.board) === 'playing' && !state.thinking,
    last: true,
    flippedCells: state.pendingFlip.cells,
    flipAnim: state.pendingFlip.cells.length ? state.pendingFlip.anim : undefined,
  });
  const { black, white } = stoneCount(state.board);
  // 石数は対局が終わるまで非表示（ご指示: 終了時までわからないように）
  const over = gameStatus(state.board) === 'over';
  $('hud-black-count').textContent = over ? String(black) : '　';
  $('hud-white-count').textContent = over ? String(white) : '　';
  // 手番は騎手アイコンの光強調で示す（文言はなし）。
  // AI思考中は盤面上に透過オーバーレイで表示（盤外HUDには出さない）
  if (gameStatus(state.board) === 'over') $('hud-me-name').textContent = '対局終了';
  const meOn = state.board.turn === state.humanStone;
  // 手番は【アイコンの外側エリア（対戦者バー全体）】の枠+背景色で強調
  const meBar = document.querySelector('.hud-me')?.closest('footer') ?? null;
  const oppBar = document.querySelector('.hud-opp')?.closest('header') ?? null;
  const live = gameStatus(state.board) !== 'over';
  meBar?.classList.toggle('turn-side', Boolean(live && meOn && !state.thinking));
  oppBar?.classList.toggle('turn-side', Boolean(live && !meOn && !state.thinking));
  if (state.thinking) oppBar?.classList.add('turn-side');
  $('think-overlay').classList.toggle('show', state.thinking);
}

function onBoardTap(ev: PointerEvent): void {
  if (paused || state.screen !== 'game' || state.thinking || gameStatus(state.board) === 'over') return;
  if (state.mode !== 'ai' || state.aiLevel !== 0) {
    if (state.board.turn !== state.humanStone) return;   // 2人対戦以外: 自分の手番のみ
  }
  const canvas = $('board') as unknown as HTMLCanvasElement;
  const cell = renderer.cellAt(ev.clientX, ev.clientY, canvas.getBoundingClientRect());
  if (cell === null) return;
  const r = applyMove(state.board, cell);
  if (!r.ok) return;
  playSound('place');
  lastMoves.push(cell);
  state.pendingFlip = { cells: r.flipped, anim: 1, fromCell: cell };
  state.board = r.board;
  if (state.mode === 'online') { sendMove(cell); void saveSnapshot(encodeMoves(lastMoves)); }
  animateFlip(() => {
    state.pendingFlip = { cells: [], anim: 0, fromCell: -1 };
    checkTurn();
  });
}

function animateFlip(done: () => void): void {
  const t = { v: 1 };
gsap.to(t, {
    v: 0, duration: 0.42, ease: 'power1.inOut',
    onUpdate: () => { state.pendingFlip.anim = t.v; drawAll(); },
    onComplete: () => { if (playSound('flip', state.pendingFlip.cells.length), true) done(); },
  });
}

function checkTurn(): void {
  drawAll({ legal: true });
  if (gameStatus(state.board) === 'over') { finishGame(); return; }
  if (legalBB(state.board.bb, state.board.turn) === 0n) {
    // パス発生
    $('pass-toast').classList.add('show');
    playSound('pass');
    setTimeout(() => $('pass-toast').classList.remove('show'), 1400);
    if (state.mode === 'online' && state.board.turn === state.humanStone) sendPass();
    state.board = applyPass(state.board);
    if (gameStatus(state.board) === 'over') { finishGame(); return; }
  }
  if (state.mode === 'online') { startTurnTimer(); return; } // AI禁止・相手待ちタイマー
  if (state.aiLevel === 0) return;                          // 2人対戦: 交代で両者タップ
  if (state.board.turn !== state.humanStone) scheduleAI();
}

function startTurnTimer(): void {
  stopTurnTimer();
  if (state.board.turn === state.humanStone) return;
  const t0 = Date.now();
  const hud = $('hud-turn');
  state.oppTimeout = setInterval(() => {
    const left = Math.max(0, 60 - Math.floor((Date.now() - t0) / 1000));
    hud.textContent = `相手の番（残り${left}秒）`;
    if (left === 10) playSound('warn');
    if (left <= 0) {
      // 時間切れ＝相手パス扱い（設計書 §3.2）
      onlineCB.onRemotePass?.();
    }
  }, 1000);
}
function stopTurnTimer(): void { if (state.oppTimeout) clearInterval(state.oppTimeout); state.oppTimeout = 0; }

// ---- コンピュータの打つ速度（普通/遅い/早い/ゆらぎ）----
const PACE_MS: Record<PaceMode, [number, number]> = {
  normal: [500, 900], slow: [1500, 2400], fast: [120, 260], jitter: [300, 2600],
};
function aiDelay(): number {
  const [lo, hi] = PACE_MS[Prefs.pace];
  return Prefs.pace === 'jitter'
    ? Math.round(lo + Math.pow(Math.random(), 2.6) * (hi - lo))  // 秒級まで伸びる悩み
    : Math.round(lo + Math.random() * (hi - lo));
}
let aiTimer = 0;
function cancelAI(): void { if (aiTimer) { clearTimeout(aiTimer); aiTimer = 0; state.thinking = false; drawAll(); } }

function scheduleAI(): void {
  state.thinking = true;
  drawAll();
  aiTimer = setTimeout(() => {
    aiTimer = 0;
    const m = aiMove(state.board, state.aiLevel);
    if (m.pass) {
      state.board = applyPass(state.board);
      state.thinking = false;
      checkTurn();
      return;
    }
    const r = applyMove(state.board, m.cell);
    state.thinking = false;
    if (!r.ok) { state.board = applyPass(state.board); checkTurn(); return; }
    playSound('place');
    lastMoves.push(m.cell);
    state.pendingFlip = { cells: r.flipped, anim: 1, fromCell: m.cell };
    state.board = r.board;
    animateFlip(() => {
      state.pendingFlip = { cells: [], anim: 0, fromCell: -1 };
      checkTurn();
    });
  }, aiDelay());
}

let lastMoves: number[] = [];

async function finishGame(): Promise<void> {
  const w = winner(state.board);
  const { black, white } = stoneCount(state.board);
  const localMode = state.mode === 'ai' && state.aiLevel === 0;
  const text = w === 'draw' ? '引き分け'
    : localMode ? (w === BLACK ? '黒の勝ち！' : '白の勝ち！')
    : (w === state.humanStone ? 'あなたの勝ち！' : 'AIの勝ち');
  $('result-text').textContent = text;
  const meIsBlack = state.humanStone === BLACK;
  const localModeNow = state.mode === 'ai' && state.aiLevel === 0;
  const myCnt = meIsBlack ? black : white;
  const oppCnt = meIsBlack ? white : black;
  $('result-detail').textContent = localModeNow
    ? `黒 ${black} — 白 ${white}（全${state.board.moveCount}手）`
    : `あなた ${myCnt} — 相手 ${oppCnt}（全${state.board.moveCount}手）`;
  show('result');
  playSound(w === 'draw' ? 'draw' : (w === state.humanStone ? 'win' : 'lose'));
  // クラウド投稿（ログイン時）→ 獲得XP/レベルアップ演出
  const me = currentProfile();
  const badge = $('result-xp');
  stopTurnTimer();
  if (state.mode === 'online') {
    await endMatch();
    document.body.classList.remove('online-game');
    if (!me) { show('title'); return; }
  }
  if (me) {
    badge.textContent = '戦績を保存中…';
    try {
      const r = await submitGame({
        mode: state.mode, result: w === 'draw' ? 'draw' : (w === state.humanStone ? 'win' : 'lose'),
        ai_level: state.mode === 'ai' ? state.aiLevel : undefined, black_count: black, white_count: white,
        moves: state.board.moveCount, moves_svg: encodeMoves(lastMoves),
        opp_user: state.mode === 'online' ? (state.opp?.id ?? null) : null,
      });
      if (r) {
        badge.textContent = `＋${r.xp_gained} XP（Lv${r.new_level} ${titleFor(r.new_level)}）`;
        if (r.leveled_to) setTimeout(() => celebrateLevelUp(r.leveled_to!, state.prevLevel, r.xp), 650);
      } else badge.textContent = '（保存失敗: 記録は端末内のみ）';
    } catch (e) {
      const msg = (e as Error).message ?? '';
      badge.textContent = msg.includes('duplicate')
        ? '（この対局はすでに記録済みです）'
        : `（保存エラー: ${msg}）`;    // 次回の再現時に原因文字列が画面で判明する
    }
    state.prevLevel = me.level;
  } else badge.textContent = 'AI対戦のみ: ログインで戦績とレベルが保存されます';
}

// ---- SE（sfx.ts・ミュート永続設定追従） ----
function playSound(kind: string, n = 1): void {
  if (!Prefs.sound) return;   // 設定画面のサウンド設定を最優先
  if (kind === 'place') sfx.place();
  else if (kind === 'flip') sfx.flip(n);
  else if (kind === 'win') sfx.win();
  else if (kind === 'lose') sfx.lose();
  else if (kind === 'draw') sfx.draw();
  else if (kind === 'warn') sfx.warn();
  else if (kind === 'invite') sfx.invite();
  else if (kind === 'pass') sfx.pass();
}

// ---- 石色テーマ ----
function applyTheme(): void {
  state.theme = state.themeName === 'classic' ? CLASSIC : NEON_DEFAULT;
  state.theme.markerRing = Prefs.mkRing;
  state.theme.markerDot = Prefs.mkDot;
  document.documentElement.style.setProperty('--stone-black', state.theme.black);
  document.documentElement.style.setProperty('--stone-white', state.theme.white);
  renderer = makeRenderer($('board') as unknown as HTMLCanvasElement, state.theme);
}

async function setPref(black: string, white: string, glow: string, boardBg: string, iconOn: boolean): Promise<void> {
  const th = prefToTheme({ black, white, glow, boardBg });
  th.markerRing = Prefs.mkRing; th.markerDot = Prefs.mkDot;
  if (iconOn && currentProfile()?.avatar_url) {
    const im = await loadImage(currentProfile()!.avatar_url!);
    // 自分の石（黒側=先手想定）にアイコン。相手のアイコンはオンライン時のみ他モジュールで設定
    th.blackIcon = im;
  }
  state.theme = th; state.themeName = 'custom';
  document.documentElement.style.setProperty('--stone-black', black);
  document.documentElement.style.setProperty('--stone-white', white);
  renderer = makeRenderer($('board') as unknown as HTMLCanvasElement, state.theme);
  if (state.screen === 'game') layoutBoard(); else drawAll();
  await savePref({ black, white, glow, boardBg }, iconOn);
}

async function restorePref(): Promise<void> {
  const lp = await loadPref(); if (!lp) return;
  ($('chk-icon') as unknown as HTMLInputElement).checked = lp.iconStones;
  await setPref(lp.pref.black, lp.pref.white, lp.pref.glow, lp.pref.boardBg, lp.iconStones);
  (document.getElementById('pick-black') as HTMLInputElement).value = lp.pref.black;
  (document.getElementById('pick-white') as HTMLInputElement).value = lp.pref.white;
  const ps = document.querySelector(`[data-preset]`) as HTMLElement | null; void ps;
  document.querySelectorAll('[data-preset]').forEach((x) => x.classList.remove('picked'));
}

// ---- 起動 ----
export function boot(): void {
  $('app-version').textContent = 'v' + APP_VERSION;
  renderer = makeRenderer($('board') as unknown as HTMLCanvasElement, state.theme);

  $('btn-ai').addEventListener('click', () => show('difficulty'));
  $('btn-online').addEventListener('click', () => {
    if (!supabaseConfigured()) { toast('サーバー未接続: 先にDB SQLをSupabaseで実行してください'); return; }
    if (!currentProfile()) { toast('オンライン対戦はGoogleログインが必要です'); loginWithGoogle(); return; }
    void enterLobby(renderLobby); show('lobby'); renderLobby([]); // 自分宛招待の拾得もlobby内で監視
    const w = ($('chk-wait') as unknown as HTMLInputElement);
    w.checked = false;
  });
  $('back-lobby').addEventListener('click', () => { void setWaiting(false); show('title'); });
  ($('chk-wait') as unknown as HTMLInputElement).addEventListener('change', async (e) => {
    await setWaiting((e.target as HTMLInputElement).checked); renderLobby(lastLobby);
  });
  setInviteHandler((opp, accept, decline) => {
    $('invite-text').textContent = `${opp.display_name}（Lv${opp.level}）から対戦招待`;
    playSound('invite');
    $('invite-modal').classList.add('show');
    $('btn-accept').onclick = () => { $('invite-modal').classList.remove('show'); accept(); };
    $('btn-decline').onclick = () => { $('invite-modal').classList.remove('show'); decline(); };
  });
  onlineCB.onMatchStart = (iAmBlack, opp) => {
    state.mode = 'online'; state.opp = opp; state.humanStone = iAmBlack ? BLACK : WHITE;
    document.body.classList.add('online-game');
    state.board = initialBoard(); lastMoves = [];
    show('game'); layoutBoard();
    refreshPlayerLabels();
    toast(`対戦開始！ ${opp.display_name}（Lv${opp.level}） vs あなた${iAmBlack ? '（黒=先手）' : '（白=後手）'}`);
  };
  onlineCB.onRemoteMove = (cell) => {
    if (state.screen !== 'game' || state.mode !== 'online') return;
    stopTurnTimer();
    const r = applyMove(state.board, cell);
    if (!r.ok) return;
    lastMoves.push(cell);
    playSound('place');
    state.pendingFlip = { cells: r.flipped, anim: 1, fromCell: cell };
    state.board = r.board;
    animateFlip(() => { state.pendingFlip = { cells: [], anim: 0, fromCell: -1 }; void saveSnapshot(encodeMoves(lastMoves)); checkTurn(); });
  };
  onlineCB.onRemotePass = () => {
    if (state.screen !== 'game' || state.mode !== 'online') return;
    stopTurnTimer(); toast('相手は打てません（パス）');
    state.board = applyPass(state.board);
    if (gameStatus(state.board) === 'over') { finishGame(); return; }
    checkTurn();
    drawAll({ legal: true });   // パス後: 合法手マーカーを復元
  };
  onlineCB.onRemoteResign = async () => { stopTurnTimer(); toast('相手が投了しました'); await endMatch(); finishGame(); };
  onlineCB.onOpponentLeft = async () => {
    if (!isOnlinePlaying()) return;
    toast('相手が切断されました（60秒以内に復帰ないと不戦勝）');
    let sec = 0;
    const iv = setInterval(async () => {
      sec += 1;
      if (sec >= 60) { clearInterval(iv); if (isOnlinePlaying()) { await endMatch(); finishGame(); } }
    }, 1000);
  };
  $('btn-local').addEventListener('click', startLocal);
  $('btn-settings').addEventListener('click', () => show('settings'));
  $('btn-ranking').addEventListener('click', () => show('ranking'));
  $('btn-login').addEventListener('click', () => currentProfile() ? void logout().then(refreshChrome) : loginWithGoogle());
  $('back-title').addEventListener('click', () => show('title'));
  $('back-title2').addEventListener('click', () => show('title'));

  for (const lv of [1, 2, 3, 4, 5]) {
    const card = document.querySelector(`[data-level="${lv}"]`);
    card?.addEventListener('click', () => startAI(lv));
  }

  $('board').addEventListener('pointerdown', onBoardTap as EventListener);
  $('btn-resign').addEventListener('click', async () => {
    if (state.mode !== 'online' || state.screen !== 'game') return;
    sendResign(); stopTurnTimer(); await endMatch();
    $('result-text').textContent = '投了しました';
    $('result-detail').textContent = '';
    show('result');
  });
  $('btn-again').addEventListener('click', () => { state.board = initialBoard(); lastMoves = []; show('game'); layoutBoard(); drawAll({ legal: true }); });
  $('btn-result-title').addEventListener('click', () => show('title'));
  $('btn-pause').addEventListener('click', () => setPaused(!paused));
  $('btn-resume').addEventListener('click', () => setPaused(false));
  $('btn-quit').addEventListener('click', () => { setPaused(false); stopTurnTimer(); cancelAI(); if (state.mode === 'online') { void endMatch(); document.body.classList.remove('online-game'); } state.board = initialBoard(); lastMoves = []; show('title'); });
  ($('btn-mute') as HTMLElement).addEventListener('click', (e) => {
    const m = toggleMute();
    Prefs.sound = !m; savePrefs();   // 設定画面チェックと同期
    ($('chk-sound') as unknown as HTMLInputElement).checked = !m;
    (e.currentTarget as HTMLElement).textContent = m ? '🔇' : '🔊';
  });
  $('back-rank').addEventListener('click', () => show('title'));
  document.querySelectorAll('[data-rank-tab]').forEach((el) => el.addEventListener('click', () => {
    document.querySelectorAll('[data-rank-tab]').forEach((x) => x.classList.toggle('active', x === el));
    void renderRanking();
  }));

  // 設定画面: プリセットカード生成
  const grid = $('preset-grid');
  PRESETS.forEach((ps) => {
    const b = document.createElement('button');
    b.className = 'lv-card'; b.dataset.preset = ps.name;
    b.innerHTML = `<span class="lv-name">${ps.name}</span><span class="swatch" style="background:linear-gradient(90deg,${ps.pref.black},${ps.pref.white})"></span>`;
    b.addEventListener('click', () => {
      setPref(ps.pref.black, ps.pref.white, ps.pref.glow, ps.pref.boardBg, ($('chk-icon') as unknown as HTMLInputElement).checked);
      grid.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('picked', x === b));
    });
    grid.appendChild(b);
  });
  const cpB = $('pick-black') as unknown as HTMLInputElement, cpW = $('pick-white') as unknown as HTMLInputElement;
  const onPick = () => setPref(cpB.value, cpW.value, state.theme.glow, state.theme.boardBg, ($('chk-icon') as unknown as HTMLInputElement).checked);
  cpB.addEventListener('input', onPick); cpW.addEventListener('input', onPick);
  $('chk-icon').addEventListener('change', (e) => {
    const c = (e.target as HTMLInputElement);
    setPref(cpB.value, cpW.value, state.theme.glow, state.theme.boardBg, c.checked);
  });

  // コンピュータの打つ速度（普通/遅い/早い/ゆらぎ）
  const paceRow = $('pace-row');
  const paintPace = () => paceRow.querySelectorAll('.pace-btn').forEach((x) =>
    x.classList.toggle('picked', (x as HTMLElement).dataset.pace === Prefs.pace));
  paceRow.querySelectorAll('.pace-btn').forEach((el) => el.addEventListener('click', () => {
    Prefs.pace = ((el as HTMLElement).dataset.pace ?? 'normal') as PaceMode;
    savePrefs(); paintPace();
  }));

  // サウンド（即プレイへ反映・永続）
  const soundChk = $('chk-sound') as unknown as HTMLInputElement;
  soundChk.addEventListener('change', () => {
    Prefs.sound = soundChk.checked;
    savePrefs();
    setSound(Prefs.sound);   // 音の実体（Howler）へ即反映。HUD絵文字も同调用
    ($('btn-mute') as HTMLElement).textContent = Prefs.sound ? '🔊' : '🔇';
  });
  loadPrefs();
  paintPace();
  soundChk.checked = Prefs.sound;

  // マーカー不透明度スライダー（即反映・永続・%表示更新）
  const mkR = $('mk-ring') as unknown as HTMLInputElement, mkD = $('mk-dot') as unknown as HTMLInputElement;
  mkR.value = String(Math.round(Prefs.mkRing * 100));
  mkD.value = String(Math.round(Prefs.mkDot * 100));
  ($('mk-ring-v') as HTMLElement).textContent = `${Math.round(Prefs.mkRing * 100)}%`;
  ($('mk-dot-v') as HTMLElement).textContent = `${Math.round(Prefs.mkDot * 100)}%`;
  const applyMk = () => {
    Prefs.mkRing = Number(mkR.value) / 100; Prefs.mkDot = Number(mkD.value) / 100;
    ($('mk-ring-v') as HTMLElement).textContent = `${mkR.value}%`;
    ($('mk-dot-v') as HTMLElement).textContent = `${mkD.value}%`;
    state.theme.markerRing = Prefs.mkRing; state.theme.markerDot = Prefs.mkDot;
    makeRenderer($('board') as unknown as HTMLCanvasElement, state.theme);
    drawAll();
    savePrefs();
  };
  mkR.addEventListener('input', applyMk); mkD.addEventListener('input', applyMk);
  setSound(Prefs.sound);   // 初期化時: 端末保存値を音の実体へ
  ($('btn-mute') as HTMLElement).textContent = Prefs.sound ? '🔊' : '🔇';

  // タイトルのグローアニメ（ネオンテトリス風: neonPulse/ctaGlow はCSS実装、ここでは picked 状態の初期復元のみ）

  window.addEventListener('resize', () => { if (state.screen === 'game') layoutBoard(); });
  screen.orientation?.addEventListener?.('change', () => setTimeout(() => { if (state.screen === 'game') layoutBoard(); }, 120));

  applyTheme(); show('title');
  refreshPlayerLabels();
  void initAuth(async (s) => {
    if (s) await refreshProfile();
    refreshChrome();
    refreshPlayerLabels();
    if (s) { void restorePref(); void initOnline(); }
  });
}

// ---- 対戦者ラベル: アイコン右の名前 ----
function refreshPlayerLabels(): void {
  const me = currentProfile();
  const myName = me?.display_name?.slice(0, 12) ?? 'あなた';
  const bottomLabel = $('hud-me-name');
  const topLabel = $('hud-opp-name');
  if (state.mode === 'online' && state.opp) {
    topLabel!.textContent = `${state.opp.display_name.slice(0, 12)} Lv${state.opp.level}`;
    bottomLabel!.textContent = myName;
  } else if (state.aiLevel === 0) {
    topLabel!.textContent = 'プレイヤー２';   // 上=白
    bottomLabel!.textContent = 'プレイヤー１'; // 下=黒
  } else {
    topLabel!.textContent = `AI Lv${state.aiLevel}`;
    bottomLabel!.textContent = myName;
  }
}

// ---- 対局開始 ----
function startAI(lv: number): void {
  state.mode = 'ai'; state.aiLevel = lv; state.humanStone = BLACK;
  $('hud-top').querySelector('span:nth-child(2)')!.textContent = `AI Lv${lv}`;
  document.body.classList.remove('online-game');
  state.board = initialBoard(); lastMoves = [];
  show('game'); layoutBoard(); drawAll({ legal: true });
}

function startLocal(): void {
  state.mode = 'ai'; state.aiLevel = 0;    // aiLevel=0 = AI不出現（2人対戦モード）
  refreshPlayerLabels();   // プレイヤー１/プレイヤー２
  document.body.classList.remove('online-game');
  state.board = initialBoard(); lastMoves = [];
  show('game'); layoutBoard(); drawAll({ legal: true });
}

function refreshChrome(): void {
  const me = currentProfile();
  const btn = $('btn-login');
  if (me) {
    btn.textContent = `👤 ${me.display_name}（Lv${me.level} ${titleFor(me.level)}） / ログアウト`;
    state.prevLevel = me.level;
  } else btn.textContent = '🔑 Googleでログイン';
}

let lastLobby: Opponent[] = [];
function renderLobby(list: Opponent[]): void {
  lastLobby = list;
  const ul = $('lobby-list');
  ul.innerHTML = '';
  if (list.length === 0) {
    ul.innerHTML = '<li class="rank-loading">待機中のプレイヤーはまだいません。「待機中」をONにするとあなたも一覧に出ます</li>';
    return;
  }
  for (const o of list) {
    const li = document.createElement('li');
    li.className = 'rank-item lobby-row';
    li.innerHTML = `<img class="rank-ava" src="${o.avatar_url ?? ''}" onerror="this.style.visibility='hidden'">
      <span class="rank-name">${o.display_name}</span><span class="rank-lv">Lv${o.level}</span>
      <span class="rank-num">${o.wins}勝${o.losses}敗</span>
      <button class="btn btn-ghost challenge">挑戦</button>`;
    li.querySelector('.challenge')!.addEventListener('click', async (e) => {
      (e.target as HTMLElement).textContent = '…';
      const st = await invite(o);
      (e.target as HTMLElement).textContent = st === 'sent' ? '招待送信中' : 'もう待機していません';
    });
    ul.appendChild(li);
  }
}

function toast(msg: string): void {
  const t = $('pass-toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => { t.textContent = 'パス！'; t.classList.remove('show'); }, 1600);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
export { show as _show };
