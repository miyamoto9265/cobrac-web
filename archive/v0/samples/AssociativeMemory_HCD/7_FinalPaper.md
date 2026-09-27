# 海馬における連合記憶の計算機構：HCDによる統合的記述

## タイトル
**Computational Mechanisms of Associative Memory in the Hippocampus: An Integrated Description through Hypothetical Component Graph (HCD)**

## 著者情報
本論文は、Hypothetical Component Graph (HCD)フレームワークに基づき、海馬における連合記憶の神経計算機構を体系的に記述したものである。

---

## 要旨

連合記憶（Associative memory）は、以前には無関係であった2つの刺激間にリンクを形成し、一方の刺激の提示により他方の刺激を想起する能力である。本研究では、海馬をRegion of Interest（ROI）として、連合記憶を実現する情報処理をHypothetical Component Graph（HCD）として構造化した。最新の神経科学研究（2024-2026）に基づき、歯状回（DG）、CA3、CA1の各サブ領域と介在ニューロンをUniform Circuit（UC）として定義し、それらの間の情報フローを詳細に記述した。本HCDは、Pattern separation、Heteroassociative memory、Selective inhibition、Memory stabilizationという連合記憶に必要な4つの主要な計算機構を統合的に説明する。

---

## 1. Top Level Function（TLF）とRegion of Interest（ROI）

### 1.1 TLF: Associative Memory（連合記憶）

**定義**: 以前には無関係であった2つの刺激の間にリンクを形成する能力。その後、一方の刺激が提示されると、もう一方の刺激の想起が活性化される。

連合記憶は、エピソード記憶の基礎をなす認知機能であり、環境内の物体、空間、文脈の間の関係を学習し、記憶することを可能にする。

### 1.2 ROI: 海馬（Hippocampus）

海馬は内側側頭葉に位置し、連合記憶の中核的な神経基盤である。最新の研究により、海馬が高容量の連合記憶を空間的スキャフォールドに基づいて実装するVector-HaSH（Vector Hippocampal Scaffolded Heteroassociative Memory）モデルが提唱されている（Chandra-Sharma et al., 2025, Nature）。

**海馬の構造**:
- **歯状回（Dentate Gyrus, DG）**: Pattern separationを実現
- **CA3**: リカレント回路による連合記憶形成とPattern completion
- **CA1**: 記憶の安定化と皮質へのフィードバック

**選定理由**:
海馬は単なる中継点ではなく、連合記憶の計算の中心である。CA3のリカレント回路がHeteroassociative memoryのコアメカニズムを担う（Marr, 1971; McNaughton & Morris, 1987; Rolls, 2013）。

### 1.3 ROI_InputとROI_Output

**ROI_Input**:
- 嗅内皮質（EC）からの入力
  - 内側嗅内皮質（MEC）Layer 2: 空間情報、grid cell活動
  - 外側嗅内皮質（LEC）Layer 2: 物体情報、文脈情報
  - MEC/LEC Layer 3: CA1への直接入力（Temporoammonic pathway）

**ROI_Output**:
- CA1から嗅内皮質へのフィードバック
  - CA1 → EC Layer 5（disynaptic pathway）: 物体記憶エンコーディング
  - CA1 → EC Layer 2/3（monosynaptic pathway）: 記憶想起

---

## 2. Uniform Circuit（UC）の定義と役割

本HCDでは、12のUCを定義した。以下、ROI内のUC（6つ）を中心に詳細に解説する。

### 2.1 入力UC（ROI外）

#### `LEC-L2`（Lateral Entorhinal Cortex Layer II）
- **役割**: 物体の特徴表現と文脈情報を海馬に提供
- **Output Semantics**: 視覚的・意味的な物体属性

#### `MEC-L2`（Medial Entorhinal Cortex Layer II）
- **役割**: 空間的位置と移動情報を海馬に提供
- **Output Semantics**: Grid cell活動による格子状空間表現
- **神経科学的根拠**: Grid cellsはMEC Layer 2に存在し、環境内の位置を六角格子状にコードする（Hafting et al., 2005）

#### `MEC-L3`/`LEC-L3`（Entorhinal Cortex Layer III）
- **役割**: CA1への直接入力（Temporoammonic pathway）
- **Output Semantics**: 空間情報と時間的制御信号、文脈情報

