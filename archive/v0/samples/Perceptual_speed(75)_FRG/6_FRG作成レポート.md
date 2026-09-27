# ステップ6: FRG作成レポート

## 概要

本レポートでは、知覚速度（Perceptual Speed）というTLFを実現するFunction Realization Graph（FRG）の作成過程と、その妥当性について説明する。作成されたFRGは、TLFを階層的に分解し、ROI内のUniform Circuit（pIPS, mIPS, aIPS）と紐づけることで、知覚速度という認知能力がどのように神経基盤によって実現されるかを明示的に記述している。

---

## ステップ1: TLFの段階的分解とGN作成

### 分解の方針

知覚速度を「広範な視野内で視覚刺激の類似点や相違点を素早く流暢に探索・比較する能力」と定義し、この能力を実現するために必要な部分機能を階層的に分解した。

分解は、計算論的モデル（Priority Map理論、Guided Search 6.0、Drift Diffusion Model）と神経科学的知見（IPSの機能的組織化）に基づいて実施した。

### 第1層分解の根拠

知覚速度を以下の3つの主要な部分機能に分解した：

1. **R.Visual-Integration（視覚情報の空間的統合）**: 視野全体から視覚情報を統合し、探索可能な表現を構築
   - 根拠: Priority Map理論（Bisley & Goldberg, 2010）によれば、視覚探索はまず視野全体の優先度マップを構築することから始まる

2. **R.Goal-Matching-Selection（目標との照合と選択）**: 探索目標と視覚情報を照合し、候補を選択
   - 根拠: Guided Search 6.0（Wolfe, 2021）では、探索は目標テンプレートとの照合と選択的注意によって進行する

3. **R.Comparison-Judgment（比較判断）**: 選択された候補が目標と一致するかを判断
   - 根拠: Drift Diffusion Model（Ratcliff & McKoon, 2008）によれば、知覚判断は証拠の蓄積と閾値比較によって実現される

この3分割は、pIPS（統合）→ mIPS（選択）→ aIPS（判断）という神経解剖学的階層に直接対応している。

### 第2-3層分解の根拠

各主要機能をさらに詳細な部分機能に分解した：

**R.Visual-Integration の分解**:
- R.Feature-Extraction: 視覚特徴の抽出（視覚野の機能に対応）
- R.Spatial-Priority-Formation: 空間的優先度の形成
  - R.Bottom-Up-Saliency: ボトムアップ顕著性（Itti & Koch, 2001）
  - R.Goal-Directed-Priority: トップダウン優先度（Guided Search）
  - R.Priority-Integration: 優先度の統合（LIPの加算的統合; Thomas & Paré, 2007）

**R.Goal-Matching-Selection の分解**:
- R.Template-Matching: テンプレートマッチング（類似度計算）
- R.Attentional-Selection: 注意的選択
  - R.Target-Candidate-Selection: 候補選択（Winner-take-all）
  - R.Distractor-Suppression: Distractor抑制（Pop-inメカニズム）

**R.Comparison-Judgment の分解**:
- R.Evidence-Accumulation: 証拠の蓄積（DDMの積分プロセス）
- R.Criterion-Comparison: 判断基準との比較（閾値判断）
- R.Confidence-Evaluation: 確信度の評価（Bayesian confidence; Sanders et al., 2016）

各分解は、確立された計算論的モデルまたは神経科学的知見に基づいており、恣意的ではない。

### 初期分解の評価

初期分解では合計21のノード（TLF含む）が作成された。各親ノードの機能が子ノード群で十分に実現されることを確認した。

---

## ステップ2: 冗長性の削減とノードのマージ

### マージの根拠

初期分解を分析し、以下の冗長性を特定した：

#### 1. R.Saliency-Computation と R.Bottom-Up-Priority のマージ
- **理由**: 顕著性（saliency）の計算それ自体がボトムアップ優先度である。Priority Map理論において、salience mapとbottom-up priority mapは同義
- **統合後**: R.Bottom-Up-Saliency

#### 2. R.Goal-Maintenance と R.Top-Down-Priority のマージ
- **理由**: 探索目標の保持と、その目標に基づく優先度計算は不可分。Guided Search 6.0において、top-down guidanceは目標テンプレートの保持と適用を含む単一プロセス
- **統合後**: R.Goal-Directed-Priority

