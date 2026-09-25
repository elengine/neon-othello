# NEON OTHELLO 🌆

ネオンダッシュボード調の本格オセロ — **TypeScript ルールエンジン** × bitboard AI × Canvas 2D 描画 × Supabase（Google認証・オンライン対戦・ランキング）。

▶ **[ NEON OTHELLO を遊ぶ ]** https://elengine.github.io/neon-othello/

スマホ・タブレット最適化（縦長⇔横長回転対応 / Galaxy Fold 8 展開時4:3横長レイアウト）。PWAインストール対応・オフライン起動可。

## 特徴

### ゲームロジック（`app/src/core/` — 純TypeScript・テスト14本で担保）
- ビットボード（BigInt）による合法手生成・石返し・終局判定
- **AI Lv1〜5**：Negamax + Alpha-Beta + 評価関数（見習い〜師範）
- パス・終局・大差判定を含む公式ルール準拠

### ゲームモード
| モード | 内容 |
|--------|------|
| AI対戦 | Lv1〜5 から選択。打つ速度（ゆらぎ/早い/普通/遅い）設定可 |
| 2人対戦 | 同端末交互着手（黒/白の勝ち表示） |
| オンライン対戦 | Googleログイン必須。ロビーで待機→相互招待→Realtime着手同期 |

### オンライン対戦（`app/src/net/online.ts`）
- 待機一覧は **Supabase DB（oth_queue）ポーリング**が唯一の真実 — Presence方式で起きた「表示されない／幽霊待機」系を構造的に排除
- 招待ID単位の合意形成：受諾→対局開始／拒否・40秒無応答→トースト通知
- Broadcast による着手/パス/投了同期、盤面スナップショット保存（再接続用）

### 描画（Canvas 2D — `app/src/render/renderer.ts`）
- めくり3Dアニメ：回転軸を着手方向に合わせ、回転方向が一目で分かる
- 合法手マーカーは確定仕様：外枠円 白15% ＋ 中心テーマ色 60%
- 石テーマ5プリセット＋先手/後手カラーピッカー（同色選択は即時ロールバック＋警告）
- Googleアイコンを自分の石に使うオプトイン設定（円形クリップ描画）

### レベル・ランキング（Supabase / RLS + RPC）
- XP・戦績は `othello_submit_game()` RPC 側のみ更新可能（クライアント改竄防止・同一棋譜二度投稿防止）
- ランキングタブ：レベル / 勝利数 / 勝率、マイ順位バー、対戦履歴
- レベルアップ時の賑やかし演出（`app/src/ui/celebrate.ts`）

## 開発

```bash
cd app
npm install
npm run dev        # 開発サーバー
npm run build      # 本番ビルド（tsc + Vite + PWA）
npm run test       # vitest（ルールエンジン/AI 回帰テスト14本）
```

- Vite + TypeScript + vite-plugin-pwa / GSAP / Howler
- DBスキーマ・RLS・RPC：`app/supabase/schema.sql`（Supabase SQL Editor で適用）
- デプロイ：GitHub Actions（`.github/workflows/`）→ GitHub Pages へ自動公開

## 設計ドキュメント（`docs/`）
- 要件定義書 v1.0 / 基本設計書 v1.0（md・PDF・HTML 版完備）
- 調査サマリ：既存 NEON TETRIS v2 と同じ Supabase プロジェクト資産（Google OAuth・RLS・PWA）の再利用構成