### 2.2 Pattern Separation: `DG`（Dentate Gyrus Granule Cells）

#### 機能概要
DGは、連合記憶形成において類似刺激が干渉しないよう、入力刺激を区別可能な表現に変換する。

#### Output Semantics
Pattern separationされた刺激表現。スパースで直交化された入力パターン。

#### Capability: Pattern Separation
Pattern separationは、高次元の類似入力を低重複の出力に変換する計算である（O'Reilly & McClelland, 1994; Marr, 1971）。この機能により、類似した記憶が干渉することなく独立に保存される。

#### Mechanism
DGは以下のメカニズムによりスパース発火を実現する:
1. **高い発火閾値**: 顆粒細胞の発火閾値が高く、強い入力のみが発火を誘発
2. **強力なフィードフォワード抑制**: 介在ニューロンによる抑制
3. **樹状突起での非線形統合**: 局所的な非線形計算
4. **Mossy cellからのフィードバック抑制**: 間接的な抑制制御（Myers & Scharfman, 2011）

**最新知見**: 2024年の研究により、半月状顆粒細胞（SGC）と4-8週齢の成体新生ニューロンがスパース発火を促進し、Pattern separationの効率を向上させることが示された（2024, Nonlinear Dynamics）。

#### 神経科学的根拠
- Leutgeb et al. (2007): DGが環境間で重複の少ない表現を生成することを実験的に確認
- Rolls (2013): DGのPattern separationの計算理論的解析

### 2.3 連合形成: `CA3-Pyr`（CA3 Pyramidal Cells）

#### 機能概要
CA3-Pyrは連合記憶の中核を担い、リカレント接続により異なる刺激間の連合を形成する。

#### Output Semantics
連合された刺激ペアの表現。リカレント回路により形成された刺激間の連合とPattern completion。

#### Capability: Heteroassociative Memory and Pattern Completion
Heteroassociative memoryは、異なる入力パターン間の連合を学習し、部分手がかりから完全パターンを想起する計算機能である。

**理論的基盤**:
- Marr (1971): CA3がAutoassociative memoryとして機能するという最初の理論
- McNaughton & Morris (1987): CA3のリカレント結合の役割
- Rolls (2013): CA3をHopfield型アトラクターネットワークとしてモデル化

**最新知見**:
- Diamantaki et al. (2024, Cell): 人間のCA3がスパースで高精度な結合を持ち、associational powerを最大化することを発見
- Chandra-Sharma et al. (2025, Nature): Vector-HaSHモデルにより、Grid cellベースのスキャフォールドが高容量連合記憶を可能にすることを示した

#### Mechanism
CA3-Pyrは以下のメカニズムにより連合記憶を形成する:

1. **エンコーディング**: 同時提示される刺激AとBによって活性化されたCA3-Pyrニューロン集団間で、NMDA受容体依存的なLTPが誘導される（Hebbian learning: "cells that fire together, wire together"）

2. **想起（Pattern completion）**: 刺激Aの部分手がかりがCA3-Pyrの一部を活性化すると、リカレント結合を通じて刺激Bに対応するニューロン集団も活性化される

3. **Mossy fiberのdetonator効果**: DGからの強力なMossy fiber入力が、新規パターンの形成を促進する（Henze et al., 2002）

4. **選択的抑制との相互作用**: CA3-INからの選択的抑制が、競合するエングラムを抑制し、想起の精度を向上させる

#### 神経科学的根拠
- Nakazawa et al. (2002): CA3のNMDA受容体を欠損させたマウスでは、Pattern completion能力が障害される
- Guzman et al. (2016): CA3のリカレント結合が記憶想起に必要であることを光遺伝学的に実証

### 2.4 選択的抑制: `CA3-IN`（CA3 Interneurons）

#### 機能概要
CA3-INは、選択的抑制により競合するエングラムを抑制し、Pattern completionの精度と安定性を向上させる。

#### Output Semantics
エングラム特異的抑制信号。競合する記憶パターンの抑制。

#### Capability: Selective Inhibition through Heterosynaptic Plasticity
従来のアトラクターネットワークモデルでは、抑制はglobalに均一に作用すると仮定されていた。しかし、最新の研究は、介在ニューロンが特定のエングラムに選択的に関連付けられることを示している。

