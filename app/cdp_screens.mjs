// タイトル/ロビー/設定画面の描画検証（ Supabase 未設定での動作確認）
import CDP from 'chrome-remote-interface';
import fs from 'fs';

const run = async () => {
  const client = await CDP({ port: 9222 });
  const { Page, Runtime, Emulation, Input } = client;
  await Page.enable();
  await Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await Page.navigate({ url: 'http://127.0.0.1:4173/' });
  await new Promise((r) => setTimeout(r, 1500));
  const evalJs = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result?.value;
  const tap = async (x, y) => {
    await Input.dispatchTouchEvent({ type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await new Promise((r) => setTimeout(r, 60));
    await Input.dispatchTouchEvent({ type: 'touchEnd', touchPoints: [] });
    await new Promise((r) => setTimeout(r, 300));
  };
  const click = async (sel) => {
    const pos = JSON.parse(await evalJs(`(() => { const b=document.querySelector('${sel}'); const r=b.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2}); })()`));
    await tap(pos.x, pos.y);
  };

  // エラー收集
  const errs = [];
  client.Runtime.on('exceptionThrown', (p) => errs.push(p.exceptionDetails?.exception?.description?.slice(0, 120)));
  client.Runtime.on('consoleAPICalled', (p) => { if (p.type === 'error') errs.push(String(p.args?.[0]?.value).slice(0, 120)); });

  await click('#btn-settings');
  await new Promise((r) => setTimeout(r, 300));
  await Page.captureScreenshot({ format: 'png' }).then((s) => fs.writeFileSync('/tmp/oth_settings.png', Buffer.from(s.data, 'base64')));
  const presets = await evalJs(`document.querySelectorAll('[data-preset]').length`);
  console.log('設定画面プリセット数:', presets);

  await click('#back-title2');
  await click('#btn-online');
  await new Promise((r) => setTimeout(r, 600));
  await Page.captureScreenshot({ format: 'png' }).then((s) => fs.writeFileSync('/tmp/oth_lobby.png', Buffer.from(s.data, 'base64')));
  const lobbyMsg = await evalJs(`document.getElementById('lobby-list').textContent.slice(0,30)`);
  console.log('ロビー表示(未接続時):', lobbyMsg);

  await click('#back-lobby');
  await click('#btn-ranking');
  await new Promise((r) => setTimeout(r, 600));
  const rankMsg = await evalJs(`document.getElementById('rank-list').textContent.slice(0,30)`);
  console.log('ランキング表示(未接続時):', rankMsg);
  console.log('コンソールエラー数:', errs.length, errs.slice(0, 3));
  await client.close();
};
run().catch((e) => { console.error('ERR', e.message); process.exit(1); });
