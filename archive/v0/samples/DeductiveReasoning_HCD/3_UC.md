# ステップ3: Uniform Circuit（UC）の定義

TLF（Deductive Reasoning）を実現するための情報処理の基本単位であるUniform Circuitを定義する。

## UCテーブル

| Circuit ID | Names | Comment |
| ---------- | ----- | ------- |
| `RLPFC-Lateral` | Left Rostrolateral Prefrontal Cortex (Lateral subdivision, BA10 lateral) | **ROI内**。演繹的推論における関係統合(relational integration)の中核UC。複数の関係性を統合して論理的結論を導く。Executive control networkに属する。lateral BA10に対応。|
| `RLPFC-Medial` | Left Rostrolateral Prefrontal Cortex (Medial subdivision, BA10 medial) | **ROI内**。エピソード記憶情報の統合と自己関連処理を担当。Default mode networkに属する。medial BA10に対応。演繹推論における文脈情報の保持。|
| `HPC` | Hippocampus (CA1 and Subiculum) | **noROI(input)**。関係性のエンコーディングを実行。個別の関係（A>B, B>Cなど）を表現し、RLPFCに送信する。演繹推論の材料となる関係性情報を提供。|
| `MDT` | Mediodorsal Thalamus | **noROI(input/output)**。視床MD核。PFCとの相互投射により情報統合をサポート。複数のPFC領域からの情報を統合し、cognitive controlに貢献。|
| `PPC-SPL` | Posterior Parietal Cortex (Superior Parietal Lobule, BA7) | **noROI(input)**。上頭頂小葉。空間的判断、距離・スケール・比率の処理。演繹推論における規則の空間的・構造的表現を維持。|
| `PPC-IPL` | Posterior Parietal Cortex (Inferior Parietal Lobule, BA40) | **noROI(input)**。下頭頂小葉（縁上回）。感覚運動協調と論理的議論の形式構造の維持。規則の構造的表現をサポート。|
| `DLPFC` | Dorsolateral Prefrontal Cortex (BA9/46) | **noROI(input/output)**。作業記憶の維持と操作。推論過程で必要な中間情報を保持。RLPFCと相互作用し、推論結果をフィードバック受信。|
| `mPFC` | Medial Prefrontal Cortex (BA8) | **noROI(input)**。内側前頭前野。認知制御、目標表現、タスク文脈情報を提供。演繹推論における目標状態と評価基準を管理。|
| `dACC` | Dorsal Anterior Cingulate Cortex (BA24/32) | **noROI(input/output)**。背側前帯状皮質。エラーモニタリング、紛争検出、パフォーマンス評価。推論の妥当性チェックと確信度評価を実行。|
| `rACC` | Rostral Anterior Cingulate Cortex (BA32 rostral) | **noROI(output)**。吻側前帯状皮質。情動調整と認知制御の統合。RLPFCからの推論結果を受け取り、情動的評価を実施。|
| `BLA` | Basolateral Amygdala | **noROI(input)**。扁桃体基底外側核。情動的顕著性情報を提供。推論における情動的文脈・動機づけ情報を供給（主にmedial PFC経由）。|
| `PMC` | Premotor Cortex (BA6) | **noROI(output)**。前運動野。運動計画と行動選択。RLPFCからの推論結果を受け取り、具体的な行動へと変換。|
| `CN` | Caudate Nucleus | **noROI(output)**。尾状核。目標指向行動と意思決定。Frontostriatal pathwayを介してRLPFCからの推論結果を受信し、行動選択に統合。|

## UC採用の根拠

### ROI内のUC（2つ）

1. **`RLPFC-Lateral`**: 
   - TLF実現の中核。関係統合という演繹推論の本質的計算を実行。
   - 神経科学的証拠: Wendelken et al. (2008), Christoff et al. (2001)でrelational integrationの中核として同定。
   - メゾスコピックレベルとして適切: lateral BA10という構造的・機能的に定義された領域。
   - Executive control networkの一部として機能。

2. **`RLPFC-Medial`**: 
   - 演繹推論における文脈情報・エピソード記憶の統合を担当。
   - 神経科学的証拠: Connectivity-based parcellationでmedial BA10は独立したクラスタとして同定される（Bludau et al., 2014）。
   - 海馬からの直接入力を受け、memory streamの一部。
   - Default mode networkに属し、lateralとは異なる機能ネットワーク。

### ROI外のUC（11個）

**入力UC（6つ）:**
- `HPC`: 関係性のエンコーディング（transitive inferenceの材料）
- `MDT`: 視床からの統合情報供給
- `PPC-SPL`, `PPC-IPL`: 規則の構造的表現
- `DLPFC`: 作業記憶情報
- `mPFC`: タスク文脈・目標情報
- `BLA`: 情動的文脈