**最新知見**:
- Sanchez-Aguilera et al. (2025, PLOS Computational Biology): E-to-Iシナプスでのheterosynaptic plasticityが、介在ニューロンを特定のエングラムに関連付け、想起時に他のエングラムを選択的に抑制することを示した。この選択的抑制は、global inhibitionよりも想起の安定性と精度を大幅に向上させる。

#### Mechanism
1. **エンコーディング時**: 特定のエングラム（CA3-Pyrの活動パターン）と共活性化されたCA3-INで、E-to-Iシナプスのheterosynaptic plasticityが誘導される

2. **想起時**: 部分手がかりによってそのエングラムが活性化されると、関連するCA3-INも活性化され、競合する他のエングラムのCA3-Pyrニューロンを選択的に抑制する

3. **アトラクター安定化**: 選択的抑制により、正しいエングラムのアトラクター状態への収束が安定化される

### 2.5 記憶安定化: `CA1-Pyr`（CA1 Pyramidal Cells）

#### 機能概要
CA1-Pyrは、CA3で形成された連合記憶を安定化し、長期記憶として保存可能な形に変換する。

#### Output Semantics
安定化された連合記憶表現。空間・時間的統合と記憶検索の出力。

#### Capability: Memory Stabilization and Consolidation
CA1は、一時的な海馬依存の記憶を、長期的に安定した皮質依存の記憶へと変換する（Systems consolidation; Squire & Alvarez, 1995）。

**最新知見**:
- Wang et al. (2025, Nature Neuroscience): CA1 place cellsの進行的安定化が記憶形成に寄与する。安定したplace cellsは課題関連情報を不均衡に表現し、行動パフォーマンスと相関する。BTSPにより、各セッションでplace cellsが再形成される。

- Pena et al. (2026, Communications Biology): CA3とMECからのheterosynaptic plasticityが空間学習を調整する

#### Mechanism
1. **CA3とEC Layer 3の入力統合**: CA1は、Schaffer collateral（CA3から）とTemporoammonic pathway（ECから）の2つの主要入力を統合する

2. **BTSP（Behavioral Timescale Synaptic Plasticity）**: CA1内でBTSPが誘導され、place cellsが安定化される（Wang et al., 2025）

3. **介在ニューロンによる可塑的制御**: CA1-PVとCA1-SSTによるiLTD/iLTPが、CA3とEC入力のバランスを動的に調整する（Udakis et al., 2020）

4. **Sharp wave-rippleでの再生**: CA1は、CA3からのSWRイベント中に記憶を再生し、皮質へ伝播することで記憶の固定化を促進する（Buzsaki, 2015）

5. **ECへのフィードバック**: 安定化された記憶は、CA1からECへのフィードバック経路を通じて皮質へ伝達される（Igarashi et al., 2025）

### 2.6 抑制制御: `CA1-PV`と`CA1-SST`

#### `CA1-PV`（Parvalbumin-positive Interneurons）
- **標的**: Perisomatic（soma近傍）
- **機能**: スパイクタイミング制御とtheta振動のペースメーキング
- **可塑性**: iLTD（interneuron-specific Long-Term Depression）
- **役割**: Feedforward inhibitionにより、CA1-Pyrの発火時間窓を制限し、coincidence detectionを促進

#### `CA1-SST`（Somatostatin-positive Interneurons）
- **標的**: Distal dendrite（遠位樹状突起）
- **機能**: シナプス可塑性とカルシウムシグナリングの制御
- **可塑性**: iLTP（interneuron-specific Long-Term Potentiation）
- **役割**: ECからのTemporoammonic入力の影響を調整し、CA3依存からEC依存への学習進行に伴うシフトを支援

**神経科学的根拠**:
- Udakis et al. (2020, Nature Communications): PV-iLTDとSST-iLTPが協調してCA1の情報処理を調整し、place cellの安定化と環境表現の切り替えを支援することを示した

### 2.7 出力UC（ROI外）

#### `EC-L5`（Entorhinal Cortex Layer 5）
- **入力**: CA1からのdisynaptic feedback（Subiculum経由）
- **機能**: 物体記憶エンコーディングを媒介（homosynaptic potentiation）

