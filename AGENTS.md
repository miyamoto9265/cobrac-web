# AGENTS.md — cobrac-web 作業規約

このリポジトリ（GitHub: `miyamoto9265/cobrac-web`）は Web アプリ「CoBRAC Agents」のモノレポ。
コーディングエージェント・人間の双方がここに書かれたルールに従う。

## リポジトリ構成

```
package.json        npm workspaces。version がアプリ全体の版番号（唯一のソース）
CHANGELOG.md        リリースノート（Keep a Changelog 形式）
scripts/release.mjs 版番号更新・CHANGELOG 確定・git tag
scripts/retain-guard.mjs  CI デプロイ前の RETAIN ガード（cdk diff の置換・削除検知）
scripts/bra-appendix-d.mjs BRA 出力（xlsx / CSV フォルダ）を BRA のエラーコード（Error code List (Master)。Master に無い検査は `cobrac:` のローカルコード、旧来の付録D の番号は `appendixD` に残す）ごとに判定し、CoBRAC の担保方法を併記する（担保の表 ENFORCEMENT は検証器を変えたら直す）
.github/workflows/  ci.yml（PR 用。AWS 認証なし）・deploy.yml（main 用。OIDC で cdk deploy）・claude.yml（`miyamoto9265` か `cursor[bot]` の `@claude` で Claude Code が claude/ ブランチで作業し draft PR を出す。AWS・デプロイの権限なし）
prompts/            エージェント共通ルール（AGENTS.md）、フェーズ仕様（phases/）、Project.csv テンプレート、csv_to_excel.py、公式テンプレート templates/Template-v2-2.bra.xlsx（Template-v2-2 形式の出力の土台。手で編集しない）
packages/shared     型・CSV パーサ・グラフ JSON・単価表（pricing.ts）
packages/worker     Fargate ワーカー（Codex SDK）
packages/api        Lambda（Hono）+ dispatcher / ws / broadcaster / janitor
packages/web        React SPA（Vite）
packages/infra      AWS CDK
docs/               CoBRAC_仕様書.pdf（仕様の唯一の正本。サイトの /docs「仕様書」で管理者だけが閲覧可）
  spec-guide/       仕様書の生成元（src/*.html・style.css・build.mjs）。npm run spec:build で PDF と build.json を作る
  figures/          仕様書に埋め込む図（scripts/docs-figures*.mjs が生成）
  manual/           利用マニュアル（<言語>.md、いまは ja・en。サイトの /manual から全員が閲覧可。図は manual/figures/）
archive/v0/         旧デスクトップ版の指示書・仕様書・成果物サンプル・ユーザーガイド（参照専用。アプリでは使わない）
```

## バージョニング（必須）

- 版番号は **ルート `package.json` の `version`** が唯一のソース。ビルド時に Vite が `__APP_VERSION__` として埋め込み、サイドバー下部に `vX.Y.Z · <git short sha>` と表示される。CDK は同じ値を Lambda の `APP_VERSION` に渡し、`GET /health` が返す。
- Semantic Versioning。0.x の間は次の目安:
  - **patch**（0.1.x）: バグ修正、文言・表示の調整、ドキュメント、単価表の更新
  - **minor**（0.x.0）: 画面や API の追加、データモデルの追加、ワークフロー／プロンプトの変更
  - **major**: 既存データと互換性が無くなる変更（テーブル構造変更、成果物形式変更）
- **手順**（デプロイにつながる変更を行うたびに実施）:
  1. 変更内容を `CHANGELOG.md` の `## [Unreleased]` に「追加 / 変更 / 修正 / 削除」の見出しで書く。ユーザーに見える挙動を主語にし、ファイル名や関数名だけの記述にしない。
  2. 作業ブランチで `npm run release -- patch --no-git`（または `minor` / `major`）。ルートと全 workspace の `package.json`・`package-lock.json` の version を更新し、`[Unreleased]` を `## [X.Y.Z] - YYYY-MM-DD` に確定する。この変更をコミットして PR に含める（`--no-git` を付けないと main 前提のコミットとタグを作るので、PR 運用では使わない）。
  3. PR の CI（`.github/workflows/ci.yml`）が build・typecheck・test・`release:check`・`cdk synth` を AWS 認証なしで実行する。ジョブサマリーに「マージでデプロイされるか」が出る。
  4. PR を main にマージすると（Cloud Agent はユーザーの明示指示があったときだけマージする）、`.github/workflows/deploy.yml` が `v<version>` タグの有無を見て、**タグが無い版だけ**をデプロイする。流れ: 設定値チェック → build・typecheck・test・`release:check` → OIDC（ロール `gha-cobrac-web-deploy`、main 限定）→ `cdk diff` → RETAIN ガード → `npm run deploy` → `vX.Y.Z` タグ push → `GET /health` の版番号確認。
