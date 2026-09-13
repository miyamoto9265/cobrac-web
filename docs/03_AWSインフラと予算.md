# CoBRAC Agents AWS インフラと予算

| 項目 | 内容 |
| ---- | ---- |
| 文書 | 構成、リソース、課金の仕組み、予算感、コスト抑制 |
| 対象読者 | アカウント管理者・運用者 |
| 実装 | CDK スタック `CobracAgents`（ap-northeast-1） |
| 関連 | [01_設計仕様.md](./01_設計仕様.md) / [02_個人情報とセキュリティ.md](./02_個人情報とセキュリティ.md) |

金額は **2026 年時点の東京リージョン目安** であり、公式の見積ではない。実課金は Cost Explorer を正とする。**OpenAI API 料金は AWS 請求に含まれない。**

---

## 1. 設計方針

1. **アイドル時の固定費を小さくする**（常時 EC2 / NAT Gateway を置かない）。
2. **高い部分はジョブ実行時間だけ払う**（Fargate Spot）。
3. 質問待ち中はタスクを止める（S3 に状態を置いて終了）。
4. 配信は CloudFront 既定ドメイン。独自ドメイン・証明書は使わない。

スタックは 1 本（`packages/infra/lib/cobrac-stack.ts`）。デプロイ: `npm run deploy`（要 `cdk bootstrap`）。ワーカーイメージはローカル Docker 不要で、デプロイ時に CodeBuild がビルドして ECR へ push する（`@cdklabs/deploy-time-build`）。

---

## 2. 構成図

```
Internet
  │
  ├─ CloudFront ── S3 (SPA + config.json)     OAC、公開バケットなし
  ├─ Cognito User Pool                         メールログイン
  │
  ├─ HTTP API  ── JWT ── Lambda http
  └─ WebSocket ── JWT ── Lambda ws
                      │
                      ├─ DynamoDB × 5
                      ├─ SQS (+ DLQ) ── Lambda dispatcher ── ECS RunTask
                      ├─ DynamoDB Streams ── Lambda broadcaster ── WS
                      ├─ EventBridge 15min ── Lambda janitor
                      ├─ KMS (API キー)
                      └─ S3 Artifacts

VPC（パブリック subnet × 2、NAT なし、IGW あり）
  └─ ECS Fargate Spot
       パブリック IP で OpenAI / AWS API へ出る
       セキュリティグループはインバウンドなし
```

NAT Gateway を置かない理由: 東京で AZ あたりおおよそ **$32/月 + データ処理料** が固定で乗るため。ワーカーは一時的なのでパブリック IP で足りる。

---

## 3. リソース一覧

### 3.1 コンピューティング

| リソース | スペック | 起動条件 |
| -------- | -------- | -------- |
| Lambda × 8 | Node 22 ARM64、メモリ 512 MB。http/ws 30s、dispatcher/broadcaster 60s、janitor 2 分 | リクエスト / SQS / Streams / 15 分周期 |
| ECS Cluster | Fargate + Fargate Spot、Container Insights オフ | 常時（クラスタ自体はほぼ無料） |
| Fargate Task | 1 vCPU / 2 GB / ephemeral 21 GB、x86_64 | ジョブ 1 件につき 1 タスク |
| CodeBuild | デプロイ時のイメージビルド | `cdk deploy` のとき |
| ECR | ワーカーイメージ 1 本（約 0.5 GB 圧縮） | 常時 |

### 3.2 データ

| リソース | 設定 |
| -------- | ---- |
| DynamoDB Users / Projects / Jobs / Messages | On-Demand。Projects/Messages は Stream。PITR オフ。RETAIN |
| DynamoDB WsConnections | On-Demand、TTL、DESTROY |
| S3 Artifacts | 非公開、SSE-S3、未完了 MPU 3 日で破棄、RETAIN |
| S3 Web | 非公開、OAC、DESTROY + 自動空削除 |
| SQS JobQueue | 可視 120s、保持 4 日、DLQ 14 日（5 回失敗） |

### 3.3 ネットワーク・配信・認証

| リソース | 設定 |
| -------- | ---- |
| VPC | /16 相当、パブリック /24 × 2 AZ、IGW、NAT 0 |
| CloudFront | Price Class 200（北米・欧州・アジア）、SPA は 403/404 → index.html |
| HTTP API | CORS 有効。`/health` のみ匿名 |
| WebSocket API | stage `prod`。接続上限 2 時間 |
| Cognito | メール、SRP、ID/Access 2h、Refresh 30d、グループ `admin` |
| KMS CMK | ローテーション有効、RETAIN |

### 3.4 ログ

