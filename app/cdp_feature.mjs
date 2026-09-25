// 機能検証: ポーズモーダル・速度選択・サウンド反映・グローアニメのDOM状態確認
import CDP from 'chrome-remote-interface';
const client = await CDP({ port: 9222 });
const { Page, Runtime, Emulation } = client;
await Page.enable(); await Runtime.enable();
await Emulation.setDeviceMetricsOverride({ width: 344, height: 882, deviceScaleFactor: 2, mobile: true });
const ev = async (expr) => (await Runtime.evaluate({ expression: expr, returnByValue: true })).result.value;

await Page.navigate({ url: 'http://127.0.0.1:4173/' });
await new Promise(r => setTimeout(r, 1500));

// 1. AI戦開始 → ポーズモーダル表示/再開
await ev(`document.querySelector('[data-level="1"]').click()`);
await new Promise(r => setTimeout(r, 400));
await ev(`document.getElementById('btn-pause').click()`);
await new Promise(r => setTimeout(r, 350));
const pauseShown = await ev(`getComputedStyle(document.getElementById('overlay-pause')).display`);
const modalVisible = await ev(`document.getElementById('overlay-pause').classList.contains('show')`);
await ev(`document.getElementById('btn-resume').click()`);
await new Promise(r => setTimeout(r, 350));
const pauseHidden = await ev(`getComputedStyle(document.getElementById('overlay-pause')).display`);

// 2. 終了ボタン → 結果画面
await ev(`document.getElementById('btn-pause').click()`);
await new Promise(r => setTimeout(r, 250));
await ev(`document.getElementById('btn-quit').click()`);
await new Promise(r => setTimeout(r, 300));
const afterQuit = await ev(`document.querySelector('.screen.active').id`);

// 3. 設定 → 速度選択が picked になるか・localStorage保存
await ev(`document.getElementById('btn-result-title').click()`);
await ev(`document.getElementById('btn-settings').click()`);
await new Promise(r => setTimeout(r, 250));
await ev(`document.querySelector('[data-pace="slow"]').click()`);
await new Promise(r => setTimeout(r, 200));
const picked = await ev(`document.querySelector('.pace-btn.picked')?.dataset.pace`);
const stored = await ev(`localStorage.getItem('otv2:prefs')`);

// 4. サウンド: 設定OFF → localStorage + ミュートボタン絵文字同期
await ev(`document.getElementById('chk-sound').click()`);
await new Promise(r => setTimeout(r, 200));
const chkSound = await ev(`({chk: document.getElementById('chk-sound').checked, icon: document.getElementById('btn-mute').textContent})`);

// 5. グローアニメ: animation 適用確認
await ev(`document.getElementById('back-title2').click()`);
await new Promise(r => setTimeout(r, 250));
const logoAnim = await ev(`getComputedStyle(document.querySelector('.logo')).animationName`);
const btnAnim = await ev(`getComputedStyle(document.querySelector('.menu .btn')).animationName`);

console.log(JSON.stringify({ pauseShown, modalVisible, pauseHidden, afterQuit, picked, stored, chkSound, logoAnim, btnAnim }, null, 1));
await client.close();