- 版を上げないマージ（ドキュメントだけの変更など）はデプロイされず、次のリリースにまとめて入る。**版を上げた PR のマージがデプロイの承認になる。**
- デプロイ結果は Actions の run（`gh run view --log`）で確認する。ローカルからの `npm run deploy` は CI が使えないときの緊急時だけにし、行ったら同じ内容を PR で main に戻す（タグはローカルで打って push する）。
- `[Unreleased]` が空のまま `release` すると失敗する。CHANGELOG を書かずに版を上げない。
- 版番号を手で編集しない（`release.mjs` を通す）。workspace の `package.json` の version は自動同期される。

## 変更時の約束

- 型チェック（`npm run typecheck`）とテスト（`npm test`）を通してからコミットする。
- `packages/shared` の型を変えたら api / worker / web すべてをビルドして影響を確認する。
- インフラ変更（`packages/infra`）は `npm run cdk -- diff` で差分を確認してからデプロイする。RETAIN 指定のリソース（DynamoDB / S3 / KMS / Cognito）を置き換える変更は必ず人間に確認する。
 - CI の RETAIN ガードは、これらの置換（replace / may be replaced）・削除（destroy / orphan / 除去）を検知するとデプロイ前にジョブを止める。Cloud Agent は Actions ログの diff を要約してユーザーに示し、再実行するかどうかはユーザーが判断する。指示を受けたときだけ `gh workflow run deploy.yml --ref main -f allow_retain_replacement=true` で再実行する（通常の「Re-run」では入力が付かず再び止まる）。
- ワークフローの骨格（HCD → FRG → CSV → xlsx の順、ワーカーがフェーズを進めて検証する方式、ターン終了時の JSON 出力 `{status, message, question}`）は相談なしに変えない。フェーズ仕様（`prompts/phases/*.md`）の文言調整は可。エージェントが書くデータファイル（`uc.json` などの JSON）のキーを変えるときは、`packages/shared/src/harness.ts` の JSON Schema（`HARNESS_SCHEMAS`）・検証・CSV 変換とフェーズ仕様の例を同時に直す。
- 機密（API キー、`.env`）はコミットしない。`.env.example` のみ追跡する。
- **仕様の正本は仕様書 PDF（`docs/CoBRAC_仕様書.pdf`）だけ**。挙動を変えたら、同じコミットで生成元 `docs/spec-guide/src/*.html` の該当する節を直し、`npm run spec:build`（`./fetch-fonts.sh && node build.mjs`。Playwright の Chromium・`pdftotext`・Python の `pypdf` が要る）で PDF と `docs/spec-guide/build.json` を作り直してコミットする。`npm test`（`scripts/spec-guide.test.mjs`）は、本文・埋め込む図・プロンプト（付録 B に全文が入る）・差し込み値を読むコードが PDF を作った後に変わっていれば失敗する。プロンプトだけを直した場合も作り直す。書き方は仕様書の付録 C に従う（です・ます調、LLM・プログラム・人を区別して書く）。
- サイトの「仕様書」ページ（`/docs`、管理者だけ）はこの PDF を表示する。CDK が PDF を API の Lambda の `admin-docs/` に同梱し、`GET /admin/spec` が S3 の `admin-docs/spec-<sha256 先頭 16 桁>.pdf` に置いて署名付き URL を返す（Web のバンドルには入れない）。`README.md` と `AGENTS.md` はサイトに出さない。「リリースノート」ページ（全員）は `CHANGELOG.md` を、「利用マニュアル」ページ（全員）は `docs/manual/*.md` をビルド時に取り込む。
- 仕様書の図は `docs/figures/*.svg`、利用マニュアルの図は `docs/manual/figures/*.svg`（どちらも日英それぞれ、PC 用と `*.narrow.svg` のスマホ用）。`scripts/docs-figures.mjs`（描画の共通部品は `docs-figures-lib.mjs`、図のまとまりごとに `docs-figures-harness-current.mjs`・`docs-figures-manual.mjs` などの別ファイル）が生成するので手で編集せず、スクリプトを直して `npm run docs:figures` で書き出す。`npm test` が生成結果とコミット済みファイルの一致を検査する。仕様書の HTML からは `<figure data-figure="<名前>.ja.svg">` で、利用マニュアルの Markdown からは `![代替テキスト](./figures/<名前>.ja.svg "図のキャプション")` で参照する。

## デプロイ先

- AWS アカウント `765959262011` / `ap-northeast-1`、スタック `CobracAgents`
- Web: https://d2l8xn9p9omh33.cloudfront.net
- 設定の正本は GitHub Actions の Variables（`AWS_DEPLOY_ROLE_ARN`・`CDK_DEFAULT_ACCOUNT`・`CDK_DEFAULT_REGION`・`COBRAC_SELF_SIGNUP`・`COBRAC_MAX_CONCURRENT_JOBS`・`COBRAC_MAX_CONCURRENT_JOBS_PER_USER`・`COBRAC_CODEX_REASONING_EFFORT`、任意で `COBRAC_CODEX_MODEL`）と Secret（`COBRAC_ADMIN_EMAILS`）。ローカルの `.env` はその写し（緊急デプロイ・ローカル synth 用）で、値を変えるときは両方を更新する。deploy ワークフローは必須値が空・不正なら AWS に触れる前に失敗する。詳細は `README.md` と仕様書の第 7 部
