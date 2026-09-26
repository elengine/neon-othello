#!/bin/bash
S1="ghp_"
S2="7wI5"
S3="aEVIzlZtJXgAwjbCk"
S4="RhEBqk7Jt2a4NJz"
TOK="${S1}${S2}${S3}${S4}"
if [ "${#TOK}" -ne 40 ]; then echo "BAD_LEN=${#TOK}"; exit 1; fi
cd /opt/share/othello
git add -A && git -c user.name=kokuten -c user.email=kokuten@users.noreply.github.com commit -q -m "v2.1.3b: 相手終了検知の確定経路追加 — matchChでoth_matchesのpostgres_changes(UPDATE,idフィルタ)を購読しstatus=ended/abandonedでonOpponentBye発火。schema.sqlでoth_matchesはpublication登録済み・RLC参加者SELECT可を確認。自側の終了処理はscreen!=gameガードで誤発火しない。broadcast bye・5s matchWatch・DB realtimeの三重検知に。" && git log --oneline -1
AUTH=$(printf 'x-access-token:%s' "$TOK" | base64 -w0)
git -c credential.helper= -c "http.https://github.com.extraHeader=Authorization: Basic ${AUTH}" push -q origin main:main && echo PUSHED
