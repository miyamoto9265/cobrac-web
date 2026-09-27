# 数学的知識の神経表象に関するHCD：両側頭頂間溝と腹側側頭皮質の統合モデル

## Abstract

本研究では、数学的知識（Mathematical knowledge）の脳内表象を記述するHCD（Hypothetical Component Graph）を構築した。対象とした機能は「数学的操作の実行や問題解決を含まない、数学に関する一般的知識の範囲」であり、ROI（Region of Interest）として両側頭頂間溝（Bilateral Intraparietal Sulcus, IPS）および下側頭回/腹側側頭皮質（Inferior Temporal Gyrus / Ventral Temporal Cortex, ITG/VTC）を選定した。

Amalric & Dehaene（2016, 2018, 2019）らの一連の研究により、数学的知識は言語野から独立した神経ネットワークで表象されることが示されている。本HCDでは、IPSが数量的側面を、ITG/VTCが概念的・意味的側面を担い、両者がIPS-FG白質路（Takemura et al., 2020）により直接的に統合されることで、数学的知識の完全な表象が実現されると提案する。

ROI内に4つのUniform Circuit（UC）を定義した：後部頭頂間溝（pIPS）、前部頭頂間溝（aIPS）、紡錘状回数学領域（FG-math）、下側頭回数学領域（ITG-math）。これらのUC間の情報フローにより、視覚的数学情報から抽象的数学的知識への階層的変換が実現される。

## 1. Introduction

### 1.1 研究の背景

数学的認知の神経基盤は、過去数十年にわたり神経科学・認知科学の重要な研究対象となってきた。従来、数学的能力は言語能力と密接に関連すると考えられてきたが、近年の神経画像研究により、数学的処理が言語処理とは独立した脳領域で実行されることが明らかになってきた（Amalric & Dehaene, 2016, 2018）。

特に重要な発見は、プロの数学者が高度な数学的概念について考える際、言語野（Broca野、Wernicke野など）の活動が抑制され、代わりに両側の頭頂間溝（IPS）と腹側側頭皮質（VTC）が強く活性化することである（Amalric & Dehaene, 2016）。この発見は、数学的知識が独自の神経表象を持つことを示唆している。

### 1.2 研究の目的

本研究の目的は、「数学的知識（Mathematical knowledge）」というTop-Level Function（TLF）を実現する神経回路を、HCD（Hypothetical Component Graph）として記述することである。ここでいう数学的知識とは、数学的事実や概念の表象と検索を指し、計算の実行や問題の解決といった操作的側面は含まない。

具体的には以下を明らかにする：
1. 数学的知識の表象を担うROIの同定
2. ROI内のUniform Circuit（UC）の定義と機能
3. UC間の接続（Connection）と情報フロー
4. 各UCの計算機能（Capability）とメカニズム（Mechanism）

### 1.3 TLFとROIの選定

**TLF**: Mathematical knowledge: Range of general knowledge about mathematics, not the performance of mathematical operations or the solving of math problem

**ROI**: 両側頭頂間溝（Bilateral Intraparietal Sulcus, IPS）および下側頭回/腹側側頭皮質（Inferior Temporal Gyrus / Ventral Temporal Cortex, ITG/VTC）

このROI選定の根拠は以下の通りである：

1. **神経画像研究の証拠**: Amalric & Dehaene（2019）は、数学的内容に対する応答が、領域や難易度に関わらず、両側IPSとITG/VTCで一貫して観察されることを示した。

2. **言語からの独立性**: 数学的知識の表象は、古典的な言語野（側頭葉の言語関連領域）から解剖学的・機能的に分離されている（Amalric & Dehaene, 2018）。

3. **解剖学的接続**: Takemura et al.（2020）により、IPSとVTCの紡錘状回が「IPS-FG」と呼ばれる白質路で直接接続されていることが解剖学的に確認されている。

4. **機能的補完性**: IPSは数量表現と数学的推論を、ITG/VTCは数学的概念の意味的表象を担い、両者が統合されることで数学的知識が実現される。

## 2. Methods

### 2.1 BIF（Brain Information Flow）の構築

ROI内外の神経接続を、文献調査により網羅的に特定した。主要な情報源として以下を使用した：
- Felleman & Van Essen（1991）: 視覚野の階層的接続
- Takemura et al.（2020）: IPS-FG白質路
- Uddin et al.（2010）: IPSと角回の機能的・構造的接続
- Selemon & Goldman-Rakic（1988）: 前頭前野と頭頂皮質の接続

