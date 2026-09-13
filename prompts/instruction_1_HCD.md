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
- ROI内において、Uniform Circuitによる情報処理の流れがグラフ構造として記述されます

#### 2. Uniform Circuit（UC）
UCは、HCDにおける情報処理の基本単位です。以下の特性を持ちます：
- **定義**: メゾスコピックレベルで同質的な情報をコードしていると解釈される神経組織の最小単位。
  - **注意点**: 誤解しやすいのですが、UCの"Circuit"は独自に定義された用法によるもので、神経科学におけるシナプス接続/軸索投射は無関係です。単に**神経集団**という意味で定義されています。
- **役割**: グラフ構造の**ノード**として、特定の計算機構を担当
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

ユーザーが指定するTLFとROIに基づいてHCDを作成します。`instruction_0.md` に従い、instructionファイルが存在するフォルダに `{ProjectName}/` フォルダを作成し、その中に `{ProjectName}_HCD/` 作業フォルダを作成してその中で作業してください（`{ProjectName}` はプロンプトで与えられた Project ID）。

全ステップ（1〜8）の成果物が完成したら `[STEP_COMPLETE] HCD` を出力してください。

### ステップ1: ROIとTLFの妥当性検証

**目的**: 指定された脳領域が、目的とする機能を実現するのに適切かを確認する

**作業内容**:
- Web検索・文献調査を活用し、ROIがTLF実現に適しているか検証
  - もしROIあるいはTLFが存在しない場合は、妥当なROIあるいはTLFを調査によって決定してください。
- ROIが不適切である可能性がある場合は、神経科学的根拠と代替案を添えて `[QUESTION]...[/QUESTION]` 形式でユーザーへ質問し、ターンを終了して回答を待つ（`instruction_0.md` の質問ルール参照）。回答を受けてから作業を再開する
- ROIの入出力情報を整理
  - TLFを実現するためにROIに入力される必要がある情報（ROI_Input）を特定
  - TLFを実現するためにROIから出力されることが期待される情報（ROI_Output）を特定
- **1_Thinking.md**に、調査結果や思考過程をログとして記録してください。

**成果物**: 1_Thinking.mdに分析結果を記録

---

### ステップ2: BIFの構築

**目的**: ROI内の神経接続を網羅的に調査し、解剖学的接続データベースを構築する

**作業内容**:
- Web検索や文献データベースを用いて、ROIに関連する神経接続を徹底的に調査
- 2_BIF.mdを作成し、以下の形式で記録：

**参考文献リスト**（ファイル冒頭に記載）：

| Reference ID | DOI |
| ------------ | --- |
| [著者, 年] | DOI（不明の場合はN/A） |

**神経接続テーブル**：

| Sender | Receiver | Comment | Reference ID |
| ------ | -------- | ------- | ------------ |
| 投射元組織名 | 投射先組織名 | 接続の概要(簡潔に) | [著者, 年] |

**注意事項**:
- ROI外の神経組織が含まれる場合は、コメントにROI外の組織名を付記
- 複数の文献で確認された接続を優先的に記載
- 投射の強度や性質（興奮性/抑制性）が明らかな場合はCommentに記載

**成果物**: 2_BIF.md

### ステップ3: Uniform Circuit（UC）の定義

**目的**: BIFに基づいて、情報処理の基本単位となるUCを適切に定義する

**UCの採用基準**:
1. TLFの実現に必要な情報処理に関与している
2. 同質的な情報をコードしている神経組織である
3. メゾスコピックレベルとして適切な粒度（大きすぎず、小さすぎない）
4. **ROI内に位置するものとROI外に位置するものを区別する**（最重要）
  - ROI外のUCはコメントにnoROI(input)あるいはnoROI(output)と記述

**作業内容**:
- 3_UC.mdを作成し、以下の表形式でUCを定義：

| Circuit ID | Names | Source of ID | Transmitter | Modulation Type | Comments |
| ------ | -------- | -------- | -------- | -------- | -------- |
| `UC名` | UC名の神経科学的正式名称 | [著者, 年]（このUCを支持する主要な文献のReference ID） | 神経伝達物質（不明な場合は空欄） | Inhibitory / Excitatory / Modulatory（不明な場合は空欄） | UCの役割と対応する神経組織の説明 |

**命名規則**:
- スペースを使用せず、必ずKebab caseを使用
- 有名な略称が存在する場合は適切な略称を使用
  - 例: dorsomedial thalamus → `DMT`
  - 例: ventral tegmental area → `VTA`
