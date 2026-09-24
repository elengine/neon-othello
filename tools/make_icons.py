#!/usr/bin/env python3
"""NEON OTHELLO アプリアイコン生成（ネオン石2枚＋盤グリッド）"""
from PIL import Image, ImageDraw, ImageFilter
import sys

def make(size, maskable=False):
    im = Image.new('RGB', (size, size), '#0b0f1a')
    d = ImageDraw.Draw(im)
    pad = size // 8 if maskable else size // 14
    span = size - 2 * pad
    # グリッド
    for i in range(1, 8):
        x = pad + span * i / 8
        d.line([(pad, x), (size - pad, x)], fill='#1e2a45', width=max(1, size // 200))
        d.line([(x, pad), (x, size - pad)], fill='#1e2a45', width=max(1, size // 200))
    r = span / 8 * 0.42
    cx1, cy = pad + span * 3.5 / 8, size / 2
    cx2 = pad + span * 4.5 / 8
    glow = Image.new('RGB', (size, size), '#0b0f1a')
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx1 - r, cy - r, cx1 + r, cy + r], fill='#16e0ff')
    gd.ellipse([cx2 - r, cy - r, cx2 + r, cy + r], fill='#ff3df5')
    glow = glow.filter(ImageFilter.GaussianBlur(size // 30))
    im = Image.blend(im, glow, 0.55)
    d = ImageDraw.Draw(im)
    d.ellipse([cx1 - r, cy - r, cx1 + r, cy + r], fill='#16e0ff', outline='#7df9ff', width=max(2, size // 120))
    d.ellipse([cx2 - r, cy - r, cx2 + r, cy + r], fill='#ff3df5', outline='#7df9ff', width=max(2, size // 120))
    return im

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    make(512).save(f'{out}/icon-512.png')
    make(192).save(f'{out}/icon-192.png')
    make(512, maskable=True).save(f'{out}/maskable-512.png')
    print('icons ok')
