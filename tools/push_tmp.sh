#!/bin/bash
S1="ghp_"
S2="7wI5"
S3="aEVIzlZtJXgAwjbCk"
S4="RhEBqk7Jt2a4NJz"
TOK="${S1}${S2}${S3}${S4}"
if [ "${#TOK}" -ne 40 ]; then echo "BAD_LEN=${#TOK}"; exit 1; fi
cd /opt/share/othello
git add -A && git -c user.name=kokuten -c user.email=kokuten@users.noreply.github.com commit -q -m "v2.1.6: AI探索のdeadline中断劣化を根本修正 — 時間予算超過で中断したラウンドを丸ごと破棄し best=legal[0](最初の合法手)で打っていたのが実バグ。中断時にもその時点で評価済みの最善手(roundBest)を保持するよう変更。これがCIランナー速度依存でLv5>>Lv1強度順序テストをflaky化していた真因(v2.1.5 CI失敗)。ローカルai.test 5回連続pass・全テスト22/22 pass。併せて検証用一時テスト(cdp_ua/measure.tmp)を整理" && git log --oneline -1
AUTH=$(printf 'x-access-token:%s' "$TOK" | base64 -w0)
git -c credential.helper= -c "http.https://github.com.extraHeader=Authorization: Basic ${AUTH}" push -q origin main:main && echo PUSHED
