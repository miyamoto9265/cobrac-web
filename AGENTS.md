# AGENTS.md — cobrac-web 作業規約

このリポジトリ（GitHub: `miyamoto9265/cobrac-web`）は Web アプリ「CoBRAC Agents」のモノレポ。
コーディングエージェント・人間の双方がここに書かれたルールに従う。

## リポジトリ構成

```
package.json        npm workspaces。version がアプリ全体の版番号（唯一のソース）
CHANGELOG.md        リリースノート（Keep a Changelog 形式）
scripts/release.mjs 版番号更新・CHANGELOG 確定・git tag
prompts/            エージェント共通ルール（AGENTS.md）、フェーズ仕様（phases/）、Project.csv テンプレート、csv_to_excel.py
packages/shared     型・CSV パーサ・グラフ JSON・単価表（pricing.ts）
packages/worker     Fargate ワーカー（Codex SDK）
packages/api        Lambda（Hono）+ dispatcher / ws / broadcaster / janitor
packages/web        React SPA（Vite）
packages/infra      AWS CDK
docs/               設計仕様・個人情報とセキュリティ・AWS インフラと予算（サイトの /docs から閲覧可）
```

## バージョニング（必須）

- 版番号は **ルート `package.json` の `version`** が唯一のソース。ビルド時に Vite が `__APP_VERSION__` として埋め込み、サイドバー下部に `vX.Y.Z · <git short sha>` と表示される。CDK は同じ値を Lambda の `APP_VERSION` に渡し、`GET /health` が返す。
- Semantic Versioning。0.x の間は次の目安:
  - **patch**（0.1.x）: バグ修正、文言・表示の調整、ドキュメント、単価表の更新
  - **minor**（0.x.0）: 画面や API の追加、データモデルの追加、ワークフロー／プロンプトの変更
  - **major**: 既存データと互換性が無くなる変更（テーブル構造変更、成果物形式変更）
- **手順**（デプロイにつながる変更を行うたびに実施）:
  1. 変更内容を `CHANGELOG.md` の `## [Unreleased]` に「追加 / 変更 / 修正 / 削除」の見出しで書く。ユーザーに見える挙動を主語にし、ファイル名や関数名だけの記述にしない。
  2. `npm run release patch`（または `minor` / `major`）。これがルートと全 workspace の `package.json`・`package-lock.json` の version を更新し、`[Unreleased]` を `## [X.Y.Z] - YYYY-MM-DD` に確定し、`release: vX.Y.Z` でコミットして `vX.Y.Z` タグを打つ。git 操作を避けたい場合は `--no-git`。
  3. `npm run deploy`。冒頭の `release:check` が「全パッケージの version 一致」と「CHANGELOG に現行版の項がある」ことを確認し、ズレていれば失敗する。
  4. `git push && git push --tags`。
- `[Unreleased]` が空のまま `release` すると失敗する。CHANGELOG を書かずに版を上げない。
- 版番号を手で編集しない（`release.mjs` を通す）。workspace の `package.json` の version は自動同期される。

## 変更時の約束

- 型チェック（`npm run typecheck`）とテスト（`npm test`）を通してからコミットする。
- `packages/shared` の型を変えたら api / worker / web すべてをビルドして影響を確認する。
- インフラ変更（`packages/infra`）は `npm run cdk -- diff` で差分を確認してからデプロイする。RETAIN 指定のリソース（DynamoDB / S3 / KMS / Cognito）を置き換える変更は必ず人間に確認する。
- ワークフローの骨格（HCD → FRG → CSV → xlsx の順、ワーカーがフェーズを進めて検証する方式、ターン終了時の JSON 出力 `{status, message, question}`）は相談なしに変えない。フェーズ仕様（`prompts/phases/*.md`）の文言調整は可。ただし表の列名を変えるときは `packages/shared/src/harness.ts` の検証・CSV 変換も同時に直す。
- 機密（API キー、`.env`）はコミットしない。`.env.example` のみ追跡する。
- ドキュメント（`docs/*.md`）は挙動を変えたら同じコミットで更新する。サイトの「ドキュメント」ページは `docs/*.md`・`README.md`・`CHANGELOG.md` をビルド時に取り込むため、追加・改名すればそのまま反映される。

## デプロイ先

- AWS アカウント `765959262011` / `ap-northeast-1`、スタック `CobracAgents`
- Web: https://d2l8xn9p9omh33.cloudfront.net
- 設定は `.env`（`COBRAC_ADMIN_EMAILS` など）。詳細は `README.md` と `docs/03_AWSインフラと予算.md`
