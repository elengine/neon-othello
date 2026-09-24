// NEON OTHELLO — ルールエンジン（設計書 §2 対応・純粋関数・UI非依存）
// 盤面は 0..63 のセル index。bitboard は [own, opp] の 2 枚 (bigint 64bit)。

export type Stone = 1 | 2;            // 1=黒(先手) 2=白(後手)
export const BLACK: Stone = 1;
export const WHITE: Stone = 2;
export const EMPTY = 0;

export interface Board {
  bb: [bigint, bigint];               // [黒bitboard, 白bitboard]
  turn: Stone;
  passCount: number;
  moveCount: number;
  lastMove: number;                   // -1 = 未着手
}

// 8方向シフト（辺のラップ防止をシフト内で適用）
// bit index = r*8+c なので、<<1 は「同行の c+1」だが (r,7)→(r+1,0) とラップする。
// ラップした結果ビットは必ず次行の c0（左方向）または前行の c7（右方向）になるので、
// 元ビット側をマスクしてからシフトするのが正しい。
const FILE_MASKS = [0x0101010101010101n, 0x0202020202020202n, 0x0404040404040404n, 0x0808080808080808n,
  0x1010101010101010n, 0x2020202020202020n, 0x4040404040404040n, 0x8080808080808080n];
export const FULL = 0xFFFFFFFFFFFFFFFFn;
const NOT_C0 = FULL & ~FILE_MASKS[0];
const NOT_C7 = FULL & ~FILE_MASKS[7];

const SHIFT_LEFT  = (b: bigint) => ((b & NOT_C7) << 1n) & FULL;   // c+1 方向
const SHIFT_RIGHT = (b: bigint) => ((b & NOT_C0) >> 1n);           // c-1 方向
const SHIFT_UP    = (b: bigint) => (b << 8n) & FULL;               // r+1 方向
const SHIFT_DOWN  = (b: bigint) => (b >> 8n) & FULL;               // r-1 方向

const DIR_SHIFTS: Array<{ sh: (b: bigint) => bigint }> = [
  { sh: SHIFT_LEFT }, { sh: SHIFT_RIGHT }, { sh: SHIFT_UP }, { sh: SHIFT_DOWN },
  { sh: (b) => SHIFT_UP(SHIFT_LEFT(b)) }, { sh: (b) => SHIFT_UP(SHIFT_RIGHT(b)) },
  { sh: (b) => SHIFT_DOWN(SHIFT_LEFT(b)) }, { sh: (b) => SHIFT_DOWN(SHIFT_RIGHT(b)) },
];

export function idx(r: number, c: number): number { return r * 8 + c; }
export function cellRC(cell: number): [number, number] { return [cell >> 3, cell & 7]; }

export function initialBoard(): Board {
  const b = { bb: [0n, 0n] as [bigint, bigint], turn: BLACK as Stone, passCount: 0, moveCount: 0, lastMove: -1 };
  setBB(b.bb, BLACK, idx(3, 3)); setBB(b.bb, BLACK, idx(4, 4));
  setBB(b.bb, WHITE, idx(3, 4)); setBB(b.bb, WHITE, idx(4, 3));
  return b;
}

function setBB(bb: [bigint, bigint], s: Stone, cell: number): void {
  const m = 1n << BigInt(cell);
  if (s === BLACK) bb[0] |= m; else bb[1] |= m;
}
function getBB(bb: [bigint, bigint], s: Stone): bigint { return s === BLACK ? bb[0] : bb[1]; }
function opp(s: Stone): Stone { return s === BLACK ? WHITE : BLACK; }

/** 指定マスに (own, opp) で置いたとき裏返される石のbit集合 */
export function flipsFor(own: bigint, oppB: bigint, cell: number): bigint {
  const occupied = own | oppB;
  if (((occupied >> BigInt(cell)) & 1n) !== 0n) return 0n;
  const bit = 1n << BigInt(cell);
  let flipped = 0n;
  for (const { sh } of DIR_SHIFTS) {
    let f = 0n;
    let cur = sh(bit);
    let i = 0;
    while (i < 8 && cur !== 0n && ((cur & oppB) !== 0n)) {
      f |= cur; cur = sh(cur); i++;
    }
    if (cur !== 0n && ((cur & own) !== 0n)) flipped |= f;   // 自石で挟めたときのみ確定
  }
  return flipped;
}
export function leastBitIndex(b: bigint): number {
  let i = 0; let x = b;
  while ((x & 1n) === 0n) { x >>= 1n; i++; }
  return i;
}

