# CoBRAC ユーザーガイド — 内容構成案

> 領域会議向け。外部参加者が初めて CoBRAC で BRA（Brain Representation Architecture）データを作成できることを目的とする。
> 本ドキュメントは HTML / PDF 化する前の**内容決定用**の構成案です。

---

## 1. ドキュメントの基本方針

| 項目 | 方針 |
|------|------|
| **想定読者** | 神経科学・計算神経科学に関心のある研究者。CoBRAC 未経験。Cursor 等の AI 支援ツールは初めてでもよい |
| **到達目標** | ROI と TLF を指定し、HCD → FRG → CSV → `.bra.xlsx` まで一連の流れを自分で（AI 支援付きで）実行できる |
| **文体** | 日本語。専門用語は初出時に平易な説明を付ける |
| **分量の目安** | HTML 約 25〜35 ページ相当（PDF 印刷時） |
| **2 形式の役割** | HTML＝画面閲覧・リンク・目次ナビ。PDF＝配布・印刷・オフライン参照 |

---

## 2. 章立て（全 12 章 + 付録）

### 第 1 章：はじめに

**目的：** CoBRAC が何をするツールか、5 分で把握できるようにする。

**内容：**
- CoBRAC の位置づけ（脳領域の情報処理を構造化して記述するワークフロー）
- 最終成果物 `.bra.xlsx` の説明（5 シート：Project / References / Circuits / Connections / FRG）
- 本ガイドの読み方（初めての人は第 2〜4 章 → 第 5 章以降を順に）
- 領域会議での想定作業時間の目安（例：HCD 半日〜、FRG 半日〜、CSV+xlsx 1 時間程度 ※要調整）

**【画像 1-1】** CoBRAC 全体像の概念図  
- TLF / ROI → HCD（UC と Connection）→ FRG（GN 階層）→ CSV → `.bra.xlsx` の流れを 1 枚のフロー図で示す  
- 各段階の成果物ファイル名もラベル表示

**【画像 1-2】** 完成 `.bra.xlsx` のスクリーンショット  
- Excel で 5 シートのタブが見える状態（中身はサンプルプロジェクト `VOR学習_小脳` 等）

---

### 第 2 章：CoBRAC の基本概念

**目的：** 作業中に繰り返し登場する用語を、作業前に整理する。

**内容：**
- **TLF**（Top Level Function）：記述対象の計算機能
- **ROI**（Region of Interest）：TLF が実現される脳領域
- **UC**（Uniform Circuit）：HCD の基本単位（神経集団）。※「Circuit」は神経科学の回路とは別用法
- **BIF**（Brain Information Flow）：解剖学的投射に基づく接続根拠
- **Connection**：UC 間の情報の受け渡し
- **Interface / Output Semantics**：UC の入出力と出力の意味
- **GN**（Group Node）：FRG の中間ノード（機能の部分分解）
- **HCD と FRG の関係**：HCD＝「誰が誰につながるか」、FRG＝「機能がどう階層分解され UC に接地するか」

**【画像 2-1】** HCD と FRG の対比図  
- 左：HCD（UC ノード＋有向エッジ、ROI 内外の色分け）  
- 右：FRG（TLF → GN → UC の木構造）  
- 同じ UC が両方に登場する関係を矢印で示す

**【画像 2-2】** UC の Interface 記法の例  
- `([出力UC], ...) = UC名([入力UC], ...)` の具体例を 1 つ図解

---

### 第 3 章：事前準備

**目的：** 作業開始前に環境とフォルダを整える。

**内容：**
- 必要なソフトウェア
  - Python 3.x
  - パッケージ：`pandas`, `openpyxl`（`requirements.txt` 参照）
  - AI 支援環境：Cursor（または同等の AI コーディングアシスタント）
  - 文献調査：Web ブラウザ
  - 任意：draw.io（HCD 図の可視化用）
- CoBRAC リポジトリの `_latest_version` フォルダ構成
  - `instruction_0.md` 〜 `instruction_3_csv.md`
  - `csv_to_excel.py`
  - サンプルプロジェクト（`VOR学習_小脳/` 等）
- 作業者が決める情報
  - **Contributor**（作成者名・英語）
  - **Project ID**（英語、TLF/ROI がわかる ID）
  - **TLF** と **ROI** の明示

**【画像 3-1】** `_latest_version` フォルダのツリー構造  
- instruction ファイルとサンプルプロジェクトフォルダが見える Explorer / ファイルツリー

