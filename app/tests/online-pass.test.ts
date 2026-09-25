// v1.9.0 検証: オンライン相手のみ合法手ゼロでも誤終局しない（プロトコルシミュレーション）
import { describe, it, expect } from 'vitest';
import { initialBoard, applyMove, applyPass, gameStatus, legalBB, BLACK } from '../src/core/board';

// 実機シナリオ: 白(相手)は打てる手が無いが黒(自分)は打てる盤面を作る
// v1.8.0 のバグ: checkTurn が「手番側の合法手ゼロ→自動 applyPass」を自分の端末でも走らせ、
// さらに相手の pass ブロードキャストで applyPass が二重適用され passCount>=2 で gameStatus='over' になっていた。
// v1.9.0: 相手の分の applyPass は相手の通知のみ（1回）。
describe('v1.9.0 オンラインパス二重計上修正', () => {
  it('パスは送信側・受信側それぞれ1回だけ applyPass される', () => {
    let b = initialBoard();
    // 黒が1手指す
    const r = applyMove(b, 20); // (2,4) 合法（初手の定番）
    expect(r.ok).toBe(true);
    b = r.board;
    // ここで b.turn は WHITE。白がパスを送る想定:
    // 旧バグ=自端末が自動で applyPass(1) + 受信ブロードキャストで applyPass(2) → 誤終局
    // 新設計=自端末は相手の番では applyPass しない。受信で1回だけ:
    expect(gameStatus(b)).toBe('playing');      // まだ終局しない
    const afterOne = applyPass(b);              // 受信1回
    expect(afterOne.passCount).toBe(1);
    expect(gameStatus(afterOne)).toBe('playing'); // 相手はパスしたが自分は打てる → 継続
    // 手番は黒（自分）に戻り合法手あり
    expect(afterOne.turn).toBe(BLACK);
    expect(legalBB(afterOne.bb, afterOne.turn) !== 0n).toBe(true);
  });
  it('連続2パス（双方指せず）で正しく終局', () => {
    let b = initialBoard();
    b = applyPass(b);
    b = applyPass(b);
    expect(gameStatus(b)).toBe('over');
  });
});