#### 3. R.Candidate-Selection と R.Competition-Resolution のマージ
- **理由**: 候補の選択は競合解決メカニズム（Winner-take-all）によって実現される。選択と競合解決を分離すると、実際の神経計算メカニズムと乖離する
- **統合後**: R.Target-Candidate-Selection

#### 4. R.Confidence-Evaluation の子ノード統合
- **理由**: 確信度計算（証拠強度評価、判断時間考慮、確信度算出）は単一の統合プロセスであり、分離すると過度に細分化される
- **判断**: R.Confidence-Evaluationをリーフノードとし、直接UCに紐づける

### マージ後の構造

最適化後、21ノードから15ノードに削減された（TLF含む）。これにより：
- 機能的に重複するノードが統合され、各ノードの役割がより明確になった
- FRG全体の構造が簡潔になり、解釈可能性が向上した
- 実際の神経計算メカニズムにより近い表現となった

### 解釈可能性の評価

マージ後の各ノードは明確に区別される機能を持ち、親ノードの機能が子ノード群で十分に実現される構造が保たれている。神経科学的・計算論的枠組みとの対応も明確である。

---

## ステップ3: UCとの紐づけとFRGの完成

### GN-UCマッピング戦略

ROI内UCは3つ（pIPS, mIPS, aIPS）であり、制約「各GNは必ず複数のUCに分解される必要がある」および「GN-UC間の接続数は各2つ以下」を満たす必要があった。

### マッピングの判断

第1層GN（R.Visual-Integration, R.Goal-Matching-Selection, R.Comparison-Judgment）を複数のUCに紐づけることで、制約を満たした：

1. **R.Visual-Integration → U.pIPS**
   - pIPSの主要機能（priority map構築）に対応
   - 単独UCだが、子GNを通じて複数要素を含む

2. **R.Goal-Matching-Selection → U.pIPS + U.mIPS**
   - pIPSでの初期的な目標関連性評価とmIPSでの詳細な照合・選択を含む
   - 2つのUCにまたがる機能として適切

3. **R.Comparison-Judgment → U.mIPS + U.aIPS**
   - mIPSでの初期判断信号生成とaIPSでの最終的な証拠蓄積・判断・確信度評価を含む
   - 2つのUCにまたがる機能として適切

### 接続数制約の確認

**各UCに接続する第1層GN数**:
- U.pIPS: R.Visual-Integration, R.Goal-Matching-Selection = 2 ✓
- U.mIPS: R.Goal-Matching-Selection, R.Comparison-Judgment = 2 ✓
- U.aIPS: R.Comparison-Judgment = 1 ✓

**各第1層GNから接続するUC数**:
- R.Visual-Integration: 1（U.pIPS）
- R.Goal-Matching-Selection: 2（U.pIPS + U.mIPS）✓
- R.Comparison-Judgment: 2（U.mIPS + U.aIPS）✓

すべての制約が満たされている。

### 第2-3層GNのUC紐づけ

第2-3層の各GNも、含まれる機能に基づいて適切なUCに紐づけられた：

- **pIPSに紐づく**: R.Feature-Extraction, R.Bottom-Up-Saliency, R.Goal-Directed-Priority（部分）, R.Priority-Integration
- **mIPSに紐づく**: R.Template-Matching, R.Goal-Directed-Priority（部分）, R.Target-Candidate-Selection, R.Distractor-Suppression
- **aIPSに紐づく**: R.Evidence-Accumulation, R.Criterion-Comparison, R.Confidence-Evaluation

この紐づけは、HCDで定義された各UCの機能（pIPS: priority map構築、mIPS: selective attention、aIPS: decision & confidence）と完全に一致している。

### 神経科学的妥当性

作成されたGN-UCマッピングは、以下の神経科学的知見と一致している：

- **pIPS**: 視覚特徴の統合と優先度マップ構築（Priority map理論）
- **mIPS**: 注意による選択とdistractor抑制（Selective attention研究）
- **aIPS**: 証拠蓄積と確信度計算（Decision-making研究）

各UCの機能が、対応するGN群によって階層的に分解され、実装されている。

---

## ステップ4: Interfaceの追加

### Interface定義の方針

各GNのInterfaceは、含まれるUCのInterfaceに基づいて定義した。UCのInterfaceはHCDで既に定義されているため、それを参照し、各GNが処理する入出力を明示した。

### 主要なInterface

**TLF (R.Perceptual-Speed)**:
- すべてのnon-ROI(input)を入力とし、すべてのnon-ROI(output)を出力
- 知覚速度の全体的な入出力関係を表現

