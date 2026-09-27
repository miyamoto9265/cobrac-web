# CSV作成タスク概要

## 目的
本タスクでは、HCDおよびFRGの作業で生成されたmdファイルを読み込み、構造化されたCSVファイルを5種類作成します。

---

## 前提条件

本タスクを開始する前に、以下のファイルが作成済みであることを確認してください：

- `{ProjectName}/{ProjectName}_HCD/` フォルダ内: `2_BIF.md`、`3_UC.md`、`5_Connection.md`
- `{ProjectName}/{ProjectName}_FRG/` フォルダ内: `3_最終FRG.md`、`4_機能詳細.md`

（`{ProjectName}` は `instruction_0.md` で定義したプロジェクト名（Project ID、英語）のフォルダです）

---

## 作成するCSVファイル

### 1. Project.csv
プロジェクトのメタデータと xlsx 出力用のシート定義を記録します。

**テンプレート**: リポジトリ直下の `Project.csv`（固定行・列構造をそのまま使用する）

**データソース**:
- Contributor / Project ID / Description: 下記の作成手順
- 4行目以降（Sheet Name 等）: テンプレートの固定内容

| 列 | フィールド名 | 内容 |
| --- | ----------- | ---- |
| A | Contributor | プロジェクトの主要な作成者名（英語） |
| B | Project ID | `instruction_0.md` で決定した `{ProjectName}` |
| C | List of contributors | 共同作成者がいる場合はセミコロン区切りで列挙。単独の場合は Contributor と同じ値 |
| D | Description | プロジェクトの概要（英語） |
| E | BRA version | 固定値 `CoBRAC-v1-0` |

**作成手順**:
1. テンプレート `Project.csv` の内容（ヘッダー行・Sheet Name 行・注記行）をそのままコピーする
2. 2行目（データ行）の A 列 **Contributor** を、ユーザーに確認して設定する（指定がなければ作業者名を使用する）
3. 2行目の B 列 **Project ID** に `{ProjectName}` を設定する
4. 2行目の C 列 **List of contributors** に、Contributor と同じ値（または複数作成者をセミコロン区切り）を設定する
5. 2行目の D 列 **Description** に、`2_BIF.md` 冒頭の TLF / ROI 行（例: `## TLF: VOR学習 / ROI: 小脳（フロキュラス）`）を英訳した1文を設定する
6. 2行目の E 列 **BRA version** は `CoBRAC-v1-0` のままとする
7. `{ProjectName}/{ProjectName}_CSV/Project.csv` として保存する

---

### 2. References.csv
使用されたすべての文献を記録します。

**データソース**: `2_BIF.md` の参考文献リスト、`4_Connection.md` の Reference ID 列

| 列 | フィールド名 | 内容 |
| --- | ----------- | ---- |
| A | Reference ID | [著者, 年] 形式の文献識別子 |
| B | DOI | DOI（不明の場合は N/A） |

**作成手順**:
1. `2_BIF.md` 冒頭の参考文献リストから全エントリを抽出する
2. `４_Connection.md` の Reference ID 列を確認し、`2_BIF.md` に含まれていない文献があれば追加する
3. 重複を排除して `References.csv` として保存する

---

### 3. Circuits.csv
すべての Uniform Circuit を記録します。

**データソース**: `3_UC.md`

| 列 | フィールド名 | 内容 |
| --- | ----------- | ---- |
| A | Circuit ID | UC の識別子（バッククォートなし） |
| B | Source of ID | このUCを支持する主要な文献の Reference ID（[著者, 年] 形式） |
| C | Names | UC の神経科学的正式名称 |
| D | Transmitter | 神経伝達物質（不明な場合は空欄） |
| E | Modulation Type | Inhibitory / Excitatory / Modulatory（不明な場合は空欄） |
| F | Comments | UC の役割と対応する神経組織の説明 |

**作成手順**:
1. `3_UC.md` の表から各UCのデータを抽出する
2. すべての内容を英訳する
3. Circuit ID のバッククォートを除去する
4. `Circuits.csv` として保存する

---

### 4. Connections.csv
すべての Connection を記録します。

**データソース**: `5_Connection.md`