**双方向UC（2つ）:**
- `DLPFC`: 作業記憶の更新（入出力両方）
- `dACC`: エラー検出とモニタリング（入出力両方）
- `MDT`: 視床との相互作用（入出力両方）

**出力UC（4つ）:**
- `rACC`: 推論結果の情動的評価
- `PMC`: 行動への変換
- `CN`: 意思決定への統合
- （`MDT`: 視床への出力も含む）

## UC間の関係性

### 入力経路
```
規則情報: [PPC-SPL], [PPC-IPL], [mPFC] → [RLPFC-Lateral/Medial]
関係情報: [HPC] → [RLPFC-Medial] → [RLPFC-Lateral]
作業記憶: [DLPFC] ⇄ [RLPFC-Lateral]
統合情報: [MDT] ⇄ [RLPFC-Lateral/Medial]
情動文脈: [BLA] → [mPFC] → [RLPFC-Medial]
```

### 出力経路
```
[RLPFC-Lateral] → [DLPFC] (作業記憶更新)
[RLPFC-Lateral] → [dACC] (モニタリング)
[RLPFC-Lateral] → [rACC] (情動評価)
[RLPFC-Lateral] → [PMC] (行動選択)
[RLPFC-Lateral/Medial] → [MDT] (視床へのフィードバック)
[DLPFC] → [CN] (意思決定)
```

## UCの粒度に関する注記

- RLPFC（BA10）をLateralとMedialに分割した理由: 
  1. 解剖学的根拠: Connectivity-based parcellationで明確に区別される
  2. 機能的根拠: 異なるネットワーク（executive control vs. default mode）に属する
  3. 入力の違い: medialは海馬から直接入力、lateralはより抽象的統合を実行
  4. メゾスコピックレベルとして適切: 過度に細分化せず、機能的に意味のある単位

- 他のPFC領域（DLPFC, mPFC, ACC）は統合されたUCとして定義: 
  - これらは演繹推論における特定の補助機能（作業記憶、タスク文脈、モニタリング）を提供
  - ROI外であるため、内部構造の詳細な分解は不要

## ステップ4-2: Interfaceの追加

Connectionに基づいて、ROI内の各UCのInterfaceを定義する。

### UCテーブル（Interface追加版）

| Circuit ID | Names | Comment | Interface |
| ---------- | ----- | ------- | --------- |
| `RLPFC-Lateral` | Left Rostrolateral Prefrontal Cortex (Lateral subdivision, BA10 lateral) | **ROI内**。演繹的推論における関係統合(relational integration)の中核UC。複数の関係性を統合して論理的結論を導く。Executive control networkに属する。lateral BA10に対応。| ([`DLPFC`], [`dACC`], [`rACC`], [`PMC`], [`PPC-SPL`], [`PPC-IPL`], [`MDT`]) = `RLPFC-Lateral`([`RLPFC-Medial`], [`PPC-SPL`], [`PPC-IPL`], [`DLPFC`], [`MDT`], [`dACC`]) |
| `RLPFC-Medial` | Left Rostrolateral Prefrontal Cortex (Medial subdivision, BA10 medial) | **ROI内**。エピソード記憶情報の統合と自己関連処理を担当。Default mode networkに属する。medial BA10に対応。演繹推論における文脈情報の保持。| ([`RLPFC-Lateral`], [`MDT`]) = `RLPFC-Medial`([`HPC`], [`mPFC`], [`MDT`]) |
| `HPC` | Hippocampus (CA1 and Subiculum) | **noROI(input)**。関係性のエンコーディングを実行。個別の関係（A>B, B>Cなど）を表現し、RLPFCに送信する。演繹推論の材料となる関係性情報を提供。| |
| `MDT` | Mediodorsal Thalamus | **noROI(input/output)**。視床MD核。PFCとの相互投射により情報統合をサポート。複数のPFC領域からの情報を統合し、cognitive controlに貢献。| |
| `PPC-SPL` | Posterior Parietal Cortex (Superior Parietal Lobule, BA7) | **noROI(input)**。上頭頂小葉。空間的判断、距離・スケール・比率の処理。演繹推論における規則の空間的・構造的表現を維持。| |
| `PPC-IPL` | Posterior Parietal Cortex (Inferior Parietal Lobule, BA40) | **noROI(input)**。下頭頂小葉（縁上回）。感覚運動協調と論理的議論の形式構造の維持。規則の構造的表現をサポート。| |
| `DLPFC` | Dorsolateral Prefrontal Cortex (BA9/46) | **noROI(input/output)**。作業記憶の維持と操作。推論過程で必要な中間情報を保持。RLPFCと相互作用し、推論結果をフィードバック受信。| |
| `mPFC` | Medial Prefrontal Cortex (BA8) | **noROI(input)**。内側前頭前野。認知制御、目標表現、タスク文脈情報を提供。演繹推論における目標状態と評価基準を管理。| |
| `dACC` | Dorsal Anterior Cingulate Cortex (BA24/32) | **noROI(input/output)**。背側前帯状皮質。エラーモニタリング、紛争検出、パフォーマンス評価。推論の妥当性チェックと確信度評価を実行。| |
| `rACC` | Rostral Anterior Cingulate Cortex (BA32 rostral) | **noROI(output)**。吻側前帯状皮質。情動調整と認知制御の統合。RLPFCからの推論結果を受け取り、情動的評価を実施。| |
| `BLA` | Basolateral Amygdala | **noROI(input)**。扁桃体基底外側核。情動的顕著性情報を提供。推論における情動的文脈・動機づけ情報を供給（主にmedial PFC経由）。| |
| `PMC` | Premotor Cortex (BA6) | **noROI(output)**。前運動野。運動計画と行動選択。RLPFCからの推論結果を受け取り、具体的な行動へと変換。| |
| `CN` | Caudate Nucleus | **noROI(output)**。尾状核。目標指向行動と意思決定。Frontostriatal pathwayを介してRLPFCからの推論結果を受信し、行動選択に統合。| |

