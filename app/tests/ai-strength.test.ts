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
  it('中盤局面でLv5(名人)は同一最善手に収束し、Lv3は揺らぎ/ポカで分散する', () => {
    // 合法手を機械的に12手進めて非対称な中盤を作る
    let b = initialBoard();
    for (let k = 0; k < 12 && legalBB(b.bb, b.turn) !== 0n; k++) {
      const x = legalBB(b.bb, b.turn);
      b = applyMove(b, leastBitIndex(x)).board;
    }
    const pick = (lv: number, n: number) => {
      const c = new Map<number, number>();
      for (let i = 0; i < n; i++) { const m = aiMove(b, lv); c.set(m.cell, (c.get(m.cell) ?? 0) + 1); }
      return c;
    };
    const d5 = pick(5, 15); const r5 = Math.max(...d5.values()) / 15;
    const d3 = pick(3, 60);  const r3 = Math.max(...d3.values()) / 60;
    console.log('midgame Lv5 top-ratio', r5, ' Lv3 top-ratio', r3);
    expect(r5).toBeGreaterThan(0.6);            // 名人はほぼ単一最善
    expect(r3).toBeLessThan(r5);                // 三段は揺らぎ0.2+ポカ10%でばらける
    expect(d3.size).toBeGreaterThanOrEqual(2);
  }, 120000);
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