合計32のBIF（神経接続）を特定し、2_BIF.mdに記録した。

### 2.2 Uniform Circuit（UC）の定義

BIFに基づき、TLFの実現に必要な情報処理単位をUCとして定義した。UCの採用基準は以下の通り：
1. TLFの実現に必要な情報処理に関与
2. 同質的な情報をコード
3. メゾスコピックレベルとして適切な粒度
4. ROI内とROI外を明確に区別

ROI内に4つのUC、ROI外に13つのUCを定義した（合計17UC）。

### 2.3 Connectionの定義とInterfaceの決定

BIFをUC間のConnectionとしてマッピングし、各UCのInterface（入出力関係）を確定した。Interfaceは形式 `([Output UCs]) = UC_name([Input UCs])` で記述した。

### 2.4 機能分析

ROI内の各UCについて、以下の5項目を定義した：
1. **Requirement**: TLFを実現するために必要な機能
2. **Requirement realization by interface**: Interfaceによる実現方法
3. **Capability**: Output Semanticsを除いた一般的な計算能力
4. **Mechanism**: Capabilityを実現する計算機構
5. **Implementation**: 数式による入出力関係の記述

## 3. Results

### 3.1 定義されたUniform Circuit（UC）

#### 3.1.1 ROI内のUC

**pIPS（Posterior Intraparietal Sulcus）**
- **解剖学的位置**: IPS後部（IPS0-2, hIP1を含む）
- **機能**: 視覚的に提示された数字や数量の初期表象を形成。視空間情報と数量情報の統合。
- **Output Semantics**: 視覚的に提示された数量の大小関係と空間的配置。数字の視空間的表象。
- **神経科学的根拠**: IPS後部は視覚野から直接入力を受け、視空間情報と数量情報を統合する（Konen & Kastner, 2008）。

**aIPS（Anterior Intraparietal Sulcus）**
- **解剖学的位置**: IPS前部（IPS3-4, hIP2-3を含む）
- **機能**: 抽象的な数量関係の表象と数学的推論。前頭前野との連携により作業記憶内での数量操作を支援。
- **Output Semantics**: 抽象的な数量関係、数的順序性、数学的推論の中間結果。感覚モダリティから独立した数量表象。
- **神経科学的根拠**: IPS前部は前頭前野との強い接続を持ち、抽象的な数量関係を表象（Konen & Kastner, 2008; Boisgueheneuc et al., 2006）。

**FG-math（Fusiform Gyrus - Mathematical Area）**
- **解剖学的位置**: 紡錘状回の数学的処理領域
- **機能**: 数字形態の視覚的認識と数学的概念の意味的表象を保持。数学的内容に特異的に応答。
- **Output Semantics**: 数字の形態認識、数学的記号の視覚的アイデンティティ、数字-意味の対応づけ。
- **神経科学的根拠**: 紡錘状回は数学的処理に特異的に応答し、「数字形態領域（Number Form Area）」を含む（Grotheer et al., 2016, 2018）。IPS-FG白質路によりIPSと直接接続（Takemura et al., 2020）。

**ITG-math（Inferior Temporal Gyrus - Mathematical Area）**
- **解剖学的位置**: 下側頭回の数学的処理領域
- **機能**: 数学的概念の高次意味表象（例：「素数」「周期性」などの抽象概念）を保持。言語から独立した数学的知識の意味記憶。
- **Output Semantics**: 数学的概念の意味内容（例：素数性、周期性、対称性など）、数学的事実の意味表象、数学的カテゴリー。
- **神経科学的根拠**: 下側頭回は数学的内容に対して領域・難易度に関わらず応答し、数学的概念の意味表象を保持（Amalric & Dehaene, 2019）。

#### 3.1.2 ROI外の主要なUC

**AG（Angular Gyrus）** - 出力先
- **機能**: 算術的事実の検索と数学的記憶の想起を媒介
- **根拠**: 左角回は算術的事実の検索を特異的に媒介（Grabner et al., 2009）

**dlPFC（Dorsolateral Prefrontal Cortex）** - 入出力
- **機能**: 作業記憶の保持と制御信号の送信。数学的知識の検索と操作を支援するトップダウン制御
- **根拠**: 背外側前頭前野はIPSと双方向接続し、作業記憶と認知制御を支援（Selemon & Goldman-Rakic, 1988）

**視覚野（V1-V4）** - 入力源
- **機能**: 数字、数式、幾何図形などの視覚的特徴抽出
- **根拠**: 視覚野は階層的に情報を処理し、ITG/FGへ投射（Felleman & Van Essen, 1991）