Lambda / ワーカーとも CloudWatch Logs **14 日**。Insights は使っていない。

### 3.5 デプロイ済み（参考、2026-09-13）

| 出力 | 値 |
| ---- | -- |
| アカウント | `618703232062` |
| リージョン | ap-northeast-1 |
| WebUrl | `https://d253ipuk9gq4vr.cloudfront.net` |
| HTTP API | `https://l04ci8f5s5.execute-api.ap-northeast-1.amazonaws.com` |
| スタック名 | `CobracAgents` |

---

## 4. 課金が動くタイミング

| 操作 | 主に増えるもの |
| ---- | -------------- |
| 誰も使っていない | CloudFront 微量、KMS $1、ECR、DynamoDB ストレージ、VPC 自体は無料に近い |
| 画面閲覧 | CloudFront、HTTP API、Lambda、DynamoDB RCU 相当（On-Demand） |
| チャット購読 | WebSocket 接続時間 + メッセージ、Streams Lambda |
| ジョブ実行 | **Fargate CPU/メモリ時間**、ENI/パブリック IP、ワーカーの CloudWatch、S3 PUT、DynamoDB 書き込み |
| 質問待ち | 上記 Fargate は止まる。S3 保管料と DynamoDB だけ |
| `cdk deploy` | CodeBuild（イメージ再ビルド時）、ECR プッシュ、CloudFront invalidation、Lambda 更新 |

同時実行: 全体 `COBRAC_MAX_CONCURRENT_JOBS`（既定 2）、ユーザーあたり 1。超えたメッセージは 60 秒後に再キュー（待ち時間は SQS のみ）。

---

## 5. 予算感

### 5.1 アイドル（ユーザー数名、ジョブ 0）

| 項目 | 月額目安 |
| ---- | -------- |
| KMS CMK 1 本 | $1.00 |
| ECR（0.5〜1 GB） | $0.10 前後 |
| DynamoDB / S3 保管（数 MB〜数百 MB） | $0.10〜0.50 |
| CloudFront / Cognito（無料枠内） | $0〜0.50 |
| **小計** | **約 $1.5〜3** |

NAT を足すとここだけで +$32 以上になる。

### 5.2 想定利用（月 50 ジョブ、実行 2〜4 時間/件、質問待ちは停止）

実行時間合計 100〜200 時間。

| サービス | 前提 | 月額目安 |
| -------- | ---- | -------- |
| Fargate Spot 1 vCPU / 2 GB | 約 $0.013〜0.020/時間 | $2〜4 |
| 同上の On-Demand フォールバック | Spot の roughly 2.5〜3 倍 | 混在なら +$1〜3 |
| CloudFront + フロント S3 | 低トラフィック | $1 |
| API Gateway HTTP + WS | 数十万リクエスト未満 | $1〜2 |
| Lambda | ARM、短い実行 | $0〜1 |
| DynamoDB On-Demand | メッセージ書き込みが中心 | $1〜2 |
| S3 成果物（数 GB、PUT 多め） | workspace 同期あり | $0.5〜1.5 |
| CloudWatch Logs | 14 日、ワーカー出力 | $0.5〜2 |
| KMS | キー + Encrypt/Decrypt | $1〜2 |
| **AWS 合計** | | **約 $8〜18** |

目標（仕様）は **インフラ $20/月以下 / 月 50 ジョブ**。上記なら余裕がある。Spot が全く取れず常時 On-Demand だと Fargate だけで $8〜15 になり、合計 **$15〜25** まで伸びうる。

### 5.3 ジョブ 1 件あたりの AWS 目安

| 実行時間 | Spot | On-Demand 目安 |
| -------- | ---- | -------------- |
| 30 分 | $0.01 前後 | $0.03 前後 |
| 2 時間 | $0.03〜0.04 | $0.10 前後 |
| 4 時間 | $0.06〜0.08 | $0.20 前後 |
| 6 時間（上限） | $0.10 前後 | $0.30 前後 |

S3 同期とログを足しても、**1 ジョブの AWS コストは数十セント以下**が普通。支配項は OpenAI 側である。

### 5.4 デプロイ 1 回

CodeBuild で Node + Python イメージをビルド（実測およそ 2 分）。東京 general1.small 相当なら **$0.1〜0.4/回**。ECR 上書きと CloudFront 無効化が少量乗る。日常の画面利用より、**頻繁な再デプロイの方が目立つ**ことがある。

### 5.5 OpenAI（AWS 外・各自負担）

gpt-5 系 + reasoning 高めで、HCD→FRG→CSV の長時間エージェントは **1 ジョブ数ドル〜数十ドル** になりうる。インフラ $10 台に対してこちらが桁で大きい。モデルと effort を作成画面で下げると効く。

