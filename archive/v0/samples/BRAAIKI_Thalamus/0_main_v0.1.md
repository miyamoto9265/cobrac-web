# HCD作成タスク概要

## 目的
本タスクでは、脳領域における情報処理を構造化して記述したHCD（Hypothetical Component Graph）を作成します。ユーザーが指定する脳領域と機能に基づき、神経科学的知見を統合した情報処理モデルを構築することが目標です。

---

## HCDの定義と構成要素

### HCDとは
HCD（Hypothetical Component Graph）は、特定の脳領域が実行する情報処理を、神経科学的証拠に基づいて記述したグラフ構造データです。脳の計算メカニズムを、メゾスコピックレベルの神経組織単位で抽象化し、情報の流れとして表現します。

### HCDの構成要素

#### 1. Top Level Function（TLF）とRegion of Interest（ROI）
- **TLF（トップレベル機能）**: HCDで記述する対象となる、脳領域や神経組織で実行される計算機能
- **ROI（対象領域）**: TLFが実現される脳領域の神経組織の範囲
- ROI内において、Uniform Componentによる情報処理の流れがグラフ構造として記述されます

#### 2. Uniform Component（UC）
UCは、HCDにおける情報処理の基本単位です。以下の特性を持ちます：
- **定義**: メゾスコピックレベルで同質的な情報をコードしていると解釈される神経組織の最小単位
- **役割**: グラフ構造のノードとして、特定の計算機構を担当
- **必須要素**: 各UCには、Interface（入力情報）、Output Semantics（出力情報の意味内容）、Function（計算機能）が定義される

#### 3. Connection
- **定義**: 神経科学的事実（BIF）に基づいて定義されたUC間の接続
- **役割**: UC間の情報の受け渡し経路を表現
- ConnectionによってUCのInterfaceが確定されます

#### 4. BIF（Brain Information Flow）
- **定義**: 神経細胞の解剖学的投射の有無に関するデータ
- **役割**: Connectionを定義する際の神経科学的根拠

---

## タスク実行手順

ユーザーが指定するTLFとROIに基づいてHCDを作成します。各手順では柔軟な思考と文献調査が必要となるため、**まず1_Thinking.mdファイルを作成し**、調査結果や思考過程をログとして記録しながら進めてください。

### ステップ1: ROIとTLFの妥当性検証

**目的**: 指定された脳領域が、目的とする機能を実現するのに適切かを確認する

**作業内容**:
- ROIの入出力情報を整理
  - TLFを実現するために必要な入力情報（ROI_Input）を特定
  - TLFから期待される出力情報（ROI_Output）を特定
- Web検索や文献調査を活用し、ROIがTLF実現に適しているか検証
- ROIが不適切である可能性がある場合は、神経科学的根拠とともにユーザーへ報告

**成果物**: 1_Thinking.mdに分析結果を記録

### ステップ2: BIFの構築

**目的**: ROI内の神経接続を網羅的に調査し、解剖学的接続データベースを構築する

**作業内容**:
- Web検索や文献データベースを用いて、ROIに関連する神経接続を徹底的に調査
- 2_BIF.mdを作成し、以下の表形式で神経接続を記録：

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 投射元組織名 | 投射先組織名 | 接続の概要(簡潔に) | 根拠となる論文（著者, 年, URL） |

**注意事項**:
- ROI外の神経組織が含まれる場合は、組織名に「(ROI外)」を付記
- 複数の文献で確認された接続を優先的に記載
- 投射の強度や性質（興奮性/抑制性）が明らかな場合はCommentに記載

**成果物**: 2_BIF.md

### ステップ3: Uniform Component（UC）の定義

**目的**: BIFに基づいて、情報処理の基本単位となるUCを適切に定義する

**UCの採用基準**:
1. **ROI内に位置する**（最重要）
2. ROI内で必要な情報処理を担当している
3. 同質的な情報をコードしている神経組織である
4. メゾスコピックレベルとして適切な粒度（大きすぎず、小さすぎない）

**作業内容**:
- 3_UC.mdを作成し、以下の表形式でUCを定義：

| Uniform Component | Comment |
| ------ | -------- |
| `UC名` | UCの役割と対応する神経組織の説明 |

**命名規則**:
- スペースを使用しない
- 適切な略称を使用
  - 例: dorsomedial thalamus → `DMT`
  - 例: ventral tegmental area → `VTA`
- **重要**: UC名を記述する際は、必ずバッククォート（`）で囲む
  - 正しい例: `UC名`、`DMT`、`VTA`
  - 誤った例: UC名、DMT、VTA

**成果物**: 3_UC.md

### ステップ4: Connectionの定義とInterfaceの追加

**目的**: UC間の接続を定義し、各UCの入力情報（Interface）を確定する

#### 4-1. Connectionの定義

**作業内容**:
- 4_Connection.mdを作成
- BIFで特定した神経接続を、定義したUC間の接続として記述：

| Sender(UC) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `送信元UC` | `受信先UC` | 接続の特性と情報内容(簡潔に) | 根拠となる論文（著者, 年, URL） |

**注意事項**:
- Sender/ReceiverはUC名で記述（神経組織名ではない）
- **UC名は必ずバッククォート（`）で囲む**
- BIFで特定した解剖学的接続を、適切なUC間の接続にマッピング
- 一つのBIFが複数のConnection、または複数のBIFが一つのConnectionに対応する場合がある

