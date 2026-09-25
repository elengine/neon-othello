// 石色カスタマイズ（設計書 F-701/702）: プリセット＋カラーピッカー＋アイコン石オプトイン
import type { StoneTheme } from '../render/renderer';
import { supabase } from '../supabase/client';
import { currentProfile, refreshProfile } from '../supabase/auth';

export interface StonePref { black: string; white: string; glow: string; boardBg: string; }

export const PRESETS: { name: string; pref: StonePref }[] = [
  { name: 'ネオン', pref: { black: '#16e0ff', white: '#ff3df5', glow: '#7df9ff', boardBg: '#0c1322' } },
  { name: '黑白', pref: { black: '#111318', white: '#f2f4f8', glow: '#8ea0c0', boardBg: '#123524' } },
  { name: 'サンセット', pref: { black: '#ff9e42', white: '#7c5cff', glow: '#ffd86b', boardBg: '#171126' } },
  { name: '和モダン', pref: { black: '#1f2430', white: '#e8ddc8', glow: '#c9a86a', boardBg: '#22303a' } },
  { name: 'パステル', pref: { black: '#8fb8ff', white: '#ffd1e8', glow: '#c5e0ff', boardBg: '#20263a' } },
];

export function prefToTheme(p: StonePref): StoneTheme {
  return { black: p.black, white: p.white, glow: p.glow, boardBg: p.boardBg, grid: shift(p.boardBg, 24), blackIcon: null, whiteIcon: null };
}
function shift(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt), g = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export async function savePref(p: StonePref, iconStones: boolean): Promise<void> {
  const me = currentProfile(); if (!me) return;
  await supabase()?.from('oth_profiles').update({ stone_pref: p, icon_stones: iconStones }).eq('id', me.id);
}

export async function loadPref(): Promise<{ pref: StonePref; iconStones: boolean } | null> {
  const me = currentProfile() ?? await refreshProfile(); if (!me) return null;
  const sp = me.stone_pref as Partial<StonePref>;
  return {
    pref: {
      black: sp.black ?? PRESETS[0].pref.black, white: sp.white ?? PRESETS[0].pref.white,
      glow: sp.glow ?? PRESETS[0].pref.glow, boardBg: sp.boardBg ?? PRESETS[0].pref.boardBg,
    },
    iconStones: me.icon_stones,
  };
}

// ---- アイコン読み込み（オプトイン時のみ・CORS対応で円形クリップ済み描画） ----
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    if (!url) return res(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}
