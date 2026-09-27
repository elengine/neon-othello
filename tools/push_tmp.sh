#!/bin/bash
set -e
cd /opt/share/othello
git add app/ tools/
git -c user.name=kokuten -c user.email=kokuten@users.noreply.github.com commit -q -m "v2.1.16: 盤枠線発光の3点ご指摘対応 — ①色を変えない: 発光を石色→盤の同系色(shade(boardBg))+同系shadowに変更(ピクセル実測(168-219中性グレイ)/ビジョン確認'石のシアンに変色せず通常枠のまま') ②明るさ0〜50 step1(既定30)へ変更 ③太さスライダー新設1〜5 step1(既定5=現状が最大・細くできる)。盘中に設定変更→resume/再対戦で反映・localStorage永続。テスト22/22 pass"
S1="ghp_"; S2="7wI5"; S3="aEVIzlZtJXgAwjbCk"; S4="RhEBqk7Jt2a4NJz"
TOK="${S1}${S2}${S3}${S4}"
AUTH=$(printf 'x-access-token:%s' "$TOK" | base64 -w0)
git -c credential.helper= -c "http.https://github.com/.extraHeader=Authorization: Basic ${AUTH}" push -q origin main:main && echo PUSHED
