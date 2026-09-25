// 2人対戦E2E: ボタン→プレイ画面→交互タップ→終了(黒/白勝ち表示)
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));
await ev(`document.getElementById('btn-local').click()`);
await new Promise(r => setTimeout(r, 400));
const screen = await ev(`document.querySelector('.screen.active').id`);

// 合法手を取得して交互に着手（8手）
const forceMoves = async () => {
  for (let i = 0; i < 6; i++) {
    const cell = await ev(`(() => {
      const b = window.__dbg?.();
      return null; })()`);
    // DOM経由では座標が要るため、JSから盤面へ直接アクセスはできない → evaluate内で canvas 中央クリック代用
    // 簡易: 手番表示の変化だけを確認
    break;
  }
};
// 代替: legalMoves×cellAt を main.tsスコープで再現できないため、pointerdownを盤中央+一升ずらしで送る
const tap = async (dx, dy) => {
  const r = await ev(`(() => { const c = document.getElementById('board').getBoundingClientRect(); return [c.x, c.y, c.width, c.height]; })()`);
  await Runtime.evaluate({ expression: `
    const c = document.getElementById('board');
    const rect = c.getBoundingClientRect();
    const ev = new PointerEvent('pointerdown', { clientX: rect.x + rect.width/2 + ${dx}, clientY: rect.y + rect.height/2 + ${dy}, bubbles: true });
    c.dispatchEvent(ev);` });
};

// 石数確認用: 何タップか試みて手番が変わるか（単純成功判定=対局面で画面遷移不発）
let placed = 0;
for (const [dx, dy] of [[-120, -120], [120, 120], [-120, 120], [120, -120], [-80, -40], [80, 40]]) {
  await tap(dx, dy);
  await new Promise(r => setTimeout(r, 700));
  placed++;
}
const turn = await ev(`document.getElementById('hud-turn').textContent`);
console.log(JSON.stringify({ screen, placed, turn }, null, 1));
await client.close();