### 3.2 情報処理フロー

数学的知識の表象と検索は、以下の階層的情報処理により実現される：

#### フロー1: 視覚的数学情報の処理
```
V1 → V2 → V3/V4 → FG-math (数字形態認識)
                ↓
        FG-math ↔ ITG-math (視覚-意味統合)
                ↓
        FG-math ↔ pIPS (数字-数量統合)
                ↓
           pIPS → aIPS (視覚的から抽象的数量表象へ)
                ↓
           aIPS → AG (数量から事実検索へ)
                ↓
            AG → LIPFC (検索された知識を作業記憶へ)
```

#### フロー2: ROI内の統合処理
```
pIPS ↔ FG-math: IPS-FG白質路による双方向統合
FG-math ↔ ITG-math: 腹側側頭皮質内での視覚-意味統合
pIPS ↔ aIPS: IPS内での視覚的-抽象的表象の変換
```

#### フロー3: トップダウン制御
```
dlPFC → pIPS, aIPS, FG-math, ITG-math: 作業記憶制御と注意配分
ACC → pIPS, aIPS: 認知制御
AG → aIPS, ITG-math: 検索された事実のフィードバック
```

### 3.3 各UCの計算機能

#### pIPSのCapability: 近似数量システム（ANS）
pIPSは視覚的に提示された刺激集合から数量（numerosity）を抽出する。この能力はWeber-Fechner法則に従う近似数量システム（Approximate Number System, ANS）として実装される（Dehaene, 2011）。

**Mechanism**: 数量チューニングを持つニューロン集団による符号化。視覚入力から位置マップを構築し、合算クラスタ（summation cluster）で単調なチューニングを形成した後、中央興奮と側方抑制により単峰性の数量チューニングを持つニューロンを生成する（Dehaene & Changeux, 1993）。

**Implementation**:
```
[U.pIPS] = Σ(Gaussian([U.V2], [U.V3], [U.V4]) * w_visual) 
           + [U.FG-math] * w_semantic 
           - Lateral_inhibition([U.pIPS_neighbors]) 
           + [U.dlPFC] * w_attention 
           + [U.ACC] * w_control
```

#### aIPSのCapability: 抽象的数量表象
aIPSは視覚的・聴覚的・触覚的などの感覚モダリティから独立した抽象的数量表象を形成し、数の順序性、大小関係、数学的推論を支援する。この能力は「mental number line」として概念化され、空間的な数の表象（SNARC効果）として行動レベルでも観察される（Dehaene et al., 1993）。

**Mechanism**: 数量の抽象的符号化は、視覚的表象から感覚的詳細を除去し、数量そのものを符号化するニューロン集団により実現される。前頭前野からのトップダウン信号により、作業記憶内で数量が保持・操作される。

**Implementation**:
```
[U.aIPS] = Abstract([U.pIPS]) + [U.AG] * w_fact + [U.dlPFC] * w_WM + [U.Hippocampus] * w_context
```
ここでAbstract(x)は感覚的詳細を除去する写像。

#### FG-mathのCapability: 数字形態領域（Number Form Area）
FG-mathは視覚的に提示された数字（アラビア数字、ローマ数字など）および数学的記号（+、−、=、∫など）の形態を認識し、それを対応する意味表象に結びつける。これは視覚単語形態領域（VWFA）の数字版として機能する（Grotheer et al., 2016, 2018）。

**Mechanism**: 視覚的特徴（線分の配置、曲線など）から数字の視覚的アイデンティティを抽出し、それを腹側側頭皮質内の意味表象と結びつける。階層的視覚処理の最終段階として、物体認識の一般的メカニズムを数字・記号に適用する。

**Implementation**:
```
[U.FG-math] = Visual_identity([U.V4]) + Semantic_link([U.ITG-math]) + Quantity_link([U.pIPS]) + [U.dlPFC] * w_attention
```

#### ITG-mathのCapability: 数学的概念の意味的カテゴリー化
ITG-mathは数学的概念の意味的カテゴリー化と抽象表象を保持する。数学的ドメイン（算術、代数、幾何、解析など）や数学的性質（素数性、周期性、対称性、連続性など）を符号化する。この表象は言語から独立しており、数学的反省時に言語野をスキップして活性化する（Amalric & Dehaene, 2016, 2018）。

**Mechanism**: 腹側側頭皮質の一般的な意味記憶メカニズムを数学的概念に適用。階層的カテゴリー構造を形成し、抽象度の異なるレベル（具体的な数字→数学的性質→数学的ドメイン）で概念を組織化する。

