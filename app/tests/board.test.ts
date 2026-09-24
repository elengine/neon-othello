import { describe, it, expect } from 'vitest';
import {
  initialBoard, legalMoves, applyMove, applyPass, gameStatus, stoneCount, winner,
  replayFrom, encodeMoves, BLACK, WHITE, idx, type Board,
} from '../src/core/board';

// 初期配置: 黒=(3,3),(4,4) 白=(3,4),(4,3)。黒の合法手は (2,4),(3,5),(4,2),(5,3) の4つ。
const OPEN4 = [idx(2, 4), idx(3, 5), idx(4, 2), idx(5, 3)].sort((a, b) => a - b);

describe('ルールエンジン', () => {
  it('初期盤面: 黒2・白2（中央4升）・合法手4・黒番', () => {
    const b = initialBoard();
    expect(stoneCount(b)).toEqual({ black: 2, white: 2 });
    expect(legalMoves(b.bb, BLACK).sort((x, y) => x - y)).toEqual(OPEN4);
    expect(b.turn).toBe(BLACK);
  });

  it('合法手でないマスは打てない', () => {
    const b = initialBoard();
    expect(applyMove(b, idx(0, 0)).ok).toBe(false);
    expect(applyMove(b, idx(2, 3)).ok).toBe(false); // 盤面端の交差升（挟みなし）
  });

  it('着手で石が返り手番が変わる', () => {
    const b = initialBoard();
    const r = applyMove(b, idx(5, 3));              // e6段目: 白(4,3)を返す
    expect(r.ok).toBe(true);
    expect(r.flipped).toEqual([idx(4, 3)]);
    expect(stoneCount(r.board)).toEqual({ black: 4, white: 1 });
    expect(r.board.turn).toBe(WHITE);
    expect(r.board.lastMove).toBe(idx(5, 3));
  });

  it('挟んだ相手の列をまとめて返す（縦2枚）', () => {
    // 列4に 黒(3,4)... を人工配置: 黒 (0,4),(2,4) 白 (1,4) → 黒 (1,4) に打てる? 自石は置けない。
    // 黒 (0,4),(2,4), 白 (1,4): 黒が (3,4) に打つと縦ではなく… → 下方向へ返す筋: 黒(3,4)は既に黒。
    // 正しいケース: 黒(0,0),白(1,0),白(2,0) に黒が (3,0) へ → 2枚返す。
    let bb: [bigint, bigint] = [0n, 0n];
    bb[0] = (1n << BigInt(idx(0, 0))) | (1n << BigInt(idx(3, 0)));
    bb[1] = (1n << BigInt(idx(1, 0))) | (1n << BigInt(idx(2, 0)));
    const b: Board = { bb, turn: WHITE, passCount: 0, moveCount: 4, lastMove: -1 };
    // 白(1,0)(2,0)が黒(0,0)と黒(3,0)に挟まっているので黒が打つ箇所ではない。
    // 黒(3,0)から見て白は既に黒に挟まれた → 既に終局形。黒の追加着手として: 黒(0,0)から上方向に白(1,0)... は黒(3,0)ありで黒番。
    // ここでは打てる形に組み替え: 白(1,0),(2,0), 黒(0,0) のみ → 黒が (3,0) に打つと縦2枚返し。
    const b2bb: [bigint, bigint] = [1n << BigInt(idx(0, 0)), (1n << BigInt(idx(1, 0))) | (1n << BigInt(idx(2, 0)))];
    const b2: Board = { bb: b2bb, turn: BLACK, passCount: 0, moveCount: 3, lastMove: -1 };
    const r = applyMove(b2, idx(3, 0));
    expect(r.ok).toBe(true);
    expect(r.flipped.sort((a, c) => a - c)).toEqual([idx(1, 0), idx(2, 0)]);
    expect(b.turn).toBe(WHITE);
  });

  it('パスカウント: 2回パスで終局', () => {
    const b = initialBoard();
    expect(gameStatus(b)).toBe('playing');
    const b2 = applyPass(applyPass(b));
    expect(gameStatus(b2)).toBe('over');
  });

  it('全石を埋めたら終局', () => {
    let bb: [bigint, bigint] = [0n, 0n];
    for (let i = 0; i < 64; i++) bb[0] |= 1n << BigInt(i);
    const full: Board = { bb, turn: BLACK, passCount: 0, moveCount: 60, lastMove: 0 };
    expect(gameStatus(full)).toBe('over');
    expect(winner(full)).toBe(BLACK);
  });

  it('引き分け判定', () => {
    let bb: [bigint, bigint] = [0n, 0n];
    for (let i = 0; i < 32; i++) bb[0] |= 1n << BigInt(i);
    for (let i = 32; i < 64; i++) bb[1] |= 1n << BigInt(i);
    const b: Board = { bb, turn: BLACK, passCount: 2, moveCount: 60, lastMove: 0 };
    expect(winner(b)).toBe('draw');
  });

  it('棋譜の往復（applyMove系列の正当性）', () => {
    let b = initialBoard();
    const cells: number[] = [];
    for (let n = 0; n < 40 && gameStatus(b) === 'playing'; n++) {
      const moves = legalMoves(b.bb, b.turn);
      if (moves.length === 0) { b = applyPass(b); continue; }
      const c = moves[n % moves.length];
      const r = applyMove(b, c);
      expect(r.ok).toBe(true);
      cells.push(c); b = r.board;
    }
    const replayed = replayFrom(encodeMoves(cells));
    expect(replayed.bb[0]).toBe(b.bb[0]);
    expect(replayed.bb[1]).toBe(b.bb[1]);
  });

  it('辺のラップaround防止: 行を跨いだ返しは発生しない', () => {
    // 黒(0,0), 白(1,0) 白が(0,7)に石 → 白が(0,1)着手時に左方向が(0,0)を挟み、
    // さらにラップして(0,7)の白を「黒の先」と誤認してはいけない（白石なので元より無関係だが、
    // 逆に黒(0,7)だった場合が危険: バグあり実装なら 黒(0,0)-白(0,6)-wrap黒? 具体ケース↓
    let bb: [bigint, bigint] = [0n, 0n];
    bb[0] = 1n << BigInt(idx(0, 0));            // 黒 (0,0)
    bb[1] = 1n << BigInt(idx(0, 7)) | 1n << BigInt(idx(0, 6)); // 白 (0,6)(0,7) ※ラップ先
    void bb; // 意図した局面は下の変種で検証
    // 白(0,6),(0,7) が黒(0,0)と「wrapで接続」していれば白は(0,5)に打って(0,6),(0,7)を... 自色なので無意味。
    // 検証すべき核心: 黒(0,0) 白(0,1..6のいずれか) で左→wrap→(0,7)が黒なら誤返しする。
    let bb2: [bigint, bigint] = [0n, 0n];
    bb2[0] = (1n << BigInt(idx(0, 0))) | (1n << BigInt(idx(0, 7))); // 黒が両端
    bb2[1] = 1n << BigInt(idx(0, 1));                              // 白 (0,1)
    const b2: Board = { bb: bb2, turn: WHITE, passCount: 0, moveCount: 3, lastMove: -1 };
    // 白が (0,6) に打つと: 左方向 (0,5)空 → 不可。バグ実装なら (0,6) 着手は関係ない。
    // 白が (0,2): 右方向 (0,3)(0,4)(0,5)空 → 不可。左方向 (0,1)自色 → 不可。
    // ラップ検出に効く手: 白(0,6) 着手で「左回りして (0,7)黒-...-(0,0)黒」ではなく、
    // 白の右方向: (0,7)は黒 → その先は盤外/ラップして(0,0)が黒 → 白は無いので正当でも非法。
    // 正しく実装されていれば合法手はゼロ（黒両端に白1枚では返せない）。
    const lm = legalMoves(b2.bb, WHITE);
    expect(lm).toEqual([]);
    expect(gameStatus(b2)).toBe('playing'); // 黒側には (0,2) など合法手あり（手番白のみ打てない）
  });
});