| 列 | フィールド名 | 内容 |
| --- | ----------- | ---- |
| A | Sender Circuit ID (sCID) | 送信元 UC の識別子（バッククォートなし） |
| B | Receiver Circuit ID (rCID) | 受信先 UC の識別子（バッククォートなし） |
| C | Comments | 接続の特性と情報内容 |
| D | Reference ID | [著者, 年] 形式の Reference ID |
| E | Taxon | 動物種 |
| F | Measurement method | 実験手法 |
| G | Pointers on literature | 文献内の参照箇所 |
| H | Pointers on figure | 文献内の図の参照箇所 |

**作成手順**:
1. `5_Connection.md` の表から各 Connection のデータを抽出する
2. すべての内容を英訳する
3. Sender / Receiver Circuit ID のバッククォートを除去する
4. `Connections.csv` として保存する

---

### 5. FRG.csv
FRG（グループノード）と HCD（Uniform Circuit）を統合した構造化データを記録します。

**データソース**:
- GN に関するデータ: `3_最終FRG.md`（構造）、`4_機能詳細.md`（機能詳細）
- UC に関するデータ: `3_UC.md`（構造・機能詳細）、`5_Connection.md`（接続情報）

| 列 | フィールド名 | GN（グループノード）の場合 | UC（Uniform Circuit）の場合 |
| --- | ----------- | ------------------------- | --------------------------- |
| A | Node ID | `R.*` 形式（`3_最終FRG.md` の Node ID より） | `U.*` 形式（Circuit ID に "U." プレフィックスを付加） |
| B | Subnodes | 子ノードをセミコロン区切りで記述（バッククォートなし）。子が UC の場合は U. プレフィックスを付加 | 空欄 |
| C | Circuit ID | 空欄 | `3_UC.md` の Circuit ID（バッククォートなし） |
| D | Projected Circuits | 空欄 | `5_Connection.md` でこのUCが Sender として登場するすべての Receiver Circuit ID（セミコロン区切り、U. プレフィックスなし） |
| E | Capability | `4_機能詳細.md` の Capability | `3_UC.md` の Capability |
| F | Mechanism | `4_機能詳細.md` の Mechanism | `3_UC.md` の Mechanism |
| G | Implementation of Uniform Circuit | 空欄 | `3_UC.md` の Implementation |
| H | Requirements Realization by Interface | `4_機能詳細.md` の Requirement realization by interface | `3_UC.md` の Requirement realization by interface |
| I | Requirements | `4_機能詳細.md` の Requirement | `3_UC.md` の Requirement |
| J | Output Semantics | 空欄 | `3_UC.md` の Output Semantics |
| K | Comments | `3_最終FRG.md` の Comment | `3_UC.md` の Comment |

**作成手順**:
1. `3_最終FRG.md` からすべての GN の Node ID・Subnodes・Comment を抽出する
2. `3_UC.md` からすべての UC のデータを抽出し、Circuit ID に "U." プレフィックスを付加して Node ID とする
3. GN については `4_機能詳細.md` から機能関連項目（Requirement、Requirement realization by interface、Capability、Mechanism）を取得する
4. UC の Projected Circuits は `5_Connection.md` で Sender として登場する行の Receiver Circuit ID のリストとする（U. プレフィックスを付加）
5. GN の Projected Circuits は `3_最終FRG.md` の構造からこのGNをSubnodesに含む親ノードの Node ID を特定する
6. すべての内容を英訳する
7. バッククォートを除去する
8. `FRG.csv` として保存する

---

## 出力先

`{ProjectName}/{ProjectName}_CSV/` フォルダを作成し、すべての CSV ファイルをその中に保存してください。ファイル名は以下のとおりです：

- `Project.csv`
- `References.csv`
- `Circuits.csv`
- `Connections.csv`
- `FRG.csv`

---

## 成果物一覧

1. **Project.csv**: プロジェクトメタデータ（Contributor、Project ID、Description 等）
2. **References.csv**: 全参考文献リスト
3. **Circuits.csv**: 全 Uniform Circuit データ
4. **Connections.csv**: 全 Connection データ
5. **FRG.csv**: FRG と HCD を統合した構造化データ
