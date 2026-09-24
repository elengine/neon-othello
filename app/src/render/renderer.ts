// NEON OTHELLO — 盤面レンダラ（設計書 §4）
// Canvas 2D。石はテーマ色 or アイコン。めくりアニメは 3D 相当をスケーリングで表現。
import { BLACK, WHITE, idx, type Board, type Stone, legalBB, leastBitIndex } from '../core/board';

export interface StoneTheme {
  black: string;         // CSS color
  white: string;
  glow: string;          // ネオン外周色
  boardBg: string;
  grid: string;
  blackIcon?: HTMLImageElement | null;  // アイコン石（オプトイン）
  whiteIcon?: HTMLImageElement | null;
}

export const NEON_DEFAULT: StoneTheme = {
  black: '#16e0ff',                       // ネオンシアン（先手）
  white: '#ff3df5',                         // ネオンマゼンタ（後手）
  glow: '#7df9ff',
  boardBg: '#0c1322',
  grid: '#1e2a45',
};
export const CLASSIC: StoneTheme = {
  black: '#111318', white: '#f2f4f8', glow: '#8ea0c0', boardBg: '#123524', grid: '#1d5c3a',
};

export interface Renderer {
  resize(cssSize: number): void;
  draw(board: Board, opts: { legal?: boolean; last?: boolean; hover?: number | null; flippedCells?: number[]; flipAnim?: number; fromCell?: number }): void;
  cellAt(clientX: number, clientY: number, rect: DOMRect): number | null;
}

export function makeRenderer(canvas: HTMLCanvasElement, theme: StoneTheme): Renderer {
  const ctx = canvas.getContext('2d')!;
  let size = 0, dpr = 1;

  function resize(cssSize: number): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    size = Math.max(120, Math.floor(cssSize));
    canvas.width = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  }

  function drawStone(x: number, y: number, r: number, s: Stone, anim: number, icon?: HTMLImageElement | null): void {
    // anim: 1=静止 0〜1 でめくり（横幅を cos で潰し裏面色へ）
    const squash = Math.abs(Math.cos(anim * Math.PI)); // 1→0→1
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.max(0.08, squash), 1);
    const mid = anim > 0.5; // めくり前半/後半で色反転
    const face = mid ? s : (s === BLACK ? WHITE : BLACK);
    const col = face === BLACK ? theme.black : theme.white;
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
    grad.addColorStop(0, shade(col, 0.45));
    grad.addColorStop(1, shade(col, -0.15));
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    if (icon && icon.complete && icon.naturalWidth > 0 && mid) {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(icon, -r, -r, r * 2, r * 2);
    }
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.strokeStyle = theme.glow + 'aa';
    ctx.shadowColor = theme.glow; ctx.shadowBlur = r * 0.55;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function draw(board: Board, o: { legal?: boolean; last?: boolean; hover?: number | null; flippedCells?: number[]; flipAnim?: number; fromCell?: number }): void {
    const cell = size / 8;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // 盤
    ctx.fillStyle = theme.boardBg; roundRect(ctx, 0, 0, size, size, size * 0.03); ctx.fill();
    ctx.strokeStyle = theme.grid; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 4); ctx.lineTo(i * cell, size - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, i * cell); ctx.lineTo(size - 4, i * cell); ctx.stroke();
    }
    // 星
    ctx.fillStyle = theme.grid;
    for (const [r, c] of [[2, 2], [2, 6], [6, 2], [6, 6]] as const) {
      ctx.beginPath(); ctx.arc(c * cell, r * cell, Math.max(2.5, size * 0.008), 0, Math.PI * 2); ctx.fill();
    }
    const flipped = new Set(o.flippedCells ?? []);
    // 石
    for (let s = 0; s < 2; s++) {
      const bbv = board.bb[s]; let x = bbv;
      while (x !== 0n) {
        const i = leastBitIndex(x); x &= x - 1n;
        const r = i >> 3, c = i & 7;
        const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
        const rad = cell * 0.42;
        if (flipped.has(i) && o.flipAnim !== undefined) {
          drawStone(cx, cy, rad, (s + 1) as Stone, 1 - o.flipAnim, s === 0 ? theme.whiteIcon : theme.blackIcon);
        } else {
          drawStone(cx, cy, rad, (s + 1) as Stone, 1, s === 0 ? theme.blackIcon : theme.whiteIcon);
        }
      }
    }
    // めくり中の返される石は「返り先の手番側」に描かれている（applyMove後の盤面＋flippedCells指定）
    // 合法手マーカー
    if (o.legal) {
      const lm = legalBB(board.bb, board.turn);
      let m = lm;
      ctx.fillStyle = board.turn === BLACK ? theme.black + '55' : theme.white + '55';
      while (m !== 0n) {
        const i = leastBitIndex(m); m &= m - 1n;
        const r = i >> 3, c = i & 7;
        ctx.beginPath(); ctx.arc(c * cell + cell / 2, r * cell + cell / 2, cell * 0.12, 0, Math.PI * 2); ctx.fill();
      }
    }
    // ホバープレビュー（返る石ハイライト）
    if (o.hover !== null && o.hover !== undefined && o.hover >= 0) {
      ctx.strokeStyle = theme.glow; ctx.lineWidth = 2;
      const r = o.hover >> 3, c = o.hover & 7;
      ctx.strokeRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
    }
    // 最新着手マーキング
    if (o.last && board.lastMove >= 0) {
      const r = board.lastMove >> 3, c = board.lastMove & 7;
      ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c * cell + cell / 2, r * cell + cell / 2, cell * 0.47, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function cellAt(clientX: number, clientY: number, rect: DOMRect): number | null {
    const x = Math.floor((clientX - rect.left) / (rect.width / 8));
    const y = Math.floor((clientY - rect.top) / (rect.height / 8));
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return idx(y, x);
  }

  return { resize, draw, cellAt };
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.max(0, Math.round(r + (amt > 0 ? (255 - r) * amt : r * amt))));
  g = Math.min(255, Math.max(0, Math.round(g + (amt > 0 ? (255 - g) * amt : g * amt))));
  b = Math.min(255, Math.max(0, Math.round(b + (amt > 0 ? (255 - b) * amt : b * amt))));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
