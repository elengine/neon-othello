#!/usr/bin/env python3
"""Render Markdown docs as styled, Discord-shareable HTML + PDF."""
import argparse, pathlib, sys
import markdown
from markdown.extensions import tables, fenced_code, toc, sane_lists, attr_list

CSS = """
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin:0; padding:28px 22px 60px; background:#0b0f1a; color:#dfe6f3;
  font-family:'Moralerspace Neon','Noto Sans JP',-apple-system,'Hiragino Sans','Segoe UI',sans-serif;
  font-size:15px; line-height:1.75; }
.wrap { max-width:860px; margin:0 auto; }
h1 { font-size:24px; color:#7df9ff; border-bottom:2px solid #1e2a45; padding-bottom:10px;
  letter-spacing:.03em; }
h2 { font-size:19px; color:#ffd86b; margin-top:2em; border-left:4px solid #7df9ff; padding-left:10px; }
h3 { font-size:16px; color:#a5b4fc; margin-top:1.6em; }
table { border-collapse:collapse; width:100%; margin:14px 0; font-size:13.5px; display:table; }
th { background:#16203a; color:#7df9ff; text-align:left; }
th,td { border:1px solid #26314f; padding:7px 10px; }
tr:nth-child(even) td { background:#101828; }
code { background:#131c30; color:#8ef0c0; padding:1px 6px; border-radius:5px;
  font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace; font-size:12.5px; }
pre { background:#0d1526; border:1px solid #1e2a45; border-radius:10px; padding:14px;
  overflow-x:auto; }
pre code { background:none; padding:0; color:#b7e3ff; }
blockquote { border-left:4px solid #ffd86b; margin:12px 0; padding:4px 14px;
  background:#121a2c; color:#c9d4e8; }
strong { color:#fff; }
hr { border:none; border-top:1px solid #26314f; margin:28px 0; }
ul,ol { padding-left:1.5em; }
li { margin:.25em 0; }
a { color:#7df9ff; }
.badge { display:inline-block; background:#1b2a4a; color:#7df9ff; border-radius:8px;
  padding:2px 10px; font-size:12px; margin-bottom:8px; }
@media print {
  body { background:#fff; color:#111; }
  h1 { color:#036; } h2 { color:#750; border-left-color:#036; }
  th { background:#e8eef7; color:#036; } th,td { border-color:#99a; }
  tr:nth-child(even) td { background:#f4f7fb; }
  code { background:#eef; color:#063; } pre { background:#f5f7fa; border-color:#ccd; }
  pre code { color:#134; } blockquote { background:#f6f2e4; color:#333; }
  .badge { background:#dde; color:#036; }
}
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=pathlib.Path)
    ap.add_argument("--outdir", type=pathlib.Path, default=None)
    a = ap.parse_args()
    text = a.src.read_text(encoding="utf-8")
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "toc", "sane_lists", "attr_list"], output_format="html5")
    title = a.src.stem
    html = f"<!doctype html><html lang='ja'><head><meta charset='utf-8'>\
<meta name='viewport' content='width=device-width,initial-scale=1'>\
<title>{title}</title><style>{CSS}</style></head>\
<body><div class='wrap'><span class='badge'>NEON OTHELLO 設計ドキュメント</span>\
{body}</div></body></html>"
    outdir = a.outdir or a.src.parent
    outdir.mkdir(parents=True, exist_ok=True)
    html_path = outdir / (a.src.stem + ".html")
    html_path.write_text(html, encoding="utf-8")
    print(html_path)

if __name__ == "__main__":
    main()