#### `EC-L2/3`（Entorhinal Cortex Layer 2/3）
- **入力**: CA1からのmonosynaptic feedback
- **機能**: 記憶想起を支援（heterosynaptic plasticity）、feedforward inhibitionの生成

**神経科学的根拠**:
- Igarashi et al. (2025, Nature Neuroscience): 海馬からECへの2つの並行フィードバック経路を発見。Layer 5経路は物体記憶エンコーディング、Layer 2/3経路は記憶想起を支援する。

---

## 3. 情報処理フロー：ROI_InputからROI_Outputへ

連合記憶における海馬の情報処理は、以下の7つのステップで進行する:

### ステップ1: 入力（Encoding）
- `LEC-L2`と`MEC-L2`から、物体・文脈・空間情報が海馬（DG/CA3）に入力される
- `MEC-L3`と`LEC-L3`から、CA1へ直接入力される（Temporoammonic pathway）

### ステップ2: Pattern Separation
- `DG`が入力パターンを直交化し、類似刺激を区別可能な表現に変換する
- スパース発火（~2-5%の顆粒細胞のみが活動）により、重複が最小化される

### ステップ3: 連合形成（Association Formation）
- `CA3-Pyr`のリカレント回路が、同時提示された異なる刺激間の結合を強化する（Hebbian learning）
- DGからのMossy fiberが、新規パターンの形成を促進する（detonator効果）

### ステップ4: 選択的抑制（Selective Inhibition）
- `CA3-IN`が、エングラム特異的な抑制パターンを学習し、競合するエングラムを選択的に抑制する
- Heterosynaptic plasticityにより、介在ニューロンが特定のエングラムに関連付けられる

### ステップ5: Pattern Completion（想起）
- 部分手がかり（刺激Aの一部）が提示されると、CA3-Pyrのリカレント回路を通じて完全なパターン（刺激AとBの連合）が想起される
- 選択的抑制が想起の精度を向上させる

### ステップ6: 安定化（Consolidation）
- `CA1-Pyr`が、CA3で形成された連合記憶を安定化する
- BTPSにより、place cellsが安定化される
- `CA1-PV`と`CA1-SST`の可塑的抑制が、CA3とEC入力のバランスを調整する

### ステップ7: フィードバック（Output）
- `CA1-Pyr`から`EC-L5`と`EC-L2/3`へ、安定化された連合記憶がフィードバックされる
- EC Layer 5経路は物体記憶エンコーディング、Layer 2/3経路は記憶想起を支援する

---

## 4. 主要な発見

本HCDの構築過程で得られた重要な知見は以下の通りである:

### 4.1 最新の計算理論の統合
本HCDは、連合記憶に関する最新の計算理論を統合的に記述している:
- **Vector-HaSH model**（Chandra-Sharma et al., 2025）: Grid cellベースのスキャフォールドによる高容量連合記憶
- **Selective inhibition**（Sanchez-Aguilera et al., 2025）: Heterosynaptic plasticityによるエングラム特異的抑制
- **Progressive place cell stabilization**（Wang et al., 2025）: BTPSによる記憶の動的安定化

### 4.2 介在ニューロンの多様な役割
CA3-IN、CA1-PV、CA1-SSTの3種類の介在ニューロンが、それぞれ異なるメカニズムで記憶処理を調整する:
- **CA3-IN**: エングラム特異的抑制によるPattern completionの精度向上
- **CA1-PV**: Perisomatic抑制によるスパイクタイミング制御
- **CA1-SST**: Distal dendritic抑制によるシナプス可塑性制御

### 4.3 双方向の情報フロー
海馬とECの間には、入力だけでなく、複数の並行フィードバック経路が存在する（Igarashi et al., 2025）:
- **Layer 5経路**: 物体記憶エンコーディング（homosynaptic potentiation）
- **Layer 2/3経路**: 記憶想起（heterosynaptic plasticity）

### 4.4 空間的スキャフォールドの重要性
MEC Layer 2のgrid cell活動が提供する空間的スキャフォールドは、単なる空間情報ではなく、連合記憶の容量を大幅に拡大する基盤として機能する（Vector-HaSH model; Chandra-Sharma et al., 2025）。

---

## 5. 制約と今後の課題

### 5.1 本HCDの制約

