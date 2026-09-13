# CoBRAC Agents（リポジトリ: cobrac-web）

BRA（Brain Reference Architecture）データ作成ワークフロー（HCD → FRG → CSV → xlsx）を、
サーバー上の Codex SDK で実行する Web アプリケーション。設計・セキュリティ・インフラの文書は `docs/`（サイトの「ドキュメント」からも閲覧可）、
変更履歴は `CHANGELOG.md`、作業規約（バージョニング手順を含む）は `AGENTS.md`。

## バージョンとリリース

版番号はルート `package.json` の `version` が唯一のソースで、サイドバー下部と `GET /health` に表示される。

```bash
# 1. CHANGELOG.md の [Unreleased] に変更内容を書く
# 2. 版を上げて CHANGELOG を確定・コミット・タグ
npm run release patch      # or minor / major / 0.2.0
# 3. デプロイ（版と CHANGELOG の整合チェック付き）
npm run deploy
git push && git push --tags
```

## 構成

```
package.json                 npm workspaces（build / typecheck / test / deploy）
prompts/                     コンテナ同梱 instruction 群（改修版）, csv_to_excel.py（引数化）, Project.csv
packages/
  shared/   型定義・CSV パーサ・グラフ JSON 生成（buildGraphs）・ユーティリティ（vitest）
  worker/   Fargate ワーカー + Dockerfile（Node 22 + @openai/codex-sdk + Python 3）
            src/index.ts(制御ループ) codex.ts(SDK) s3sync.ts steps.ts finalize.ts
  api/      Lambda: src/app.ts(Hono) と src/handlers/{http,dispatcher,ws,broadcaster,janitor}.ts
  web/      React SPA（Vite + Tailwind + React Flow）
  infra/    AWS CDK スタック `CobracAgents`（Lambda は NodejsFunction/esbuild でバンドル）
```

## 必要なもの

- Node.js 22 以上、npm 10 以上
- Docker は**不要**（ワーカーイメージはデプロイ時に CodeBuild 上でビルドされる: `@cdklabs/deploy-time-build`）
- AWS CLI の認証情報（デプロイ先アカウント）、`cdk bootstrap` 済み
- 各ユーザーの OpenAI API キー（アプリ内の設定画面で登録）

## セットアップ・検証

```bash
npm install
npm run typecheck     # 全パッケージの型チェック
npm test              # shared のユニットテスト
npm run build         # shared(tsc) → api(型チェック) / worker(tsc) / web(vite)
npm run cdk -- synth  # CloudFormation テンプレート生成（デプロイ前の確認）
```

`csv_to_excel.py` を単体で試す:

```bash
pip install -r prompts/requirements.txt
python prompts/csv_to_excel.py --contributor "Your Name" --project-id VOR \
  --base-dir /path/containing/VOR --output ./VOR.bra.xlsx
```

## デプロイ

設定はリポジトリ直下の `.env`（`.env.example` をコピー）または環境変数で渡す。

```bash
# 管理者にするメールアドレス（カンマ区切り）。初回ログイン時に admin ロールが付与される
export COBRAC_ADMIN_EMAILS=you@example.com
# 任意: セルフサインアップ無効化 / 同時実行数 / Codex モデル・推論強度
export COBRAC_SELF_SIGNUP=true
export COBRAC_MAX_CONCURRENT_JOBS=2
export COBRAC_MAX_CONCURRENT_JOBS_PER_USER=1
export COBRAC_CODEX_MODEL=            # 空なら Codex CLI の既定
export COBRAC_CODEX_REASONING_EFFORT=high

npm run deploy        # build → cdk deploy --all --require-approval never
```

出力の `WebUrl`（CloudFront）にアクセス → サインアップ → 設定で API キー登録 → チャット画面で ROI/TLF を入力して実行。
フロントの接続先（API/WS/Cognito）は CDK が `config.json` として S3 に配置するため環境ごとの再ビルドは不要。

PowerShell の場合は `$env:COBRAC_ADMIN_EMAILS="you@example.com"` のように設定する。

## ローカル開発（フロントのみ）

```bash
cp .env.example packages/web/.env.local   # VITE_API_URL 等をデプロイ済み環境に向ける
npm run dev:web
```

## 主要な設計ポイント

- ジョブは SQS → dispatcher Lambda → ECS Fargate **Spot**（不可時は On-Demand にフォールバック）で 1 ジョブ 1 タスク。
- エージェントが `[QUESTION]...[/QUESTION]` を出力するとワークスペースと `CODEX_HOME` を S3 に保存してタスクを終了（課金停止）。回答すると `resumeThread` で再開。
- 5 種 CSV がそろうと `csv_to_excel.py` と `buildGraphs()` で xlsx と HCD/FRG グラフ JSON を生成。
- 完了後は同じスレッドに「フォローアップ指示」を送って成果物を修正・再生成できる。
- ワーカーのハートビートが 15 分途絶すると janitor が FAILED にし、2 回まで自動リトライ（Spot 中断対策）。
- ユーザーの OpenAI API キーは KMS で暗号化して DynamoDB に保存し、ワーカー内でのみ復号。エージェントのシェル環境には AWS 認証情報を渡さない。

## 運用メモ

- ワーカーのログ: CloudFormation 出力 `WorkerLogGroup`（CloudWatch Logs）。
- 成果物: `ArtifactsBucket` の `users/{userId}/{projectId}/{workspace,thread,output,graph}/`。
- テーブル・バケット・KMS キー・User Pool は `RemovalPolicy.RETAIN`。スタック削除後も残るので不要なら手動削除。
- コスト監視のため AWS Budgets で月額アラート（例: $30）の設定を推奨。
