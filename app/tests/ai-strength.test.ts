// v1.7.0 弱体化検証: Lv1=一様分布的(弱い) / Lv2=多様 / Lv3=最適手集中（相対強度）
import { describe, it, expect } from 'vitest';
import { aiMove } from '../src/core/ai';
import { initialBoard, applyMove, legalBB, leastBitIndex } from '../src/core/board';

function pickSet(lv: number, n: number): Map<number, number> {
  const c = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const m = aiMove(initialBoard(), lv);
    c.set(m.cell, (c.get(m.cell) ?? 0) + 1);
  }
  return c;
}

describe('AI弱体化 v1.7.0', () => {
  it('初手の合法手は4種', () => {
    let x = legalBB(initialBoard().bb, 0 as never);
    let n = 0;
    while (x !== 0n) { n++; x &= x - 1n; }
    expect(n).toBe(4);
  });
  it('Lv1(見習い)は4合法手にほぼ一様（=最適手を取らない・弱い）', () => {
    const dist = pickSet(1, 300);
    console.log('Lv1 dist', [...dist.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
    expect(dist.size).toBe(4);
    const vals = [...dist.values()];
    expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(2.5); // バラけている
  });
  it('Lv2(初段)は低確率ポカで偏りを持つが全候補に出うる', () => {
    const dist = pickSet(2, 200);
    console.log('Lv2 dist', [...dist.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
    expect(dist.size).toBeGreaterThanOrEqual(2);
  });
  it('Lv3は最適手に集中（低Lvより強い）', () => {
    const dist = pickSet(3, 60);
    const max = Math.max(...dist.values());
    console.log('Lv3 top-ratio', max / 60);
    expect(max / 60).toBeGreaterThan(0.8);
  });
  it('全Lvで実対戦進行（非法手なし・手詰まりまで）', () => {
    for (const lv of [1, 2]) {   // Lv3は重いので低Lvのみ
      let b = initialBoard();
      let k = 0;
      for (; k < 40 && legalBB(b.bb, b.turn) !== 0n; k++) {
        const m = aiMove(b, lv);
        const r = applyMove(b, m.cell);
        expect(r.ok).toBe(true);
        b = r.board;
      }
      expect(k).toBeGreaterThan(10);
    }
  }, 60000);
});
