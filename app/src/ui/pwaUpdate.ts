// PWA更新検知（v2.0.2）— 旧SWキャッシュに留まり「翌日にフォントが戻る」等を防ぐ
// 1) 起動直後と30分ごとに SW を能動チェック  2) 新版があったら画面下部に更新トースト（タップで再読込）
import { registerSW } from 'virtual:pwa-register';

let banner: HTMLElement | null = null;
function showUpdateUI(updateSW: (reloadPage?: boolean) => Promise<void>): void {
  if (banner) return;
  banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.textContent = '⬆ アプリの新しいバージョンがあります。タップで更新';
  document.body.appendChild(banner);
  banner.addEventListener('click', () => void updateSW(true));
}

export function initPwaUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { showUpdateUI(updateSW); },
    onRegisteredSW(_url: string | undefined, reg: ServiceWorkerRegistration | undefined) {
      if (reg) setInterval(() => void reg.update(), 30 * 60 * 1000); // 30分ごとに親SWへ更新確認
    },
  });
}