- **重要**: マークダウンファイル内でUC名を記述する際は、必ずバッククォート（`）で囲む
  - 正しい例: `UC名`、`DMT`、`VTA`
  - 誤った例: UC名、DMT、VTA

**成果物**: 3_UC.md

---

### ステップ4: Connectionの定義とInterfaceの追加

**目的**: UC間の接続を定義し、各UCの入力情報（Interface）を確定する

#### 4-1. Connectionの定義

**作業内容**:
- 4_Connection.mdを作成
- BIFで特定した神経接続を、定義したUC間の接続として記述：

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference ID | Taxon | Measurement method | Pointers on literature | Pointers on figure |
| ------ | -------- | ------- | ------------ | ----- | ------------------ | ---------------------- | ------------------ |
| `送信元UC` | `受信先UC` | 接続の特性と情報内容(簡潔に) | [著者, 年] | 動物種 | 実験手法 | 文献内の参照箇所（簡潔に） | 文献内の図の参照箇所（簡潔に） |

**注意事項**:
- Sender/ReceiverはUC名で記述（神経組織名ではない）
- **UC名は必ずバッククォート（`）で囲む**
- BIFで特定した解剖学的接続を、適切なUC間の接続にマッピング
- 一つのBIFが複数のConnection、または複数のBIFが一つのConnectionに対応する場合がある

#### 4-2. Interfaceの追加

**作業内容**:
- 3_UC.mdに戻り、**ROI内の**各UCのInterfaceを追加(ROI外は不要、空欄)
- 形式は、 [Output1, Output2, ...] = UC名(Input1, Input2, ...)を遵守

| Circuit ID | Comment | Interface                                          |
| ----------------- | ------- | -------------------------------------------------- |
| `UC名`             | UCの説明   | ([出力UC名1], [出力UC名2], ...) = このUC名([入力UC名1], [入力UC名1], ...) |
|                   |         |                                                    |

(Names列は省略しています)

**注意**: UC名は必ずバッククォートで囲む

**成果物**: 4_Connection.md、3_UC.md（更新）

---

### ステップ5: Output Semanticsの定義

**目的**: 各UCが出力する情報の意味を定義する

**作業内容**:
- 3_UC.mdに戻り、ROI内外問わず各UCのOutput Semanticsを追加
- Output Semanticsは、そのUCがコードしている情報の意味を記述：
- 形式は、[UC名]内容;を遵守
- ROI外で、出力がない(情報処理の終点)は、outputsemanticsが存在しないので空欄

| Circuit ID | Comment | Interface | Output Semantics |
| ----------------- | ------- | --------- | ---------------- |
| `UC名`             | UCの説明   | (省略)      | [UC名]内容;         |

(Names列は省略しています)

**Output Semantics記述のポイント**:
- そのUCがどのような情報をコードしているかを明確に記述
- 計算神経科学的な用語を使用（例: 報酬予測、行動選択、感覚特徴、内部状態）
- 実験的証拠から特定された情報表現を優先的に記載
- 下流のUCがどのような情報を必要とするかを考慮

**成果物**: 3_UC.md（更新）

---

### ステップ6: 機能関連項目の定義と追加

**目的**: 各UCが実行する機能を定義する。

**項目詳細**: ROI内のUniform Circuitについて、以下の5項目を作成してください(ROI外は不要、空欄)。機能関連項目内では、Uniform Circuitは"U."というプレフィックスを使って[U.(UC名)]のような括弧[]付きで記述してください(形式的な要請による)。各項目は記述形式やルールが複雑なので注意してください。

- **機能記述全体のルール**
  - 機能記述では、どのUniform Circuitが入力/出力として機能するのかを「入力:[U.(UC名)]」「出力:[U.(UC名)]」のように明示的にしてください(Implementation以外)。
  - 神経科学的プロセスを機構として記述する高度な学術的な解釈能力/創発能力が必要な難しいタスクです。記述の学術的正確性/誠実性が担保できない場合には、その旨を記述内で補足してください。

- **1. Requirement** Requirementは、TLF（Top-Level Function）を分解して定義された計算機能です。この機能は、TLFを実現するために対象のUniform Circuit（UC）が満たすよう要求されるものです。入力から出力への変換がどのようなものかを、自然言語で説明してください。
  - **重要**:文中に関与するUniform Circuitに加えてその**Output Semantics**を明示的に記述するようにしてください。

- **2. Requirement realization by interface** Requirement realization by interfaceは、Requirementで説明された機能が、Interface（インターフェース）によってどのように実現されるかを明確に記述します。Requirementで定義された入出力関係が、interfaceと矛盾しないかを検証してください。

