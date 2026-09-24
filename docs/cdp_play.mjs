// NEON OTHELLO 自動対戦検証（CDP）: 縦長344x882でプレイ→スクショ、横長882x344でレイアウト確認
import CDP from 'chrome-remote-interface';

const run = async () => {
  const client = await CDP({ port: 9222 });
  const { Page, Runtime, Emulation, Input } = client;
  await Page.enable();
  await Page.navigate({ url: 'http://127.0.0.1:4173/' });
  await new Promise((r) => setTimeout(r, 1800));

  const setPhone = async (w, h) => {
    await Emulation.setDeviceMetricsOverride({ width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await Emulation.setTouchEmulationEnabled({ enabled: true });
  };

  const evalJs = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result?.value;
  const tap = async (x, y) => {
    await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await new Promise((r) => setTimeout(r, 60));
    await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
    await new Promise((r) => setTimeout(r, 250));
  };

  await setPhone(344, 882);
  await new Promise((r) => setTimeout(r, 300));

  // タイトル → AI対戦 → 見習い
  const btnPos = await evalJs(`(() => { const b=document.getElementById('btn-ai'); const r=b.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
  const p1 = JSON.parse(btnPos); await tap(p1.x, p1.y);
  const lvPos = await evalJs(`(() => { const b=document.querySelector('[data-level="1"]'); const r=b.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
  const p2 = JSON.parse(lvPos); await tap(p2.x, p2.y);
  await new Promise((r) => setTimeout(r, 400));

  // 盤面ジオメトリ取得 → 合法手(2,4)をタップ
  const geo = await evalJs(`(() => { const c=document.getElementById('board'); const r=c.getBoundingClientRect(); return JSON.stringify({left:r.left, top:r.top, cell:r.width/8}); })()`);
  const g = JSON.parse(geo);
  const tapCell = async (row, col) => tap(g.left + (col + 0.5) * g.cell, g.top + (row + 0.5) * g.cell);
  await tapCell(2, 4); // 黒の合法手 1つ目
  await new Promise((r) => setTimeout(r, 1800)); // めくり+AI応手待ち

  const turnText = await evalJs(`document.getElementById('hud-turn').textContent`);
  const counts = await evalJs(`document.getElementById('hud-black-count').textContent + '-' + document.getElementById('hud-white-count').textContent`);
  console.log('縦長プレイ後 turn:', turnText, ' counts:', counts);
  await Page.captureScreenshot({ format: 'png' }).then((s) => {
    import('fs').then((fs) => fs.writeFileSync('/tmp/oth_portrait.png', Buffer.from(s.data, 'base64')));
  });

  // 回転: 横長に
  await setPhone(882, 344);
  await new Promise((r) => setTimeout(r, 500));
  const layout = await evalJs(`(() => {
    const b=document.getElementById('board').getBoundingClientRect();
    const hd=document.getElementById('hud-top').getBoundingClientRect();
    return JSON.stringify({board:[Math.round(b.x),Math.round(b.y),Math.round(b.width)], hud:[Math.round(hd.x),Math.round(hd.y),Math.round(hd.width)]});
  })()`);
  console.log('横長レイアウト:', layout);
  await Page.captureScreenshot({ format: 'png' }).then((s) => {
    import('fs').then((fs) => fs.writeFileSync('/tmp/oth_landscape.png', Buffer.from(s.data, 'base64')));
  });
  const turn2 = await evalJs(`document.getElementById('hud-turn').textContent`);
  console.log('回転後も手番維持:', turn2);
  await client.close();
};
run().catch((e) => { console.error('ERR', e.message); process.exit(1); });