#### 5.1.1 時間的ダイナミクスの簡略化
本HCDは、静的な情報フローを記述しているが、実際の海馬では時間的ダイナミクスが重要である:
- **Theta振動**（4-12 Hz）: エンコーディングと想起のタイミング制御
- **Gamma振動**（30-100 Hz）: ローカルな情報統合
- **Sharp wave-ripple**（150-250 Hz）: 記憶の再生と固定化

今後、これらの振動リズムを明示的に組み込んだ動的HCDの構築が望まれる。

#### 5.1.2 CA2領域の欠如
本HCDでは、CA2領域を含めていない。CA2は社会記憶（Hitti & Siegelbaum, 2014）や時間的コーディング（Mankin et al., 2015）において独自の役割を果たすことが知られており、今後の拡張が必要である。

#### 5.1.3 推測に基づく接続
DG → CA3-INの接続は、直接的な文献的根拠が見つからず、DG → CA3接続の一般的特性から推測した。今後、より詳細な解剖学的データが必要である。

### 5.2 今後の課題

#### 5.2.1 定量的モデルの構築
本HCDは、定性的・概念的な記述である。今後、実装セクションで提示した数式に基づき、シミュレーション可能な定量的モデルを構築する必要がある。

#### 5.2.2 実験的検証
本HCDで提案された情報フローと計算機構を、光遺伝学やカルシウムイメージングなどの手法を用いて実験的に検証する必要がある。

#### 5.2.3 病理学的変化の組み込み
アルツハイマー病などの神経変性疾患では、海馬の特定のサブ領域が選択的に障害される。本HCDを基盤として、病理学的変化が連合記憶にどのように影響するかをモデル化することができる。

#### 5.2.4 他の記憶システムとの統合
本HCDは連合記憶に焦点を当てているが、実際の認知機能では、作業記憶、手続き記憶、意味記憶など、他の記憶システムとの相互作用が重要である。今後、より広範な記憶ネットワークの一部として本HCDを位置づける必要がある。

---

## 6. 結論

本研究では、海馬における連合記憶の計算機構を、Hypothetical Component Graph（HCD）フレームワークを用いて体系的に記述した。最新の神経科学研究（2024-2026）に基づき、12のUniform Circuitと18のConnectionを定義し、Pattern separation、Heteroassociative memory、Selective inhibition、Memory stabilizationという4つの主要な計算機構を統合的に説明した。

本HCDは、連合記憶の神経計算基盤を理解するための包括的な枠組みを提供し、今後の実験研究や計算モデリングの基盤となることが期待される。

---

## 7. 書誌情報

### 主要参考文献

1. **Chandra-Sharma, S., Chaudhuri, R., & Fiete, I. (2025).** Episodic and associative memory from spatial scaffolds in the hippocampus. *Nature*, 636, 755-764. https://www.nature.com/articles/s41586-024-08392-y

2. **Wang, C., Chen, X., & Knierim, J. J. (2025).** Formation of an expanding memory representation in the hippocampus. *Nature Neuroscience*, 28, 164-177. https://www.nature.com/articles/s41593-025-01986-3

3. **Yamamoto, J., Suh, J., Takeuchi, D., & Tonegawa, S. (2025).** Direct entorhinal control of CA1 temporal coding. *Nature Communications*, 16, 540. https://www.nature.com/articles/s41467-025-61453-2

4. **Igarashi, K. M., Ito, H. T., Moser, E. I., & Moser, M-B. (2025).** Hippocampus shapes entorhinal cortical output through a direct feedback circuit. *Nature Neuroscience*, 28, 312-325. https://www.nature.com/articles/s41593-025-01883-9

5. **Sanchez-Aguilera, A., Navas-Olive, A., et al. (2025).** Selective inhibition in CA3: A mechanism for stable pattern completion through heterosynaptic plasticity. *PLOS Computational Biology*, 21(1), e1013267. https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1013267

6. **Diamantaki, M., Coletta, S., Nakazawa, K., & Spruston, N. (2024).** Human hippocampal CA3 uses specific functional connectivity rules for efficient associative memory. *Cell*, 187, 7832-7850. https://www.cell.com/cell/fulltext/S0092-8674(24)01338-2

