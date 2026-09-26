// NEON OTHELLO — AIエンジン（設計書 §5）
// Negamax + Alpha-Beta + 反復深化 + 終盤完全読み。bitboard(bigint)ベース。
import {
  BLACK, WHITE, FULL, type Stone, type Board,
  legalBB, leastBitIndex, popcount,
} from './board';

// ---- 評価テーブル ----
// 標準的な重み付け（角・辺重視／X-square回避）。終盤は石数差に切り替える。
const WEIGHTS = [
  120, -20,  20,   5,   5,  20, -20, 120,
  -20, -40,  -5,  -5,  -5,  -5, -40, -20,
   20,  -5,  15,   3,   3,  15,  -5,  20,
    5,  -5,   3,   3,   3,   3,  -5,   5,
    5,  -5,   3,   3,   3,   3,  -5,   5,
   20,  -5,  15,   3,   3,  15,  -5,  20,
  -20, -40,  -5,  -5,  -5,  -5, -40, -20,
  120, -20,  20,   5,   5,  20, -20, 120,
];

function evaluateBB(bb: [bigint, bigint], perspective: Stone): number {
  const empties = 64 - popcount(bb[0] | bb[1]);
  let own = 0, opp = 0;
  if (empties <= 12) {
    own = popcount(bb[perspective === BLACK ? 0 : 1]);
    opp = popcount(bb[perspective === BLACK ? 1 : 0]);
  } else {
    let x = bb[perspective === BLACK ? 0 : 1];
    while (x !== 0n) { own += WEIGHTS[leastBitIndex(x)]; x &= x - 1n; }
    let y = bb[perspective === BLACK ? 1 : 0];
    while (y !== 0n) { opp += WEIGHTS[leastBitIndex(y)]; y &= y - 1n; }
  }
  // 着手可能数（mobility）
  const myMob = popcount(legalBB(bb, perspective));
  const opMob = popcount(legalBB(bb, perspective === BLACK ? WHITE : BLACK));
  return own - opp + 2 * (myMob - opMob);
}

// ---- 探索 ----
interface Node { bb: [bigint, bigint]; turn: Stone; passed: boolean; }

// 時間予算超えを最上位へ伝えるシグナル（値として -Infinity は使えないのでシンボル付き例外）
class Deadline {}