アプリ内でも追跡できる。ジョブごとに使用モデル・入出力トークン・推定料金を記録し、プロジェクト一覧（合計とモデル別内訳）、チャット画面ヘッダー（ジョブ別内訳）、管理画面に表示する。単価は `packages/shared/src/pricing.ts` の表に基づく推定で、OpenAI の請求とは一致しないことがある（特に単価表にないモデルは `$—`）。

---

## 6. シナリオ比較

| シナリオ | AWS 月額の感じ | コメント |
| -------- | -------------- | -------- |
| 開発のみ（デプロイ済み、ジョブほぼ 0） | $2〜4 | KMS が目立つ |
| 個人で月 10 ジョブ | $4〜8 | |
| 数名で月 50 ジョブ | $8〜18 | 設計ターゲット |
| 月 50 ジョブかつ Spot 不調 | $15〜25 | Budgets $30 なら検知可能 |
| NAT ありに変更 | 上記 +$32〜 | 非推奨 |
| 常時 t3.medium | $30 前後 | 質問待ちでも課金。本構成の方が安い |

---

## 7. コストを抑える実装

- Fargate Spot 優先、容量不足時だけ On-Demand。
- `[QUESTION]` でタスク終了。回答までコンピュート課金ゼロ。
- NAT / 独自ドメイン / Container Insights / PITR なし。
- CloudFront Price Class 200。
- ログ 14 日。未完了マルチパート 3 日で削除。
- 同時実行上限で「気づかず何本も Spot が並ぶ」ことを防ぐ。
- janitor: ハートビート 15 分途絶で自動リトライ最大 2 回、質問待ち 7 日・キュー 24 時間で FAILED。

---

## 8. 監視と予算の運用

推奨:

1. **AWS Budgets** をアカウントに作成する（例: AWS 利用 $20 予測、$30 実績でメール）。
2. Cost Explorer でサービス別に見る。急増の第一候補は **Fargate**、次が **CloudWatch Logs** と **CodeBuild**。
3. ワーカーログ: スタック出力 `WorkerLogGroup`（現行例: `CobracAgents-WorkerLogsC1193B08-pBa5gactuB1r`）。
4. ジョブのトークン使用量と推定料金は Jobs.usage / Jobs.costUsd、プロジェクト合算は Projects.usage / Projects.costUsd（OpenAI 側の明細と突き合わせる用）。AWS 料金とは別。

未設定でもアプリは動く。ただし Budgets がないと、Spot フォールバックやログ急増に気づきにくい。

---

## 9. 環境変数（コストと規模に効くもの）

`.env`（リポジトリには入れない。`.env.example` が雛形）。

| 変数 | 既定 | 意味 |
| ---- | ---- | ---- |
| `COBRAC_ADMIN_EMAILS` | （必須） | 初回ログインで admin |
| `COBRAC_SELF_SIGNUP` | true | false で招待制 |
| `COBRAC_MAX_CONCURRENT_JOBS` | 2 | 全体の同時 Fargate 数 |
| `COBRAC_MAX_CONCURRENT_JOBS_PER_USER` | 1 | ユーザーあたり |
| `COBRAC_CODEX_MODEL` | 空 | 未指定時のモデル |
| `COBRAC_CODEX_REASONING_EFFORT` | high | 未指定時の effort |

同時実行を上げると Fargate が線形に増える。モデルを大きいものに固定すると OpenAI 側だけが増える。

---

## 10. 削除・残留コスト

`cdk destroy` しても残るもの（保管料が微量でも続く）:

- KMS CMK（無効化〜待ち時間のあとでないと消えない）
- Cognito User Pool
- DynamoDB Users / Projects / Jobs / Messages
- S3 Artifacts（オブジェクトが残っているとバケット削除不可）

捨てる手順の概略: 成果物バケットを空にする → テーブル削除 → User Pool 削除 → KMS を削除予約。ECR イメージと CloudWatch ロググループも確認する。

---

## 11. 今後コストが増える変更

| 変更 | 影響 |
| ---- | ---- |
| NAT + プライベートサブネット | 固定 +$32〜 |
| PITR / バージョニング | 保管がおよそ倍近く |
| ログを無期限・Insights | CloudWatch が主役になりうる |
| 同時実行を 10 に | ピークの Fargate が 5 倍 |
| 独自ドメイン + ACM | 金額は小さい。運用が増える |

現状の「安さ」は、**使っていない時間にワーカーを落とすこと**と **NAT を置かないこと**に依存する。