#### 4-2. Interfaceの追加

**作業内容**:
- 3_UC.mdに戻り、各UCのInterfaceを追加
- Interfaceは、そのUCへ入力を送るUCのリストをコンマ区切りで記述：

| Uniform Component | Comment | Interface |
| ------ | -------- | -------- |
| `UC名` | UCの説明 | `入力元UC1`, `入力元UC2`, ... |

**注意**: UC名は必ずバッククォートで囲む

**成果物**: 4_Connection.md、3_UC.md（更新）

### ステップ5: Output Semanticsの定義

**目的**: 各UCが出力する情報の意味を定義する

**作業内容**:
- 3_UC.mdに戻り、各UCのOutput Semanticsを追加
- Output Semanticsは、そのUCがコードしている情報の意味を記述：

| Uniform Component | Comment | Interface | Output Semantics |
| ------ | -------- | -------- | -------- |
| `UC名` | UCの説明 | `入力元UC1`, `入力元UC2`, ... | このUCが表現する情報の意味 |

**Output Semantics記述のポイント**:
- そのUCがどのような情報をコードしているかを明確に記述
- 計算神経科学的な用語を使用（例: 報酬予測、行動選択、感覚特徴、内部状態）
- 実験的証拠から特定された情報表現を優先的に記載
- 下流のUCがどのような情報を必要とするかを考慮

**成果物**: 3_UC.md（更新）

### ステップ6: Function定義と追加

**目的**: 各UCが実行する計算機能を定義する

**作業内容**:
- 3_UC.mdに戻り、各UCのFunctionを追加
- Functionは、Interfaceで得られる入力に基づいて、そのUCが実行する情報処理を記述：

| Uniform Component | Comment | Interface | Output Semantics | Function |
| ------ | -------- | -------- | -------- | -------- |
| `UC名` | UCの説明 | `入力元UC1`, `入力元UC2`, ... | このUCが表現する情報の意味内容 | 実行する計算処理の説明 |

**Function記述のポイント**:
- 入力情報をどのように変換・統合してOutput Semanticsを生成するかを明確に記述
- Interfaceに記述された入力UCの名前とOutput Semanticsをすべて挙げて記述する必要がある
   - (`入力元UC1`|入力元UC1のOutput Semantics)という形式でセットで記述する。
- Output Semanticsとの整合性を保つ
- 計算神経科学的な用語（例: 統合、ゲーティング、選択、予測、変換）を適切に使用
- 実験的証拠がある場合は、具体的な計算メカニズムを記載

**成果物**: 3_UC.md（更新）

---

### ステップ7: 全体検証

**目的**: HCD全体の整合性を確認し、問題を修正する

**検証項目**:
- **接続の整合性**: ConnectionとInterfaceが一致しているか
- **情報フローの妥当性**: ROI_InputからROI_Outputへの情報処理経路が成立しているか
- **UCの適切性**: 重複や欠落がないか、粒度は適切か
- **文献的裏付け**: すべてのConnectionに適切な文献が引用されているか
- **TLFとの整合性**: 定義されたHCDがTLFを実現できる構造になっているか

**作業内容**:
- 5_Verification.mdに検証結果と修正内容を記録
- 必要に応じて各ファイルを修正

**成果物**: 5_Verification.md

---

### ステップ8: 最終報告

**目的**: 完成したHCDを包括的に報告する

**作業内容**:

#### 8-1. 最終報告書の作成
6_FinalReport.mdを作成し、以下の内容を含める：
- **TLFとROIの概要**: 対象とした機能と脳領域
- **定義されたUCの一覧**: 各UCの役割と根拠
- **情報処理フロー**: ROI_InputからROI_Outputへの処理の流れ
- **主要な発見**: 調査過程で得られた重要な知見
- **制約と今後の課題**: HCDの限界や今後の改善点

#### 8-2. HCD図の作成
7_diagram.mdを作成し、draw.ioにコンバートするためにmarmeid形式で以下を図示：
- UCをノードとして配置
- Connectionを有向エッジとして表現
  - ConnectionにはOutput Semanticsを書く
- ROI内、ROI_Input、ROI_Outputで色を分けて明示
  - ROI内: 黄色系
  - ROI_input: 水色系
  - ROI_Output: マゼンタ系
- 改行(<br/>)は使用しない


以下の書き方を参考にしてください。

**成果物**: 6_FinalReport.md、7_diagram.md

---

## 成果物一覧

本タスクを完了すると、以下のファイルが作成されます：

1. **1_Thinking.md**: 思考過程と分析ログ
2. **2_BIF.md**: 神経接続データベース
3. **3_UC.md**: Uniform Component定義（Interface、Output Semantics、Function含む）
4. **4_Connection.md**: UC間の接続定義
5. **5_Verification.md**: 検証結果と修正内容
6. **6_FinalReport.md**: 最終報告書
7. **7_diagram.md**: HCD構造図（XML形式）