**【画像 3-2】** Python 環境セットアップのターミナル例  
- `pip install -r requirements.txt` 実行成功画面

---

### 第 4 章：全体ワークフロー

**目的：** 作業の順序と依存関係を一覧で把握する。

**内容：**
- 作業順序（**厳守**）
  1. `instruction_0.md` — フォルダ作成
  2. `instruction_1_HCD.md` — HCD 作成（**FRG は HCD 完了まで読まない**）
  3. `instruction_2_FRG.md` — FRG 作成
  4. `instruction_3_csv.md` — CSV 作成
  5. `csv_to_excel.py` — xlsx 生成
- プロジェクトフォルダ構造

```
{ProjectName}/
├── {ProjectName}_HCD/    ← HCD 作業・8 ファイル
├── {ProjectName}_FRG/    ← FRG 作業・5 ファイル
└── {ProjectName}_CSV/    ← 5 CSV + 出力 xlsx
```

- 各フェーズの入力・出力対応表（1 表）

**【画像 4-1】** フェーズ別タイムライン / ガント風の簡易図  
- Phase 0〜4 と成果物ファイル名

**【画像 4-2】** プロジェクトフォルダ完成例  
- `VOR学習_小脳` 等の実フォルダ展開スクリーンショット

---

### 第 5 章：Phase 0 — プロジェクト開始

**目的：** 最初の 1 歩を具体的に実行できるようにする。

**内容：**
- Project ID の命名ガイド（英語、Kebab-case 推奨、例示）
- ROI / TLF の指定方法と AI への依頼例
  - 例：「ROI: 海馬、TLF: 空間ナビゲーション で HCD を作成してください」
- `instruction_0.md` に従ったフォルダ作成手順
- **注意：** HCD 完了前に FRG 指示書を開かない理由（UC 定義が未確定のため）

**【画像 5-1】** Cursor で `instruction_0.md` を開き、AI に依頼しているチャット例  
- ROI / TLF を入力したプロンプトと、フォルダ作成を依頼する様子

---

### 第 6 章：Phase 1 — HCD の作成

**目的：** 8 ステップの HCD 作業を、成果物単位で理解する。

**内容（各ステップを表形式で概要＋要点）：**

| ステップ | 成果物 | 要点 |
|---------|--------|------|
| 1 | `1_Thinking.md` | ROI/TLF の妥当性検証、ROI 入出力整理 |
| 2 | `2_BIF.md` | 神経接続の文献調査、参考文献リスト |
| 3 | `3_UC.md`（初版） | UC 定義、Kebab-case 命名、ROI 内外の区別 |
| 4 | `4_Connection.md` + `3_UC.md` 更新 | Connection 定義、Interface 追加 |
| 5 | `3_UC.md` 更新 | Output Semantics |
| 6 | `3_UC.md` 更新 | Requirement / Capability / Mechanism / Implementation |
| 7 | `5_Verification.md` | 整合性検証 |
| 8 | `6_FinalPaper.md`, `7_EasyToUnderstand.md`, `8_diagram.md` | 報告・解説・Mermaid 図 |

- よくある注意点（チェックリスト形式）
  - UC 名はバッククォートで囲む（md 内）
  - ROI 外 UC は `noROI(input)` / `noROI(output)` をコメント
  - Connection と Interface の一致

**【画像 6-1】** `3_UC.md` の表部分スクリーンショット（列がわかる程度）

**【画像 6-2】** `8_diagram.md` から生成した HCD 図（draw.io または Mermaid レンダリング）  
- ROI 内 / noROI(input) / noROI(output) の色分け凡例付き

**【画像 6-3】** HCD 情報フロー図（ROI_Input → 内部 UC → ROI_Output）

---

### 第 7 章：Phase 2 — FRG の作成

**目的：** FRG の 6 ステップと GN-UC 制約を理解する。

**内容：**
- ステップ概要
  1. `1_初期分解結果.md` — TLF の機能分解（UC 紐づけはまだしない）
  2. `2_最適化FRG.md` — 冗長 GN のマージ
  3. `3_最終FRG.md` — ROI 内 UC との紐づけ、Interface 追加
  4. `4_機能詳細.md` — TLF/GN の Requirement 等
  5. `5_FRG作成レポート.md` — 判断根拠の記録