### Interface解釈

**`RLPFC-Lateral`のInterface:**
```
([DLPFC], [dACC], [rACC], [PMC], [PPC-SPL], [PPC-IPL], [MDT]) = RLPFC-Lateral([RLPFC-Medial], [PPC-SPL], [PPC-IPL], [DLPFC], [MDT], [dACC])
```
- **入力**: 
  - `RLPFC-Medial`: 文脈情報と関係性表現
  - `PPC-SPL`, `PPC-IPL`: 規則の構造的表現
  - `DLPFC`: 作業記憶内容
  - `MDT`: 統合された情報
  - `dACC`: エラーモニタリング信号
- **出力**: 
  - `DLPFC`: 更新された作業記憶
  - `dACC`: 推論結果の妥当性情報
  - `rACC`: 情動評価用情報
  - `PMC`: 行動選択情報
  - `PPC-SPL`, `PPC-IPL`: 規則表現の更新
  - `MDT`: 視床へのフィードバック

**`RLPFC-Medial`のInterface:**
```
([RLPFC-Lateral], [MDT]) = RLPFC-Medial([HPC], [mPFC], [MDT])
```
- **入力**: 
  - `HPC`: 関係性のエンコーディング
  - `mPFC`: タスク文脈・目標情報
  - `MDT`: 統合された情報
- **出力**: 
  - `RLPFC-Lateral`: 統合された文脈+関係情報
  - `MDT`: 視床へのフィードバック

### ROI内の情報処理フロー

演繹推論における2つのROI内UCの協調動作：
1. `RLPFC-Medial`が海馬からの関係性情報とタスク文脈を統合
2. 統合された情報を`RLPFC-Lateral`に送信
3. `RLPFC-Lateral`が規則情報と統合し、関係統合を実行
4. 推論結果を複数の下流領域に出力

## ステップ5: Output Semanticsの定義

各UCが出力する情報の意味内容を定義する。

### UCテーブル（Output Semantics追加版）