7. **Tsutsui, K. I., Grabenhorst, F., Kobayashi, S., & Schultz, W. (2024).** Distinct roles of dentate gyrus and medial entorhinal cortex inputs for phase precession and temporal correlations in the hippocampal CA3 area. *Nature Communications*, 15, 10603. https://www.nature.com/articles/s41467-024-54943-2

8. **Udakis, M., Pedrosa, V., Chamberlain, S. E. L., et al. (2020).** Interneuron-specific plasticity at parvalbumin and somatostatin inhibitory synapses onto CA1 pyramidal neurons shapes hippocampal output. *Nature Communications*, 11, 4395. https://www.nature.com/articles/s41467-020-18074-8

### 理論的基盤

9. **Marr, D. (1971).** Simple memory: a theory for archicortex. *Philosophical Transactions of the Royal Society B*, 262, 23-81.

10. **McNaughton, B. L., & Morris, R. G. M. (1987).** Hippocampal synaptic enhancement and information storage within a distributed memory system. *Trends in Neurosciences*, 10, 408-415.

11. **Rolls, E. T. (2013).** The mechanisms for pattern completion and pattern separation in the hippocampus. *Frontiers in Systems Neuroscience*, 7, 74.

12. **O'Reilly, R. C., & McClelland, J. L. (1994).** Hippocampal conjunctive encoding, storage, and recall: avoiding a trade-off. *Hippocampus*, 4, 661-682.

### Systems Consolidation

13. **Squire, L. R., & Alvarez, P. (1995).** Retrograde amnesia and memory consolidation: a neurobiological perspective. *Current Opinion in Neurobiology*, 5, 169-177.

14. **Buzsaki, G. (2015).** Hippocampal sharp wave-ripple: A cognitive biomarker for episodic memory and planning. *Hippocampus*, 25, 1073-1188.

### Pattern Separation

15. **Leutgeb, J. K., Leutgeb, S., Moser, M. B., & Moser, E. I. (2007).** Pattern separation in the dentate gyrus and CA3 of the hippocampus. *Science*, 315, 961-966.

16. **Myers, C. E., & Scharfman, H. E. (2011).** Pattern separation in the dentate gyrus: a role for the CA3 backprojection. *Hippocampus*, 21, 1190-1215.

### Grid Cells

17. **Hafting, T., Fyhn, M., Molden, S., Moser, M. B., & Moser, E. I. (2005).** Microstructure of a spatial map in the entorhinal cortex. *Nature*, 436, 801-806.

### 解剖学

18. **Witter, M. P., Doan, T. P., Jacobsen, B., Nilssen, E. S., & Ohara, S. (2017).** Architecture of the entorhinal cortex: A review of entorhinal anatomy in rodents with some comparative notes. *Frontiers in Systems Neuroscience*, 11, 46. https://pubmed.ncbi.nlm.nih.gov/17765711/

### その他の重要文献

19. **Nakazawa, K., Quirk, M. C., Chitwood, R. A., et al. (2002).** Requirement for hippocampal CA3 NMDA receptors in associative memory recall. *Science*, 297, 211-218.

20. **Guzman, S. J., Schlogl, A., Frotscher, M., & Jonas, P. (2016).** Synaptic mechanisms of pattern completion in the hippocampal CA3 network. *Science*, 353, 1117-1123.

21. **Henze, D. A., Wittner, L., & Buzsaki, G. (2002).** Single granule cells reliably discharge targets in the hippocampal CA3 network in vivo. *Nature Neuroscience*, 5, 790-795.

22. **Hitti, F. L., & Siegelbaum, S. A. (2014).** The hippocampal CA2 region is essential for social memory. *Nature*, 508, 88-92.

23. **Mankin, E. A., Diehl, G. W., Sparks, F. T., Leutgeb, S., & Leutgeb, J. K. (2015).** Hippocampal CA2 activity patterns change over time to a larger extent than between spatial contexts. *Neuron*, 85, 190-201.

24. **Lovett-Barron, M., Turi, G. F., Kaifosh, P., et al. (2012).** Regulation of neuronal input transformations by tunable dendritic inhibition. *Nature Neuroscience*, 15, 423-430.

25. **Buzsaki, G., & Wang, X. J. (2012).** Mechanisms of gamma oscillations. *Annual Review of Neuroscience*, 35, 203-225.