- **3. Capability** Capabilityは、Requirementで記述された計算機能からOutput Semantics（出力の意味論）的要素を除去したものです。RequirementがTLFの分解に基づくタスク依存の機能であるのに対し、CapabilityはOutput Semanticsを排除することで、より一般的な計算機能を記述します。Requirementの変換を、Output Semanticsを除いて一般化し、自然言語で説明してください。
  - 計算機能が、どのような先行研究、生物学的知見、または計算モデルに基づいているのかを明示してください。関連する文献を引用してください。

- **4. Mechanism** Mechanismは、Capabilityを実現するための具体的な計算機構を記述します。Capabilityが入出力の変換内容を機能面から記述するのに対し、Mechanismではその変換が機構として「どのように行われるか」を自然言語で説明してください。

- **5. Implementation** Implementationでは、Mechanismを数式の形で入出力関係を記述してください。自然言語やコードは生成しないでください。Mechanismで説明した事項に対して必要十分な数式にしてください。
  - 例: [U.A] = [U.B]/[U.C], [U.A] = P([U.B]|[U.C])　(AというUCがBとCの入力を受ける場合)

**作業内容**:
- 3_UC.mdに戻り、各UCの機能関連項目(1~5)を追加

| Circuit ID | Names | Source of ID | Transmitter | Modulation Type | Comment | Interface | Output Semantics | Requirement | Requirement realization by interface | Capability | Mechanism | Implementation |
| ----------------- | ------- | ------- | ------- | ------- | ------- | --------- | ---------------- | --------------- | ---------------------------------------- | -------------- | ------------- | ------------------ |
| `UC名`             | (省略)     | (省略) | (省略) | (省略) |  (省略)    | (省略)      | (省略) | 上記参照のこと         | 上記参照のこと                                  | 上記参照のこと        | 上記参照のこと       | 上記参照のこと            |
|                   |           |     |     |     |         |           |                  |                 |                                          |                |               |                    |

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

**目的**: 完成したHCDを包括的に説明した論文を作成する

**作業内容**:

#### 8-1. 最終報告論文の作成
6_FinalPaper.mdを作成し、以下の内容を含める。引用を必ず行う。：
- **タイトル**: TLFとROIを明示したわかりやすいタイトル
- **TLF・ROIの概要**: 対象とした機能と脳領域
- **定義されたUCの詳細な解説**: 各UCの役割と根拠
- **情報処理フロー**: ROI_InputからROI_Outputへの処理の流れ
- **主要な発見**: 調査過程で得られた重要な知見
- **制約と今後の課題**: HCDの限界や今後の改善点
- **書誌情報**: 参考文献を必ずすべて書く。


#### 8-2. 初学者にもわかりやすい解説記事を作成
7_EasyToUnderstand.mdを作成し、初学者にもわかりやすい解説記事を作成する。
- 難易度としては神経科学専攻の大学の学部4年生にもわかるようにすることを目標にする。
- わかりやすくする必要はあるが、情報を削ってはいけない。極端に簡略化する必要もない。
- 初出の用語をきちんと解説する。
- わかりやすいように、ナラティブベースで解説する(情報の流れなどは特に)。
- 本HCDを網羅的に解説する必要があるが、表形式などでUCや接続を網羅する必要はない。
- 読者がこの解説記事を一字一句漏らさず読む価値があるように気を付ける。


#### 8-3. HCD図の作成
8_diagram.mdを作成し、draw.ioにコンバートするためにmermaid形式で以下を図示：
- UCをノードとして配置
- Connectionを有向エッジとして表現
  - ConnectionにはOutput Semanticsを書く
- ROI内、noROI(input)、noROI(output)で色を分けて明示
  - 色の凡例を付加する
- 改行(<br/>)、中黒(・)は使用しない


以下の書き方を参考にしてください。

**成果物**: 6_FinalPaper.md、7_EasyToUnderstand.md、8_diagram.md

---

## 成果物一覧

本タスクを完了すると、以下のファイルが作成されます：

1. **1_Thinking.md**: 思考過程と分析ログ
2. **2_BIF.md**: 神経接続データベース（参考文献リスト含む）
3. **3_UC.md**: Uniform Circuit定義（Interface、Output Semantics、Function含む）
4. **4_Connection.md**: UC間の接続定義
5. **5_Verification.md**: 検証結果と修正内容
6. **6_FinalPaper.md**: 最終報告書
7. **7_EasyToUnderstand.md**: 解説記事
8. **8_diagram.md**: HCD構造図（XML形式）