| Circuit ID | Names | Comment | Interface | Output Semantics |
| ---------- | ----- | ------- | --------- | ---------------- |
| `RLPFC-Lateral` | Left Rostrolateral Prefrontal Cortex (Lateral subdivision, BA10 lateral) | **ROI内**。演繹的推論における関係統合(relational integration)の中核UC。複数の関係性を統合して論理的結論を導く。Executive control networkに属する。lateral BA10に対応。| ([`DLPFC`], [`dACC`], [`rACC`], [`PMC`], [`PPC-SPL`], [`PPC-IPL`], [`MDT`]) = `RLPFC-Lateral`([`RLPFC-Medial`], [`PPC-SPL`], [`PPC-IPL`], [`DLPFC`], [`MDT`], [`dACC`]) | [`RLPFC-Lateral`]統合された推論結果。複数の関係性（A>B, B>C）と一般規則（推移律）を統合して導出された論理的結論（A>C）。結論の妥当性と確信度を含む。関係統合の計算結果として、特定の問題に適用された規則の帰結。; |
| `RLPFC-Medial` | Left Rostrolateral Prefrontal Cortex (Medial subdivision, BA10 medial) | **ROI内**。エピソード記憶情報の統合と自己関連処理を担当。Default mode networkに属する。medial BA10に対応。演繹推論における文脈情報の保持。| ([`RLPFC-Lateral`], [`MDT`]) = `RLPFC-Medial`([`HPC`], [`mPFC`], [`MDT`]) | [`RLPFC-Medial`]文脈統合された関係性表現。海馬からの個別関係情報とタスク文脈を統合した、エピソード的に構造化された関係性表現。推論に必要な前提条件の文脈的まとまり。; |
| `HPC` | Hippocampus (CA1 and Subiculum) | **noROI(input)**。関係性のエンコーディングを実行。個別の関係（A>B, B>Cなど）を表現し、RLPFCに送信する。演繹推論の材料となる関係性情報を提供。| | [`HPC`]個別関係性のエンコーディング。特定の要素間の関係（A>B, B>Cなど）を表現する。エピソード記憶に基づく関係的表現。Transitive inferenceの材料となる個別の前提。; |
| `MDT` | Mediodorsal Thalamus | **noROI(input/output)**。視床MD核。PFCとの相互投射により情報統合をサポート。複数のPFC領域からの情報を統合し、cognitive controlに貢献。| | [`MDT`]統合された認知制御信号。複数のPFC領域からの情報を統合し、全体的なcognitive controlの状態を表現。注意資源の配分と認知的柔軟性の調整。; |
| `PPC-SPL` | Posterior Parietal Cortex (Superior Parietal Lobule, BA7) | **noROI(input)**。上頭頂小葉。空間的判断、距離・スケール・比率の処理。演繹推論における規則の空間的・構造的表現を維持。| | [`PPC-SPL`]規則の空間的構造表現。論理規則（推移律、三段論法など）の空間的・構造的表現。距離、スケール、比率として抽象化された規則の形式。; |
| `PPC-IPL` | Posterior Parietal Cortex (Inferior Parietal Lobule, BA40) | **noROI(input)**。下頭頂小葉（縁上回）。感覚運動協調と論理的議論の形式構造の維持。規則の構造的表現をサポート。| | [`PPC-IPL`]論理的議論の形式構造。論証の形式的構造（前提-結論関係）の表現。規則適用の手続き的構造。; |
| `DLPFC` | Dorsolateral Prefrontal Cortex (BA9/46) | **noROI(input/output)**。作業記憶の維持と操作。推論過程で必要な中間情報を保持。RLPFCと相互作用し、推論結果をフィードバック受信。| | [`DLPFC`]作業記憶内容。推論過程で保持される中間情報、前提条件、部分的結論。作業記憶バッファとしての情報表現。; |
| `mPFC` | Medial Prefrontal Cortex (BA8) | **noROI(input)**。内側前頭前野。認知制御、目標表現、タスク文脈情報を提供。演繹推論における目標状態と評価基準を管理。| | [`mPFC`]タスク文脈と目標状態。推論タスクにおける目標状態、評価基準、タスク要求の表現。自己関連的な文脈情報。; |
| `dACC` | Dorsal Anterior Cingulate Cortex (BA24/32) | **noROI(input/output)**。背側前帯状皮質。エラーモニタリング、紛争検出、パフォーマンス評価。推論の妥当性チェックと確信度評価を実行。| | [`dACC`]エラー・紛争検出信号。推論過程における不整合、エラー、紛争の検出信号。パフォーマンスモニタリングと確信度評価。; |
| `rACC` | Rostral Anterior Cingulate Cortex (BA32 rostral) | **noROI(output)**。吻側前帯状皮質。情動調整と認知制御の統合。RLPFCからの推論結果を受け取り、情動的評価を実施。| | |
| `BLA` | Basolateral Amygdala | **noROI(input)**。扁桃体基底外側核。情動的顕著性情報を提供。推論における情動的文脈・動機づけ情報を供給（主にmedial PFC経由）。| | [`BLA`]情動的顕著性。刺激や状況の情動的重要性、動機づけ的価値の表現。推論における情動的文脈。; |
| `PMC` | Premotor Cortex (BA6) | **noROI(output)**。前運動野。運動計画と行動選択。RLPFCからの推論結果を受け取り、具体的な行動へと変換。| | |
| `CN` | Caudate Nucleus | **noROI(output)**。尾状核。目標指向行動と意思決定。Frontostriatal pathwayを介してRLPFCからの推論結果を受信し、行動選択に統合。| | |

### Output Semanticsの解釈

**ROI内UC:**

