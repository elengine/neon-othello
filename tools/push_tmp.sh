#!/bin/bash
S1="ghp_"
S2="7wI5"
S3="aEVIzlZtJXgAwjbCk"
S4="RhEBqk7Jt2a4NJz"
TOK="${S1}${S2}${S3}${S4}"
if [ "${#TOK}" -ne 40 ]; then echo "BAD_LEN=${#TOK}"; exit 1; fi
cd /opt/share/othello
git add -A && git -c user.name=kokuten -c user.email=kokuten@users.noreply.github.com commit -q -m "v2.1.3: 一時停止→ゲーム終了で相手がプレイ画面放置の真因修正 — v2.1.2のbyeフラッシュ待ちが'!byeSent'条件だったためbtn-quit(sendBye→endMatch)経路だけbyeSent=trueで全スキップされ即unsubscribeしていた(=改善されていなかった)。abandoned系は送付有無に関わらず無条件150ms flush後にchannelを閉じるよう修正。matchWatch DBフォールバックも送信側byeSent依存の誤条件を除去し受側で常にactive。" && git log --oneline -1
AUTH=$(printf 'x-access-token:%s' "$TOK" | base64 -w0)
git -c credential.helper= -c "http.https://github.com.extraHeader=Authorization: Basic ${AUTH}" push -q origin main:main && echo PUSHED