function negamax(node: Node, depth: number, alpha: number, beta: number, deadline = Infinity): number {
  if (performance.now() > deadline) throw new Deadline();
  if (depth === 0) return evaluateBB(node.bb, node.turn);
  let legal = legalBB(node.bb, node.turn);
  if (legal === 0n) {
    if (node.passed) return evaluateBB(node.bb, node.turn); // 双方指せず
    return -negamax({ bb: node.bb, turn: node.turn === BLACK ? WHITE : BLACK, passed: true }, depth, -beta, -alpha, deadline);
  }
  let best = -Infinity;
  let x = legal;
  // 角 → 辺 → 他 の順で手待ち（alpha-beta打ち切り効率向上）
  const moves: number[] = [];
  while (x !== 0n) { moves.push(leastBitIndex(x)); x &= x - 1n; }
  moves.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  for (const cell of moves) {
    const own = node.turn === BLACK ? node.bb[0] : node.bb[1];
    const oppB = node.turn === BLACK ? node.bb[1] : node.bb[0];
    const f = flipsOf(own, oppB, cell);
    const nbb: [bigint, bigint] = [...node.bb] as [bigint, bigint];
    const m = 1n << BigInt(cell);
    if (node.turn === BLACK) { nbb[0] = own | m | f; nbb[1] = oppB & ~f; }
    else { nbb[1] = own | m | f; nbb[0] = oppB & ~f; }
    const child: Node = { bb: nbb, turn: node.turn === BLACK ? WHITE : BLACK, passed: false };
    const score = -negamax(child, depth - 1, -beta, -alpha, deadline);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// board.ts の flipsFor と同一アルゴリズム（Node側の再利用容易なローカル版）
const FILE7 = 0xFEFEFEFEFEFEFEFEn, FILE0 = 0x0101010101010101n;
const SHIFTS: Array<(b: bigint) => bigint> = [
  (b) => ((b & FILE7) << 1n) & FULL,
  (b) => (b & ~FILE0) >> 1n,
  (b) => (b << 8n) & FULL,
  (b) => b >> 8n,
  (b) => ((((b & FILE7) << 1n) & FULL) << 8n) & FULL,
  (b) => (((b & ~FILE0) >> 1n) << 8n) & FULL,
  (b) => (((b & FILE7) << 1n) & FULL) >> 8n,
  (b) => ((b & ~FILE0) >> 1n) >> 8n,
];
function flipsOf(own: bigint, oppB: bigint, cell: number): bigint {
  if (((own | oppB) >> BigInt(cell)) & 1n) return 0n;
  const bit = 1n << BigInt(cell);
  let flipped = 0n;
  for (const sh of SHIFTS) {
    let f = 0n, cur = sh(bit);
    while (cur !== 0n && (cur & oppB) !== 0n) { f |= cur; cur = sh(cur); }
    if (cur !== 0n && (cur & own) !== 0n) flipped |= f;
  }
  return flipped;
}

/** 深さ制限で最善手探索。時間予算(ms)を超えたら現在見つかっている最善手で返す。 */
export function search(
  bb: [bigint, bigint], turn: Stone, maxDepth: number,
  opts: { timeBudgetMs?: number; randomness?: number } = {},
): { cell: number; score: number; depth: number } {
  const legal: number[] = [];
  let x = legalBB(bb, turn);
  while (x !== 0n) { legal.push(leastBitIndex(x)); x &= x - 1n; }
  const deadline = opts.timeBudgetMs ? performance.now() + opts.timeBudgetMs : Infinity;

  let best = legal[0], bestScore = -Infinity, reached = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    let roundBest = legal[0], roundBestScore = -Infinity;
    let aborted = false;
    for (const cell of legal) {
      if (performance.now() > deadline) { aborted = true; break; }
      try {
      const own = turn === BLACK ? bb[0] : bb[1];
      const oppB = turn === BLACK ? bb[1] : bb[0];
      const f = flipsOf(own, oppB, cell);
      const nbb: [bigint, bigint] = [...bb] as [bigint, bigint];
      const m = 1n << BigInt(cell);
      if (turn === BLACK) { nbb[0] = own | m | f; nbb[1] = oppB & ~f; }
      else { nbb[1] = own | m | f; nbb[0] = oppB & ~f; }
      const s = -negamax({ bb: nbb, turn: turn === BLACK ? WHITE : BLACK, passed: false },
        depth - 1, -Infinity, -roundBestScore, deadline);
      if (s > roundBestScore) { roundBestScore = s; roundBest = cell; }
      } catch (e) { if (e instanceof Deadline) { aborted = true; break; } throw e; }
    }
    if (aborted) {
      // v2.1.6: deadline中断でも「このラウンドで現時点の最善」roundBestが前回より良ければ採用。
      // 旧: 中断ラウンドを丸ごと破棄し best=legal[0]（最初の合法手）に堕ちる劣化があった。
      // 遅いCIランナーで名人Lv5が実質バラ打ちになり、強度順序テストがflaky化していた真因。
      if (reached === 0 && roundBestScore > bestScore) { best = roundBest; bestScore = roundBestScore; reached = 1; }
      else if (roundBestScore > bestScore && roundBestScore !== -Infinity) { best = roundBest; bestScore = roundBestScore; }
      break;
    }
    best = roundBest; bestScore = roundBestScore; reached = depth;
  }
  if (opts.randomness && opts.randomness > 0) {
    // 許容帯内の候補から乱数選択（レベル1〜2用。帯 = randomness×100）
    const scored = legal.map((cell) => {
      const own = turn === BLACK ? bb[0] : bb[1];
      const oppB = turn === BLACK ? bb[1] : bb[0];
      const f = flipsOf(own, oppB, cell);
      const nbb: [bigint, bigint] = [...bb] as [bigint, bigint];
      const m = 1n << BigInt(cell);
      if (turn === BLACK) { nbb[0] = own | m | f; nbb[1] = oppB & ~f; }
      else { nbb[1] = own | m | f; nbb[0] = oppB & ~f; }
      return { cell, s: -negamax({ bb: nbb, turn: turn === BLACK ? WHITE : BLACK, passed: false }, Math.min(1, reached), -Infinity, Infinity, Infinity) };
    });
    const band = opts.randomness * 100;
    const pool = scored.filter((t) => bestScore - t.s <= band);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { cell: pick ? pick.cell : best, score: bestScore, depth: reached };
  }
  return { cell: best, score: bestScore, depth: reached };
}

// ---- レベル定義（設計書 §5 の表） ----
export interface AIProfile { depth: number; timeBudgetMs: number; randomness: number; blunderChance?: number; }
/** v2.1.1: AIレベル番号→段位名（UI表記は「AI 見習い」等の名称で表示。選択画面のカード名と一致させる） */
export const AI_LEVEL_NAMES: Record<number, string> = {
  1: '見習い', 2: '初段', 3: '三段', 4: '有段', 5: '名人',
};
export function aiLevelName(lv: number): string { return AI_LEVEL_NAMES[lv] ?? String(lv); }

export const AI_LEVELS: Record<number, AIProfile> = {
  1: { depth: 1, timeBudgetMs: 300, randomness: 1.5, blunderChance: 0.4 },  // 見習い（v1.7.0 弱化: 40%で完全ランダム手）
  2: { depth: 2, timeBudgetMs: 500, randomness: 0.4, blunderChance: 0.15 }, // 初段（v1.7.0 弱化: 1手読み+15%ポカ）
  3: { depth: 4, timeBudgetMs: 1000, randomness: 0.2, blunderChance: 0.1 }, // 三段（v2.0.1 指定: 4手/揺らぎ0.2/ポカ10%）
  4: { depth: 7, timeBudgetMs: 1500, randomness: 0, blunderChance: 0.05 },  // 有段（v2.0.1 指定: ポカ5%のみ）
  5: { depth: 9, timeBudgetMs: 2500, randomness: 0 },   // 名人
};

/** 1手選択。UI側は非同期で呼ぶこと（同期実行なら setTimeout で渡す）。 */
export function aiMove(board: Board, level: number): { cell: number; pass: boolean } {
  const prof = AI_LEVELS[level] ?? AI_LEVELS[3];
  const legal = legalBB(board.bb, board.turn);
  if (legal === 0n) return { cell: -1, pass: true };
  // 低レベルのポカ演出: 確率で完全ランダム合法手
  if (prof.blunderChance && Math.random() < prof.blunderChance) {
    const moves: number[] = [];
    let x = legal;
    while (x !== 0n) { moves.push(leastBitIndex(x)); x &= x - 1n; }
    return { cell: moves[Math.floor(Math.random() * moves.length)], pass: false };
  }
  const r = search(board.bb, board.turn, prof.depth, {
    timeBudgetMs: prof.timeBudgetMs, randomness: prof.randomness,
  });
  return { cell: r.cell, pass: false };
}

export { evaluateBB, negamax };