1. **`RLPFC-Lateral`**: 
   - 統合された推論結果を出力
   - 複数の関係性と規則を統合した論理的結論
   - 例: 「AがBより大きい」「BがCより大きい」→「AがCより大きい」という推移的推論の結果
   - 確信度と妥当性の情報を含む

2. **`RLPFC-Medial`**: 
   - 文脈統合された関係性表現を出力
   - エピソード記憶に基づく構造化された前提条件
   - タスク文脈と統合された関係性のまとまり

**ROI外UC（入力側）:**

3. **`HPC`**: 個別の関係性（A>B, B>C）
4. **`PPC-SPL`**: 規則の空間的構造（推移律の形式）
5. **`PPC-IPL`**: 論証の形式構造（前提-結論）
6. **`DLPFC`**: 作業記憶内容（中間結果）
7. **`mPFC`**: タスク文脈と目標
8. **`dACC`**: エラー・紛争検出
9. **`BLA`**: 情動的顕著性
10. **`MDT`**: 統合された認知制御信号

**ROI外UC（出力側）:**

11. **`rACC`**: 出力を受信するのみ（推論結果の情動的評価を実行するが、さらなる出力はHCD範囲外）
12. **`PMC`**: 出力を受信するのみ（行動へ変換するが、さらなる出力はHCD範囲外）
13. **`CN`**: 出力を受信するのみ（意思決定に統合するが、さらなる出力はHCD範囲外）

### 演繹推論における情報の意味的変換

```
入力情報の意味:
[HPC: 個別関係] + [mPFC: 文脈] → [RLPFC-Medial: 文脈化された関係性]
[PPC: 規則構造] + [DLPFC: 作業記憶] → [RLPFC-Lateral: 入力材料]

ROI内変換:
[RLPFC-Medial: 文脈化された関係性] + [PPC: 規則] → [RLPFC-Lateral: 関係統合]

出力情報の意味:
[RLPFC-Lateral: 統合された推論結果] → 複数の下流領域へ
  → [DLPFC: 更新された作業記憶]
  → [dACC: 妥当性評価]
  → [PMC: 行動化]
```

## ステップ6: 機能関連項目の定義と追加

ROI内のUniform Circuitについて、機能関連項目（Requirement, Requirement realization by interface, Capability, Mechanism, Implementation）を定義する。

### UCテーブル（完全版）