- **重要制約**（目立つボックスで記載）
  - 各 GN は **複数の UC** に分解される
  - 1 GN に接続する UC は **最大 2 つ**
  - 1 UC に接続する GN は **最大 2 つ**
  - 制約違反時はステップ 1 に戻る
- GN 命名：`R.` プレフィックス + Kebab-case
- UC 参照：`U.` プレフィックス

**【画像 7-1】** FRG 階層図（TLF → GN → UC）の Mermaid レンダリング例

**【画像 7-2】** GN-UC 接続数制約の模式図  
- OK 例（1 GN → 2 UC）と NG 例（1 GN → 3 UC）を並べて表示

**【画像 7-3】** `3_最終FRG.md` の表（Node ID / Subnodes / Interface 列）

---

### 第 8 章：Phase 3 — CSV ファイルの作成

**目的：** 5 種類の CSV と元 md ファイルの対応を理解する。

**内容：**
- 前提：HCD の `2_BIF.md`, `3_UC.md`, `4_Connection.md`（※instruction_3 では `5_Connection.md` と記載 — 実際のファイル名 `4_Connection.md` との差異を注記）および FRG の `3_最終FRG.md`, `4_機能詳細.md` が揃っていること
- 各 CSV の概要表

| ファイル | 主なデータソース | 用途 |
|----------|-----------------|------|
| Project.csv | テンプレート + メタデータ | プロジェクト情報 |
| References.csv | `2_BIF.md` 等 | 文献一覧 |
| Circuits.csv | `3_UC.md` | 全 UC |
| Connections.csv | `4_Connection.md` | 全 Connection |
| FRG.csv | FRG + HCD 統合 | GN と UC の統合データ |

- 英訳ルール（CSV 内容は英語）
- バッククォート除去、プレフィックス（`U.`）の付け方

**【画像 8-1】** 5 つの CSV を Excel / テキストエディタで開いた一覧スクリーンショット

**【画像 8-2】** md → CSV の対応関係図（矢印付き）

---

### 第 9 章：Phase 4 — `.bra.xlsx` の生成

**目的：** Python スクリプトを実行して最終成果物を得る。

**内容：**
- 実行場所：`_latest_version` フォルダ
- コマンド例

```powershell
cd _latest_version
python csv_to_excel.py
```

- 対話入力：Contributor、Project ID
- スクリプトが行う加工（Circuits / Connections / FRG 列の追加・結合）を簡潔に説明
- 出力先：`{ProjectName}/{ProjectName}_CSV/{ProjectID}.bra.xlsx`
- 成功メッセージの確認

**【画像 9-1】** ターミナルで `csv_to_excel.py` を実行し、Contributor / Project ID を入力している画面

**【画像 9-2】** 生成された `.bra.xlsx` を開き、Circuits シートの列構成が加工後形式になっている画面

---

### 第 10 章：AI アシスタント（Cursor）の使い方

**目的：** 外部参加者が AI 支援付きで instruction に沿った作業を進められるようにする。

**内容：**
- Cursor の基本操作（プロジェクトを開く、チャット、Agent モード）
- instruction ファイルの参照の仕方
  - 「`instruction_1_HCD.md` に従って、ROI: ○○、TLF: ○○ で作業を開始してください」
- フェーズ移行時のプロンプト例
  - HCD 完了 → FRG 開始
  - FRG 完了 → CSV 作成
- AI 出力の確認ポイント（文献引用、UC 命名、制約遵守）
- 人間が必ず確認すべき箇所（神経科学的妥当性、文献の正確性）

**【画像 10-1】** Cursor の画面構成（ファイルツリー、エディタ、チャット）

**【画像 10-2】** フェーズ移行プロンプト例のチャットスクリーンショット

---

### 第 11 章：品質チェックリスト

**目的：** 提出前の自己確認用。

**内容：**
- HCD チェック（10 項目程度）
- FRG チェック（GN-UC 制約、Interface 整合等）
- CSV チェック（英訳、重複 Reference、列の欠落）
- xlsx チェック（5 シート、Contributor / Project ID の反映）

---

### 第 12 章：トラブルシューティング

**目的：** よくあるエラーと対処。

**内容：**
- `CSVフォルダが見つかりません` → Project ID / フォルダ名の不一致
- `Project.csv が見つかりません` → CSV フェーズ未完了
- FRG で GN-UC 制約違反 → 分解の見直し
- Connection と Interface の不整合 → `5_Verification.md` の再実施
- Python パッケージエラー → `pip install` 再実行