**Implementation**:
```
[U.ITG-math] = Semantic_encode([U.FG-math], [U.V4]) + [U.AG] * w_retrieved_fact + Conceptual_hierarchy([U.ITG-math]) + [U.dlPFC] * w_control
```

### 3.4 IPS-FG白質路の重要性

Takemura et al.（2020）により発見されたIPS-FG白質路は、本HCDにおいて極めて重要な役割を果たす。この白質路はpIPSとFG-mathを直接接続し、以下の統合を可能にする：

1. **数量と形態の統合**: pIPSの数量表象とFG-mathの数字形態認識が双方向に統合される
2. **視覚-意味統合**: 視覚的数学情報が意味的表象へと変換される
3. **トップダウン調節**: aIPSからの抽象的表象がFG-mathの視覚認識を調節する

この白質路の存在により、数学的知識の表象が、単なる視覚認識と意味記憶の並列処理ではなく、高度に統合されたシステムとして機能することが説明される。

## 4. Discussion

### 4.1 主要な発見

本研究により、数学的知識の神経表象について以下が明らかになった：

1. **機能的分離**: 数学的知識は、数量的側面（IPS）と概念的側面（ITG/VTC）に機能的に分離されて表象される。

2. **階層的処理**: 視覚入力から抽象的知識への変換は、pIPS（視覚的数量） → aIPS（抽象的数量） → AG（事実検索）という階層的処理により実現される。

3. **言語からの独立性**: 数学的知識の表象は、言語野から独立した専用の神経ネットワークで実現される。

4. **解剖学的統合**: IPS-FG白質路により、数量的側面と概念的側面が解剖学的に統合される。

### 4.2 先行研究との関係

本HCDは、Amalric & Dehaeneらの一連の実験研究（2016, 2018, 2019）と高度に整合する。特に以下の点で一致する：

1. **脳領域の特定**: 両側IPSとITG/VTCが数学的知識に特異的に応答する
2. **言語からの分離**: 数学的反省時に言語野の活動が抑制される
3. **ドメイン独立性**: 数学の異なるドメイン（算術、代数、幾何など）で同じ領域が活性化する

さらに、本HCDはDehaene & Changeux（1993）の数量表象の計算モデルや、Grotheer et al.（2016, 2018）の数字形態領域の発見とも整合する。

### 4.3 HCDの限界

本HCDにはいくつかの限界がある：

1. **個人差**: 専門家（数学者）と非専門家の違いは考慮されていない
2. **発達的変化**: 子どもから成人への発達的変化は記述されていない
3. **学習メカニズム**: 数学的知識の獲得・更新の詳細なメカニズムは今後の課題
4. **計算実行との境界**: 知識の想起と計算の実行の境界は曖昧である
5. **半球間の機能分担**: 左右半球の役割分担の詳細化が必要

### 4.4 今後の研究課題

本HCDを基盤として、以下の研究が期待される：

1. **異なる数学ドメインの比較**: 算術、代数、幾何、解析などでのUC活性化パターンの違い
2. **学習過程の解明**: 数学的知識がどのように獲得されるかのメカニズム
3. **専門性の効果**: 数学者と非専門家のHCDの違い
4. **計算神経科学モデルの構築**: 本HCDに基づくシミュレーションモデル
5. **教育への応用**: 数学教育の最適化に向けた神経科学的知見の活用

### 4.5 結論

本研究は、数学的知識の神経表象を記述したHCDを提案した。このHCDは、両側IPS（数量的側面）とITG/VTC（概念的側面）が、IPS-FG白質路により統合されることで、言語から独立した数学的知識の表象が実現されることを示した。

このモデルは、神経科学的証拠に基づいており、数学的認知の理解を深めるとともに、数学教育や認知リハビリテーションへの応用可能性を持つ。

## References

1. Amalric, M., & Dehaene, S. (2016). Origins of the brain networks for advanced mathematics in expert mathematicians. Proceedings of the National Academy of Sciences, 113(18), 4909-4917.

2. Amalric, M., & Dehaene, S. (2018). Cortical circuits for mathematical knowledge: evidence for a major subdivision within the brain's semantic networks. Philosophical Transactions of the Royal Society B, 373(1740), 20160515.

3. Amalric, M., & Dehaene, S. (2019). A distinct cortical network for mathematical knowledge in the human brain. NeuroImage, 189, 19-31.