/** 全合法手のbit集合 */
export function legalBB(bb: [bigint, bigint], turn: Stone): bigint {
  const own = getBB(bb, turn), oppB = getBB(bb, opp(turn));
  const empty = FULL & ~(own | oppB);
  let legal = 0n;
  // 相手の石の隣空きマスだけ調べればよい（高速化）
  let oppFront = 0n;
  for (const { sh } of DIR_SHIFTS) oppFront |= sh(oppB);
  const cand = empty & oppFront;
  let c = cand;
  while (c !== 0n) {
    const cell = leastBitIndex(c);
    c &= ~(1n << BigInt(cell));
    if (flipsFor(own, oppB, cell) !== 0n) legal |= 1n << BigInt(cell);
  }
  return legal;
}

export function legalMoves(bb: [bigint, bigint], turn: Stone): number[] {
  const out: number[] = [];
  let m = legalBB(bb, turn);
  while (m !== 0n) { const c = leastBitIndex(m); out.push(c); m &= ~(1n << BigInt(c)); }
  return out;
}

export interface ApplyResult { ok: boolean; board: Board; flipped: number[]; passed: boolean; reason?: string; }

/** 着手適用（合法手でなければ passthrough=false）。着手に打てる石が無いときは明示的に pass を使うこと。 */
export function applyMove(board: Board, cell: number): ApplyResult {
  const own = getBB(board.bb, board.turn), oppB = getBB(board.bb, opp(board.turn));
  const f = flipsFor(own, oppB, cell);
  if (f === 0n) return { ok: false, board, flipped: [], passed: false, reason: 'illegal' };
  const bb: [bigint, bigint] = [...board.bb] as [bigint, bigint];
  const m = 1n << BigInt(cell);
  bb[board.turn === BLACK ? 0 : 1] = own | m | f;
  bb[board.turn === BLACK ? 1 : 0] = oppB & ~f;
  const flipped: number[] = [];
  let x = f;
  while (x !== 0n) { const c = leastBitIndex(x); flipped.push(c); x &= ~(1n << BigInt(c)); }
  return {
    ok: true,
    board: { bb, turn: opp(board.turn), passCount: 0, moveCount: board.moveCount + 1, lastMove: cell },
    flipped, passed: false,
  };
}

export function applyPass(board: Board): Board {
  return { ...board, turn: opp(board.turn), passCount: board.passCount + 1, lastMove: board.lastMove };
}

export type GameStatus = 'playing' | 'over';
export function gameStatus(board: Board): GameStatus {
  if (board.passCount >= 2) return 'over';
  if ((board.bb[0] | board.bb[1]) === FULL) return 'over';
  if (legalBB(board.bb, BLACK) === 0n && legalBB(board.bb, WHITE) === 0n) return 'over';
  return 'playing';
}

export function stoneCount(board: Board): { black: number; white: number } {
  return { black: popcount(board.bb[0]), white: popcount(board.bb[1]) };
}
export function popcount(b: bigint): number {
  let x = b & FULL, n = 0;
  while (x !== 0n) { x &= x - 1n; n++; }
  return n;
}

export function winner(board: Board): Stone | 'draw' | null {
  if (gameStatus(board) !== 'over') return null;
  const { black, white } = stoneCount(board);
  if (black > white) return BLACK;
  if (white > black) return WHITE;
  return 'draw';
}

// ---- 棋譜エンコード（オンライン同期・保存用: "014325..." 2桁16進/手） ----
export function encodeMoves(cells: number[]): string {
  return cells.map((c) => c.toString(16).padStart(2, '0')).join('');
}
export function replayFrom(moves: string): Board {
  const b = initialBoard();
  let board = b;
  for (let i = 0; i + 1 < moves.length; i += 2) {
    const cell = parseInt(moves.slice(i, i + 2), 16);
    const r = applyMove(board, cell);
    if (r.ok) board = r.board;
    else {
      // 手番側の合法手でないなら相手の番だった＝片側がパスして進行
      const p = applyPass(board);
      const r2 = applyMove(p, cell);
      board = r2.ok ? r2.board : board;
    }
  }
  return board;
}
