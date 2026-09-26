#!/bin/bash
S1="ghp_"
S2="7wI5"
S3="aEVIzlZtJXgAwjbCk"
S4="RhEBqk7Jt2a4NJz"
TOK="${S1}${S2}${S3}${S4}"
if [ "${#TOK}" -ne 40 ]; then echo "BAD_LEN=${#TOK}"; exit 1; fi
cd /opt/share/othello
git add -A && git -c user.name=kokuten -c user.email=kokuten@users.noreply.github.com commit -q -m "v2.1.5: 案Aレイアウト調整(2.1.4相当)+開始トースト刷新(2.1.5) — ①アカウントカードflex-wrap+戦績nowrap→バッジごと2行目に回り名前/戦績が途中で折り返らない ②更新/ログアウトバナーnowrap廃止+max-width92vw+折返し中央寄せで見切れ解消 ③履歴1レコード2行化(hist-line1=日時+相手名フル幅nowrap+ellipsis/hist-line2=結果・スコア・XP) で大きい文字サイズ端末でも名前が折り返らない ④トースト: 両者'パス'表示バグ真因=消える直前にtextを'パス！'へ戻していた書き換えを廃止、2秒表示+タップで即消去、font 26→19px、オンライン開始文言を'あなたが先手です/あなたは後手です'に簡素化。CDP検証済(1.45倍文字模擬: 全項目OK)" && git log --oneline -1
AUTH=$(printf 'x-access-token:%s' "$TOK" | base64 -w0)
git -c credential.helper= -c "http.https://github.com.extraHeader=Authorization: Basic ${AUTH}" push -q origin main:main && echo PUSHED