| Circuit ID | Names | Comment | Interface | Output Semantics | Requirement | Requirement realization by interface | Capability | Mechanism | Implementation |
| ---------- | ----- | ------- | --------- | ---------------- | ----------- | ------------------------------------ | ---------- | --------- | -------------- |
| `RLPFC-Lateral` | Left Rostrolateral Prefrontal Cortex (Lateral subdivision, BA10 lateral) | **ROI内**。演繹的推論における関係統合(relational integration)の中核UC。複数の関係性を統合して論理的結論を導く。Executive control networkに属する。lateral BA10に対応。| ([`DLPFC`], [`dACC`], [`rACC`], [`PMC`], [`PPC-SPL`], [`PPC-IPL`], [`MDT`]) = `RLPFC-Lateral`([`RLPFC-Medial`], [`PPC-SPL`], [`PPC-IPL`], [`DLPFC`], [`MDT`], [`dACC`]) | [`RLPFC-Lateral`]統合された推論結果。複数の関係性（A>B, B>C）と一般規則（推移律）を統合して導出された論理的結論（A>C）。結論の妥当性と確信度を含む。関係統合の計算結果として、特定の問題に適用された規則の帰結。; | Deductive Reasoningを実現するため、[U.RLPFC-Lateral]は複数の個別関係性（入力:[U.RLPFC-Medial]が提供する文脈化された関係性表現）と一般的論理規則（入力:[U.PPC-SPL]の空間的構造表現と[U.PPC-IPL]の形式構造）を統合し、論理的に妥当な結論（出力:[U.RLPFC-Lateral]の統合された推論結果）を導出する。この過程で作業記憶（入出力:[U.DLPFC]）を参照・更新し、エラーモニタリング信号（入出力:[U.dACC]）により推論の妥当性を検証する。最終的な推論結果は行動選択（出力:[U.PMC]）、情動評価（出力:[U.rACC]）、規則表現の更新（出力:[U.PPC-SPL], [U.PPC-IPL]）に送信される。| [U.RLPFC-Medial]から文脈化された関係性（例:「AはBより大きい」「BはCより大きい」というエピソード的に構造化された前提）を受け取り、[U.PPC-SPL]と[U.PPC-IPL]から提供される論理規則の構造的表現（推移律:「XがYより大きく、YがZより大きいならば、XはZより大きい」）と統合する。[U.DLPFC]の作業記憶バッファに保持された中間結果を参照しながら、関係統合計算を実行し、論理的結論（「AはCより大きい」）を導出する。[U.dACC]からのエラー信号により推論の整合性を検証し、確信度を評価する。統合された推論結果は[U.DLPFC]に書き戻され、[U.dACC]にモニタリング情報として、[U.rACC]に情動評価用に、[U.PMC]に行動選択用に送信される。また、規則適用の結果は[U.PPC-SPL]と[U.PPC-IPL]にフィードバックされ、規則表現が更新される。[U.MDT]との双方向接続により認知制御状態が調整される。このようにInterfaceで定義された入出力により、Requirementで要求される関係統合機能が実現される。| 複数の関係的表現（relation 1, relation 2, ...）と抽象的規則（rule）を受け取り、それらを統合して新たな関係的結論（integrated relation）を生成する。このCapabilityは、入力される関係性の意味内容（「大きい」「速い」など）に依存せず、関係の構造的性質のみに基づいて動作する。任意のドメインにおける関係統合タスクに適用可能である。この計算は、分散した複数の表現を動的に結合（dynamic binding）し、階層的な表現空間において新たな関係を構築する。神経科学的根拠: Wendelken et al. (2008)は、RLPFCがrelational encodingではなくrelational integrationに特化していることを示した。Christoff et al. (2001)は、RLPFCが関係統合における中核的役割を果たすことを実証した。計算論的根拠: Halford et al. (1998)のrelational complexity理論は、関係統合が認知的複雑性の本質であることを示した。Duncan et al. (2020)は、関係統合が動的ネットワークメカニズムによって支えられ、frontoparietal networkにおける位相同期と機能的結合の増加を伴うことを明らかにした。| 関係統合は、frontoparietal networkにおける動的結合メカニズムによって実現される。具体的には、(1) 海馬由来の個別関係表現（[U.RLPFC-Medial]から受信）が、(2) 頭頂葉由来の規則構造（[U.PPC-SPL], [U.PPC-IPL]から受信）と、(3) 作業記憶空間（[U.DLPFC]）において動的に結合される。この結合過程は、phase synchronyの増加と functional connectivityの強化により特徴づけられる。RLPFCは、この動的ネットワークにおいてtop-down effective connectivity sourceとして機能し、作業記憶システム全体にコードされた規則を動的に結合する。結合された表現は、階層的表現空間において新たな関係として構築される。エラーモニタリング（[U.dACC]）により、結合の整合性が検証され、不整合が検出された場合は再計算が誘発される。統合プロセスは、network metastabilityの低下により安定化され、確信度が評価される。最終的な統合結果は、複数の下流システム（[U.DLPFC], [U.dACC], [U.rACC], [U.PMC], [U.PPC-SPL], [U.PPC-IPL]）に並列的に送信される。| [U.RLPFC-Lateral] = Integrate([U.RLPFC-Medial], [U.PPC-SPL], [U.PPC-IPL], [U.DLPFC]_read) ∧ Verify([U.dACC]); [U.DLPFC]_write = [U.RLPFC-Lateral]; [U.dACC]_monitor = Validity([U.RLPFC-Lateral]); [U.rACC] = Evaluate([U.RLPFC-Lateral]); [U.PMC] = SelectAction([U.RLPFC-Lateral]); [U.PPC-SPL] = UpdateRule_spatial([U.RLPFC-Lateral]); [U.PPC-IPL] = UpdateRule_structural([U.RLPFC-Lateral]); [U.MDT] = Feedback([U.RLPFC-Lateral]) |
| `RLPFC-Medial` | Left Rostrolateral Prefrontal Cortex (Medial subdivision, BA10 medial) | **ROI内**。エピソード記憶情報の統合と自己関連処理を担当。Default mode networkに属する。medial BA10に対応。演繹推論における文脈情報の保持。| ([`RLPFC-Lateral`], [`MDT`]) = `RLPFC-Medial`([`HPC`], [`mPFC`], [`MDT`]) | [`RLPFC-Medial`]文脈統合された関係性表現。海馬からの個別関係情報とタスク文脈を統合した、エピソード的に構造化された関係性表現。推論に必要な前提条件の文脈的まとまり。; | Deductive Reasoningにおける前提条件の構造化のため、[U.RLPFC-Medial]は海馬からの個別関係性情報（入力:[U.HPC]の個別関係性エンコーディング）とタスク文脈情報（入力:[U.mPFC]のタスク文脈と目標状態）を統合し、エピソード的に構造化された関係性表現（出力:[U.RLPFC-Medial]の文脈統合された関係性表現）を生成する。この統合された表現は、推論の材料として[U.RLPFC-Lateral]に送信され、関係統合計算に使用される。視床との双方向接続（入出力:[U.MDT]）により、default mode networkにおける情報統合がサポートされる。| [U.HPC]から個別の関係性情報（例:「試行1でAがBに勝った」「試行2でBがCに勝った」といった個別のエピソード）を受け取り、[U.mPFC]からタスク文脈（「推移的関係を推論するタスク」という目標状態と評価基準）を受け取る。これらを統合し、エピソード的に構造化された関係性表現（「AはBより強い」「BはCより強い」という文脈化された前提）を生成する。[U.MDT]との双方向接続により、default mode networkにおける自己関連的処理と記憶統合がサポートされる。構造化された関係性表現は[U.RLPFC-Lateral]に送信され、関係統合計算の材料となる。また、統合状態は[U.MDT]にフィードバックされる。このようにInterfaceで定義された入出力により、Requirementで要求される文脈統合機能が実現される。| 個別のエピソード的表現（episodic representation 1, episodic representation 2, ...）とタスク要求（task demand）を受け取り、それらを統合して文脈的に構造化された関係的表現（contextualized relational representation）を生成する。このCapabilityは、エピソード記憶の特定の内容（「勝った」「大きい」など）に依存せず、関係的構造の抽出と文脈的統合という一般的プロセスとして機能する。任意のドメインにおける関係的エピソード情報の構造化に適用可能である。神経科学的根拠: Bludau et al. (2014)のconnectivity-based parcellationにより、medial BA10がlateralとは独立したクラスタとして同定され、default mode networkに属することが示された。Catani et al. (2023)は、medial BA10がmemory streamの一部として海馬と直接接続していることを示した。計算論的根拠: エピソード記憶からの関係抽出は、個別事象の統合により抽象的関係を構築するプロセスである。Default mode networkは、内的に生成された表現の統合に特化している（Buckner et al., 2008）。| エピソード記憶統合は、海馬-PFC回路における情報変換により実現される。具体的には、(1) 海馬CA1/台からの個別エピソード（[U.HPC]から受信）が、(2) medial PFCからのタスク文脈（[U.mPFC]から受信）により選択的に活性化され、(3) default mode networkにおいて文脈的に再構成される。この再構成過程では、個別エピソードが時間的・空間的文脈から抽象化され、関係的構造が抽出される。例えば、「試行1でAがBに勝った」というエピソードから「AはBより強い」という抽象的関係が抽出される。複数のエピソードが統合されることで、一貫した関係的表現（「A>B>C」という推移的構造）が構築される。視床MD核との双方向接続（[U.MDT]）により、この統合プロセスがグローバルな認知制御状態と協調する。構築された文脈統合表現は、executive control networkの入力として[U.RLPFC-Lateral]に送信され、さらなる統合計算の材料となる。| [U.RLPFC-Medial] = Contextualize([U.HPC], [U.mPFC]) ∧ Coordinate([U.MDT]); [U.RLPFC-Lateral] = [U.RLPFC-Medial]; [U.MDT] = Feedback([U.RLPFC-Medial]) |
| `HPC` | Hippocampus (CA1 and Subiculum) | **noROI(input)**。関係性のエンコーディングを実行。個別の関係（A>B, B>Cなど）を表現し、RLPFCに送信する。演繹推論の材料となる関係性情報を提供。| | [`HPC`]個別関係性のエンコーディング。特定の要素間の関係（A>B, B>Cなど）を表現する。エピソード記憶に基づく関係的表現。Transitive inferenceの材料となる個別の前提。; | | | | | |
| `MDT` | Mediodorsal Thalamus | **noROI(input/output)**。視床MD核。PFCとの相互投射により情報統合をサポート。複数のPFC領域からの情報を統合し、cognitive controlに貢献。| | [`MDT`]統合された認知制御信号。複数のPFC領域からの情報を統合し、全体的なcognitive controlの状態を表現。注意資源の配分と認知的柔軟性の調整。; | | | | | |
| `PPC-SPL` | Posterior Parietal Cortex (Superior Parietal Lobule, BA7) | **noROI(input)**。上頭頂小葉。空間的判断、距離・スケール・比率の処理。演繹推論における規則の空間的・構造的表現を維持。| | [`PPC-SPL`]規則の空間的構造表現。論理規則（推移律、三段論法など）の空間的・構造的表現。距離、スケール、比率として抽象化された規則の形式。; | | | | | |
| `PPC-IPL` | Posterior Parietal Cortex (Inferior Parietal Lobule, BA40) | **noROI(input)**。下頭頂小葉（縁上回）。感覚運動協調と論理的議論の形式構造の維持。規則の構造的表現をサポート。| | [`PPC-IPL`]論理的議論の形式構造。論証の形式的構造（前提-結論関係）の表現。規則適用の手続き的構造。; | | | | | |
| `DLPFC` | Dorsolateral Prefrontal Cortex (BA9/46) | **noROI(input/output)**。作業記憶の維持と操作。推論過程で必要な中間情報を保持。RLPFCと相互作用し、推論結果をフィードバック受信。| | [`DLPFC`]作業記憶内容。推論過程で保持される中間情報、前提条件、部分的結論。作業記憶バッファとしての情報表現。; | | | | | |
| `mPFC` | Medial Prefrontal Cortex (BA8) | **noROI(input)**。内側前頭前野。認知制御、目標表現、タスク文脈情報を提供。演繹推論における目標状態と評価基準を管理。| | [`mPFC`]タスク文脈と目標状態。推論タスクにおける目標状態、評価基準、タスク要求の表現。自己関連的な文脈情報。; | | | | | |
| `dACC` | Dorsal Anterior Cingulate Cortex (BA24/32) | **noROI(input/output)**。背側前帯状皮質。エラーモニタリング、紛争検出、パフォーマンス評価。推論の妥当性チェックと確信度評価を実行。| | [`dACC`]エラー・紛争検出信号。推論過程における不整合、エラー、紛争の検出信号。パフォーマンスモニタリングと確信度評価。; | | | | | |
| `rACC` | Rostral Anterior Cingulate Cortex (BA32 rostral) | **noROI(output)**。吻側前帯状皮質。情動調整と認知制御の統合。RLPFCからの推論結果を受け取り、情動的評価を実施。| | | | | | | |
| `BLA` | Basolateral Amygdala | **noROI(input)**。扁桃体基底外側核。情動的顕著性情報を提供。推論における情動的文脈・動機づけ情報を供給（主にmedial PFC経由）。| | [`BLA`]情動的顕著性。刺激や状況の情動的重要性、動機づけ的価値の表現。推論における情動的文脈。; | | | | | |
| `PMC` | Premotor Cortex (BA6) | **noROI(output)**。前運動野。運動計画と行動選択。RLPFCからの推論結果を受け取り、具体的な行動へと変換。| | | | | | | |
| `CN` | Caudate Nucleus | **noROI(output)**。尾状核。目標指向行動と意思決定。Frontostriatal pathwayを介してRLPFCからの推論結果を受信し、行動選択に統合。| | | | | | | |