4. Arsalidou, M., & Taylor, M. J. (2011). Is 2+ 2= 4? Meta-analyses of brain areas needed for numbers and calculations. Neuroimage, 54(3), 2382-2393.

5. Boisgueheneuc, F. D., Levy, R., Volle, E., Seassau, M., Duffau, H., Kinkingnehun, S., ... & Dubois, B. (2006). Functions of the left superior frontal gyrus in humans: a lesion study. Brain, 129(12), 3315-3328.

6. Cole, M. W., Ito, T., Bassett, D. S., & Schultz, D. H. (2016). Activity flow over resting-state networks shapes cognitive task activations. Nature neuroscience, 19(12), 1718-1726.

7. Dehaene, S. (2011). The number sense: How the mind creates mathematics. Oxford University Press.

8. Dehaene, S., & Changeux, J. P. (1993). Development of elementary numerical abilities: A neuronal model. Journal of cognitive neuroscience, 5(4), 390-407.

9. Dehaene, S., Bossini, S., & Giraux, P. (1993). The mental representation of parity and number magnitude. Journal of Experimental Psychology: General, 122(3), 371.

10. Felleman, D. J., & Van Essen, D. C. (1991). Distributed hierarchical processing in the primate cerebral cortex. Cerebral cortex, 1(1), 1-47.

11. Grabner, R. H., Ansari, D., Koschutnig, K., Reishofer, G., Ebner, F., & Neuper, C. (2009). To retrieve or to calculate? Left angular gyrus mediates the retrieval of arithmetic facts during problem solving. Neuropsychologia, 47(2), 604-608.

12. Grill-Spector, K., & Weiner, K. S. (2014). The functional architecture of the ventral temporal cortex and its role in categorization. Nature reviews neuroscience, 15(8), 536-548.

13. Grotheer, M., Ambrus, G. G., & Kovács, G. (2016). Causal evidence of the involvement of the number form area in the visual detection of numbers and letters. NeuroImage, 132, 314-319.

14. Grotheer, M., Zhen, Z., Lerma-Usabiaga, G., & Grill-Spector, K. (2018). Separate lanes for adding and reading in the white matter highways of the human brain. bioRxiv, 427435.

15. Harvey, B. M., Klein, B. P., Petridou, N., & Dumoulin, S. O. (2013). Topographic representation of numerosity in the human parietal cortex. Science, 341(6150), 1123-1126.

16. Harvey, B. M., Fracasso, A., Dagnino, B., & Dumoulin, S. O. (2024). Hierarchical representations of relative numerical magnitudes in the human frontoparietal cortex. Nature Communications, 15(1), 1-15.

17. Konen, C. S., & Kastner, S. (2008). Two hierarchically organized neural systems for object information in human visual cortex. Nature neuroscience, 11(2), 224-231.

18. Menon, V. (2016). Memory and cognitive control circuits in mathematical cognition and learning. Progress in brain research, 227, 159-186.

19. Nieder, A., & Miller, E. K. (2004). A parieto-frontal network for visual numerical information in the monkey. Proceedings of the National Academy of Sciences, 101(19), 7457-7462.

20. Piazza, M., Izard, V., Pinel, P., Le Bihan, D., & Dehaene, S. (2004). Tuning curves for approximate numerosity in the human intraparietal sulcus. Neuron, 44(3), 547-555.

21. Qi, S., Bustamante, C., Okihide, H., Sanches, C., Starr, A., & Baram, T. Z. (2022). Causal dynamics and information flow in parietal-temporal-hippocampal circuits during mental arithmetic revealed by high-temporal resolution human intracranial EEG. bioRxiv.

22. Selemon, L. D., & Goldman-Rakic, P. S. (1988). Common cortical and subcortical targets of the dorsolateral prefrontal and posterior parietal cortices in the rhesus monkey: evidence for a distributed neural network subserving spatially guided behavior. Journal of Neuroscience, 8(11), 4049-4068.

23. Takemura, H., Kruper, J., Miyata, T., & Rokem, A. (2020). Identification of a distinct association fiber tract "IPS-FG" to connect the intraparietal sulcus areas and fusiform gyrus by white matter dissection and tractography. Scientific Reports, 10(1), 15402.

24. Uddin, L. Q., Supekar, K., Amin, H., Rykhlevskaia, E., Nguyen, D. A., Greicius, M. D., & Menon, V. (2010). Dissociable connectivity within human angular gyrus and intraparietal sulcus: evidence from functional and structural connectivity. Cerebral cortex, 20(11), 2636-2646.
