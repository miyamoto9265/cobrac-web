# リリースノート

CoBRAC Agents の変更履歴。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従う。
`[Unreleased]` に変更を書き溜め、デプロイ時に `npm run release <patch|minor|major>` で版番号を確定する（手順は `AGENTS.md`）。

## [Unreleased]

## [0.1.3] - 2026-09-13

### 追加
- サイドバー下部にアプリのバージョン（`vX.Y.Z · コミット短縮ハッシュ`）を表示。API の `GET /health` もバージョンを返す
- `docs/` 配下の設計・セキュリティ・インフラ文書、README、本リリースノートをサイト内「ドキュメント」ページ（`/docs`）から閲覧可能に
- HCD / FRG グラフのノードをドラッグで移動でき、位置をプロジェクトごとに保存（S3 `graph/{hcd,frg}.layout.json`）。「配置をリセット」で自動レイアウトに戻す
- リリース手順の自動化: `scripts/release.mjs`（版番号の一括更新・CHANGELOG の確定・git tag）、`AGENTS.md` にバージョニング規約を明記

### 変更
- リポジトリ名を `cobrac-web` に変更（GitHub: `miyamoto9265/cobrac-web`）。アプリ名は引き続き「CoBRAC Agents」
- `npm run deploy` は版番号と CHANGELOG の整合チェック（`release:check`）を通ってからビルド・デプロイする

## [0.1.2] - 2026-09-13

### 追加
- ジョブごとに使用モデル・入出力トークン数・推定料金（USD）を記録し、プロジェクト単位に合算
- プロジェクト一覧に合計料金カードとモデル別内訳、各行にモデル／トークン／料金列
- チャット画面ヘッダーにトークン／料金バッジ。クリックでジョブ別内訳表を表示
- 管理画面のプロジェクト表にモデル・料金列
- `GET /users/me/usage`（合計／モデル別／プロジェクト別集計）、`GET /users/me/models` に単価表登録済みモデル一覧を追加
- `packages/shared/src/pricing.ts` に OpenAI 単価表（USD / 1M tokens）と `estimateCostUsd()`

### 変更
- プロジェクト作成時に必ず具体的なモデル名を確定する（指定 → ユーザー既定 → `CODEX_MODEL` → `gpt-5.3-codex`）。「Codex 既定」の不明モデルが残らないようにした

## [0.1.1] - 2026-09-13

### 追加
- Codex モデルと reasoning effort をプロジェクト作成時に選択可能に。設定画面でユーザー既定値を保存
- API キー登録時に OpenAI の `/v1/models` から利用可能なモデル一覧を取得して保存
- Fargate Spot 起動失敗時に On-Demand へフォールバック
- janitor によるハートビート途絶ジョブの自動リトライ（最大 2 回）

### 修正
- API キー登録で「Failed to fetch」になる問題。API Gateway の `/{proxy+}` ルートから `OPTIONS` を外し、CORS プリフライトを JWT オーソライザーに通さないようにした

### 変更
- Lambda ランタイムを Node.js 22 に更新。`logRetention` の非推奨警告を `logGroup` 明示で解消
- Codex SDK を 0.154.0 に更新

## [0.1.0] - 2026-09-13

### 追加
- 初回デプロイ（ap-northeast-1）。CloudFront + S3 の React SPA、API Gateway（HTTP / WebSocket）+ Lambda（Hono）、SQS → ECS Fargate ワーカー、DynamoDB、Cognito、KMS
- ROI / TLF の 2 入力から HCD → FRG → CSV → xlsx を生成するワークフローを Codex SDK で実行
- `[QUESTION]` による質問→回答ループ。質問待ちの間はワーカーを停止し、回答時に `resumeThread` で再開
- 完了後のフォローアップ指示（同一スレッドで成果物を修正）
- HCD / FRG のインタラクティブなグラフ表示（ノードクリックで詳細）
- プロジェクト履歴サイドバー、プロジェクト一覧、xlsx ダウンロード
- ユーザー管理（Cognito）、各ユーザーの OpenAI API キーを KMS で暗号化保存、管理者画面
- ワーカーイメージは CodeBuild でデプロイ時にビルド（ローカル Docker 不要）