---

### 付録 A：用語索引（五十音 / アルファベット順）

### 付録 B：ファイル一覧早見表

| ファイル | フェーズ | 必須 |
|---------|---------|------|

（全成果物を 1 表に）

### 付録 C：命名規則まとめ

- UC：Kebab-case、スペース不可
- GN：`R.` + Kebab-case
- FRG CSV の UC：`U.` プレフィックス

### 付録 D：サンプルプロジェクトへの参照

- `VOR学習_小脳` フォルダを参照例として案内

---

## 3. HTML / PDF 制作方針（次ステップ）

| 項目 | 方針 |
|------|------|
| **HTML** | 単一 `index.html` + `styles.css`。目次はサイドバー固定。画像は `images/` フォルダ |
| **画像未添付時** | プレースホルダーボックスに【画像 X-Y】の説明文を表示（後から `<img>` に差し替え） |
| **PDF** | HTML から印刷用 CSS（`@media print`）または weasyprint / ブラウザ印刷で生成。ファイル名 `CoBRAC_UserGuide.pdf` |
| **言語** | 日本語メイン。固有名詞（TLF, ROI, UC 等）は英語表記を併記 |

---

## 4. 画像一覧（制作待ち）

| ID | 章 | 内容 | 推奨形式 |
|----|-----|------|---------|
| 1-1 | 第 1 章 | CoBRAC 全体フロー概念図 | PNG/SVG |
| 1-2 | 第 1 章 | 完成 xlsx のシートタブ | スクリーンショット |
| 2-1 | 第 2 章 | HCD vs FRG 対比図 | 図解 |
| 2-2 | 第 2 章 | Interface 記法の例 | 図解 |
| 3-1 | 第 3 章 | フォルダツリー | スクリーンショット |
| 3-2 | 第 3 章 | pip install 成功 | スクリーンショット |
| 4-1 | 第 4 章 | フェーズタイムライン | 図解 |
| 4-2 | 第 4 章 | プロジェクトフォルダ例 | スクリーンショット |
| 5-1 | 第 5 章 | Cursor 初回プロンプト | スクリーンショット |
| 6-1 | 第 6 章 | 3_UC.md の表 | スクリーンショット |
| 6-2 | 第 6 章 | HCD 構造図（色分け） | 図 |
| 6-3 | 第 6 章 | ROI 入出力フロー | 図解 |
| 7-1 | 第 7 章 | FRG 階層 Mermaid 図 | 図 |
| 7-2 | 第 7 章 | GN-UC 制約 OK/NG | 図解 |
| 7-3 | 第 7 章 | 3_最終FRG.md の表 | スクリーンショット |
| 8-1 | 第 8 章 | 5 CSV 一覧 | スクリーンショット |
| 8-2 | 第 8 章 | md→CSV 対応図 | 図解 |
| 9-1 | 第 9 章 | csv_to_excel 実行 | スクリーンショット |
| 9-2 | 第 9 章 | 加工後 Circuits シート | スクリーンショット |
| 10-1 | 第 10 章 | Cursor 画面構成 | スクリーンショット |
| 10-2 | 第 10 章 | フェーズ移行チャット | スクリーンショット |

**合計 21 点**（うちスクリーンショット 12、図解 9）

---

## 5. 確認したい点（作成前にユーザー判断が望ましい項目）

1. **言語**：日本語のみでよいか、英語版も必要か
2. **AI ツール**：Cursor 固定でよいか、他ツール（ChatGPT 等）にも言及するか
3. **instruction_3 の Connection ファイル名**：`5_Connection.md` と記載されているが、HCD 成果物は `4_Connection.md`。ガイドでは実態に合わせて修正注記する想定
4. **領域会議の時間**：各フェーズの目安時間を記載するか
5. **深さ**：HCD ステップ 6 の Requirement / Mechanism / Implementation の書き方まで詳述するか、instruction 参照に留めるか（本案は**概要＋instruction 参照**で、詳細は instruction に委ねる）

---

## 6. 次のアクション

本構成案で問題なければ、以下を `userguide/` に作成します。

1. `index.html` — 上記 12 章 + 付録、画像プレースホルダー付き
2. `styles.css` — 閲覧・印刷両対応
3. `images/` — 空フォルダ（README に画像 ID 対応表）
4. PDF 生成手順または `CoBRAC_UserGuide.pdf` 本体