### 機能記述の学術的根拠

**`RLPFC-Lateral`の機能:**
- Requirement: 演繹推論における関係統合という中核機能を、入出力UCとそのOutput Semanticsを明示的に記述しながら定義
- Capability: Wendelken et al. (2008), Christoff et al. (2001)の実験的証拠、Halford et al. (1998)の理論、Duncan et al. (2020)の動的ネットワークメカニズムに基づく
- Mechanism: Phase synchrony、functional connectivity、dynamic binding、top-down effective connectivityという神経科学的に実証されたメカニズムに基づく
- Implementation: 数式形式で入出力関係を表現。Integrate, Verify, Validity, Evaluate, SelectAction, UpdateRuleなどの関数により計算を記述

**`RLPFC-Medial`の機能:**
- Requirement: エピソード記憶の文脈統合という機能を、入出力UCとそのOutput Semanticsを明示的に記述しながら定義
- Capability: Bludau et al. (2014)のconnectivity-based parcellation、Catani et al. (2023)のmemory stream、Buckner et al. (2008)のdefault mode network理論に基づく
- Mechanism: 海馬-PFC回路における情報変換、default mode networkにおける文脈的再構成という実証されたメカニズムに基づく
- Implementation: Contextualize, Coordinateなどの関数により計算を記述

### 学術的誠実性に関する注記

本機能記述は、以下の点で学術的正確性を担保している:
1. 神経科学的証拠（Wendelken, Christoff, Bludau, Cataniらの研究）に基づく
2. 計算論的理論（Halford, Bucknerらの理論）に基づく
3. 実証された神経メカニズム（phase synchrony, functional connectivity）に基づく
4. Output Semanticsを明示的に参照し、情報の意味的変換を記述

ただし、以下の限界がある:
1. 実際の神経計算の詳細（発火率、シナプス重み、時間定数など）は不明
2. ImplementationはhReplicationは概念的な数式であり、生物学的実装の詳細ではない
3. 関係統合の正確な計算アルゴリズムは依然として研究課題である

## 次ステップ

ステップ7では、HCD全体の整合性を検証し、必要に応じて修正する。その後、csvファイルを作成する。