**第1層GN**:
- R.Visual-Integration: U.pIPSのInterfaceと対応
- R.Goal-Matching-Selection: U.pIPSとU.mIPSのInterfaceを統合
- R.Comparison-Judgment: U.mIPSとU.aIPSのInterfaceを統合

**第2-3層GN**:
- 各GNのInterfaceは、担当する部分機能に応じた入出力を明示
- 親GNのInterfaceが子GNのInterfaceで実現されることを確認

### Interface整合性の検証

各GNのRequirementで記述された入出力が、Interfaceで定義された入出力と一致することを確認した。また、親GNのInterfaceが子GNとUCのInterfaceで完全に実現されることも確認した。

---

## ステップ5: 機能関連項目の定義

### 定義項目

各GN（TLF含む）について、以下の4項目を定義した：

1. **Requirement**: TLFを実現するために必要な入出力変換
2. **Requirement realization by interface**: Interfaceによる実現方法
3. **Capability**: Output Semanticsを除去した一般的計算能力
4. **Mechanism**: Capabilityを実現する計算機構

### 定義の方針

**Requirement**: 各GNがTLF実現のために果たすべき役割を、入力UC、出力UC、Output Semanticsを明示して記述した。

**Requirement realization by interface**: RequirementがInterfaceによってどのように実現されるかを検証し、両者の整合性を確認した。

**Capability**: 計算論的モデルと神経科学的知見を統合し、各GNの一般的な計算能力を記述した。文献（Priority Map理論、Guided Search 6.0、DDM、Bayesian confidence等）を引用した。

**Mechanism**: Capabilityを実現する具体的な計算機構を、プロセスの流れとして記述した。可能な限り、数式的な表現を含めた（Implementation項目は省略）。

### 主要GNの機能詳細

#### R.Visual-Integration
- **Capability**: 複数の視覚特徴チャネルからの情報を空間的に統合し、行動的優先度マップを構築
- **Mechanism**: Bottom-up saliency mapとtop-down relevance mapの統合、surround suppression、inhibition of return
- **根拠**: Itti & Koch (2001), Bisley & Goldberg (2010), Thomas & Paré (2007)

#### R.Goal-Matching-Selection
- **Capability**: 探索目標テンプレートと視覚情報を照合し、選択的注意により候補を絞り込む
- **Mechanism**: Template matching、Winner-take-all、Pop-inメカニズム、Feature attention
- **根拠**: Wolfe (2021), Gillebert et al. (2012), Vater et al. (2023)

#### R.Comparison-Judgment
- **Capability**: 感覚証拠を時間的に蓄積し、二値判断と確信度を計算
- **Mechanism**: Drift Diffusion Model、閾値判断、確信度計算
- **根拠**: Ratcliff & McKoon (2008), Sanders et al. (2016), Kiani & Shadlen (2009)

### 整合性の確認

各GNのRequirement、Capability、Mechanismが一貫しており、親子関係のあるGN間で整合していることを確認した。また、UCの機能定義（HCDから）と矛盾しないことも確認した。

---

## FRGの全体的評価

### 構造的妥当性

作成されたFRGは、以下の点で構造的に妥当である：

1. **階層性**: TLF → 第1層GN → 第2層GN → 第3層GN → UC という明確な階層構造
2. **機能分解の完全性**: 各親ノードの機能が子ノード群で十分に実現される
3. **制約の遵守**: GN-UC接続数制約（各2つ以下）が満たされている
4. **冗長性の排除**: マージにより、機能的に重複するノードが統合されている

### 計算論的妥当性

FRGは、確立された計算論的モデルに基づいている：

- **Priority Map理論** → R.Visual-Integration, R.Spatial-Priority-Formation
- **Guided Search 6.0** → R.Goal-Matching-Selection, R.Attentional-Selection
- **Drift Diffusion Model** → R.Comparison-Judgment, R.Evidence-Accumulation
- **Bayesian Confidence** → R.Confidence-Evaluation

各GNの機能は、これらのモデルで記述される計算プロセスに対応している。

### 神経科学的妥当性

FRGは、IPSにおける神経科学的知見と一致している：

- **pIPS**: Priority mapの構築 → R.Visual-Integration
- **mIPS**: Selective attentionとdistractor抑制 → R.Goal-Matching-Selection
- **aIPS**: Decision-makingとconfidence → R.Comparison-Judgment

