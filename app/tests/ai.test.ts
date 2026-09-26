import { describe, it, expect } from 'vitest';
import { initialBoard, applyMove, applyPass, legalMoves, gameStatus, stoneCount, winner, BLACK, WHITE } from '../src/core/board';
import { aiMove, search, AI_LEVELS } from '../src/core/ai';

function playGame(lvlB: number, lvlW: number, seedOffset = 0): 'black' | 'white' | 'draw' {
  let b = initialBoard();
  for (let n = 0; n < 120 && gameStatus(b) === 'playing'; n++) {
    const lvl = b.turn === BLACK ? lvlB : lvlW;
    const m = aiMove(b, lvl);
    if (m.pass) { b = applyPass(b); continue; }
    const r = applyMove(b, m.cell);
    if (!r.ok) { b = applyPass(b); continue; } // 安全側
    b = r.board;
  }
  const w = winner(b);
  if (w === 'draw') return 'draw';
  return w === BLACK ? 'black' : 'white';
}

describe('AIエンジン', () => {
  it('合法手のみ返す（20局面ランダム確認）', () => {
    let b = initialBoard();
    for (let n = 0; n < 20 && gameStatus(b) === 'playing'; n++) {
      const m = aiMove(b, 1);
      if (!m.pass) expect(legalMoves(b.bb, b.turn)).toContain(m.cell);
      b = m.pass ? applyPass(b) : applyMove(b, m.cell).board;
    }
  }, 60000);

  it('打てない局面では pass を返す', () => {
    // 黒が64石全部持った終局形 → 白は合法手ゼロ = pass
    const allBlack = 0xFFFFFFFFFFFFFFFFn;
    const r = aiMove({ bb: [allBlack, 0n], turn: WHITE, passCount: 0, moveCount: 60, lastMove: 0 }, 3);
    expect(r.pass).toBe(true);
  });

  it('強さが順序立つ: Lv5 >> Lv1（自己対戦6局で強側5勝以上）', () => {
    // v2.0.1でLv3は揺らぎ0.2+ポカ10%に弱体化されたため、強度順序の保証はポカなしのLv5で行う。
    const save = AI_LEVELS[5].timeBudgetMs;
    AI_LEVELS[5].timeBudgetMs = 150;
    let wins = 0;
    for (let i = 0; i < 6; i++) {
      const r = i % 2 === 0 ? playGame(5, 1, i) : playGame(1, 5, i);
      const strongWon = i % 2 === 0 ? r === 'black' : r === 'white';
      if (strongWon) wins++;
    }
    AI_LEVELS[5].timeBudgetMs = save;
    expect(wins).toBeGreaterThanOrEqual(5);
  }, 180000);

  it('Lv3(三段)もランダム近いLv1より勝る（24局中12勝以上・ポカ10%許容）', () => {
    // v2.1.7: 旧「8局中5勝」は実測勝率~0.75でP(4勝以下)≈13%ありCIで再発flaky（実測4回: 3/6/8/6勝）。
    // 24局に増やし閾値12（期待18, ≈3σ下）→ 失敗確率~0.2%。ローカル実測 w24=14〜20。
    const save3 = AI_LEVELS[3].timeBudgetMs;
    AI_LEVELS[3].timeBudgetMs = 200;
    let wins = 0;
    for (let i = 0; i < 24; i++) {
      const r = i % 2 === 0 ? playGame(3, 1, i) : playGame(1, 3, i);
      const strongWon = i % 2 === 0 ? r === 'black' : r === 'white';
      if (strongWon) wins++;
    }
    AI_LEVELS[3].timeBudgetMs = save3;
    expect(wins).toBeGreaterThanOrEqual(12);
  }, 300000);

  it('見習い(Lv1)でも対戦は成立する（手詰まりで無限ループしない）', () => {
    const r = playGame(1, 1);
    expect(['black', 'white', 'draw']).toContain(r);
  });

  it('時間予算内に返る', () => {
    const b = initialBoard();
    const t0 = performance.now();
    search(b.bb, BLACK, AI_LEVELS[5].depth, { timeBudgetMs: 200 });
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