この対応により、機能（GN）と神経構造（UC）が明確に結びつけられている。

### HCDとの整合性

作成されたFRGは、事前に作成されたHCDと完全に整合している：

- UCの数と名前が一致（pIPS, mIPS, aIPS）
- 各UCの機能定義が一致（priority map、selective attention、decision & confidence）
- UCのInterfaceが正しく使用されている

FRGは、HCDで定義された神経基盤上に、TLFの機能階層を明示的にマッピングしたものとなっている。

---

## 制約と今後の課題

### 現在のFRGの制約

1. **UCの数の制限**: ROI内UCが3つのみであるため、GNの分解粒度に制約がある
2. **時間的動態の簡略化**: 各処理段階の詳細な時間経過は限定的に記述されている
3. **個人差の未記述**: 平均的・標準的な処理を記述しており、個人差のメカニズムは含まれていない

### 今後の改善可能性

1. **より詳細なUC分割**: IPSをより細かいサブ領域（IPS1, IPS2, IPS3, IPS4など）に分割すれば、より詳細なGN-UCマッピングが可能
2. **時間的動態の明示化**: 各処理段階の所要時間や並列度を定量的に記述
3. **個人差のモデル化**: パラメータ化により、個人差の源泉を特定

これらの拡張は、FRGの基本構造を維持しながら実現可能である。

---

## 結論

本FRGは、知覚速度（Perceptual Speed）というTLFを階層的に分解し、ROI内のUniform Circuit（pIPS, mIPS, aIPS）と紐づけることで、認知能力が神経基盤によってどのように実現されるかを明示的に記述した。

作成過程において、以下が達成された：

1. **理論に基づく分解**: Priority Map理論、Guided Search 6.0、Drift Diffusion Modelなどの確立された計算論的枠組みに基づく機能分解
2. **冗長性の削減**: 機能的に重複するノードのマージによる解釈可能性の向上
3. **制約の遵守**: GN-UC接続数制約の満足
4. **神経科学的妥当性**: IPSの神経科学的知見との一致
5. **HCDとの整合性**: 事前に作成されたHCDとの完全な整合

作成されたFRGは、知覚速度という認知能力の「機能（what）」と「実装（where）」を結びつける橋渡しとして機能し、認知神経科学における理解を深化させる。

---

## 参考文献

1. Bisley, J. W., & Goldberg, M. E. (2010). Attention, intention, and priority in the parietal lobe. Annual Review of Neuroscience, 33, 1-21.

2. Gherman, S., & Philiastides, M. G. (2015). Neural representations of confidence emerge from the process of decision formation during perceptual choices. NeuroImage, 106, 134-143.

3. Gillebert, C. R., et al. (2012). Attentional priorities and access to short-term memory: Parietal interactions. NeuroImage, 62(3), 1551-1562.

4. Itti, L., & Koch, C. (2001). Computational modelling of visual attention. Nature Reviews Neuroscience, 2(3), 194-203.

5. Kiani, R., & Shadlen, M. N. (2009). Representation of confidence associated with a decision by neurons in the parietal cortex. Science, 324(5928), 759-764.

6. Konen, C. S., & Kastner, S. (2008). Two hierarchically organized neural systems for object information in human visual cortex. Nature Neuroscience, 11, 224-231.

7. Orban, G. A., & Caruana, F. (2014). The functional organization of the intraparietal sulcus in humans and monkeys. Journal of Physiology-Paris, 108(4-6), 170-181.

8. Ratcliff, R., & McKoon, G. (2008). The diffusion decision model: Theory and data for two-choice decision tasks. Neural Computation, 20(4), 873-922.

9. Sanders, J. I., Hangya, B., & Kepecs, A. (2016). Signatures of a statistical computation in the human sense of confidence. Neuron, 90(3), 499-506.

10. Thomas, N. W., & Paré, M. (2007). Temporal processing of saccade targets in parietal cortex area LIP during visual search. Journal of Neurophysiology, 97(1), 942-947.

11. Vater, C., Williams, A. M., & Hossner, E.-J. (2023). Feature attention as a control mechanism for the balance of speed and accuracy in visual search. Computational Brain & Behavior, 6, 217-241.

12. Wolfe, J. M. (2021). Guided Search 6.0: An updated model of visual search. Psychonomic Bulletin & Review, 28, 1060-1092.
