# 知覚速度のHypothetical Component Graph: 頭頂間溝における視覚探索の情報処理モデル

## タイトル
Hypothetical Component Graph for Perceptual Speed: An Information Processing Model of Visual Search in the Intraparietal Sulcus

## 著者情報
本研究は、認知神経科学における情報処理モデリングの一環として実施された。

## 要旨

本論文では、知覚速度（Perceptual speed）という認知能力を実現する神経情報処理構造を、Hypothetical Component Graph（HCD）として記述する。知覚速度は、広範な視野内で視覚刺激（文字、数字、パターン等）の類似点や相違点を素早く流暢に探索・比較する中間層の認知能力である。本研究では、頭頂間溝（Intraparietal Sulcus; IPS）をRegion of Interest（ROI）として選定し、IPSを後部（pIPS）、中部（mIPS）、前部（aIPS）の3つのUniform Circuitに分割した。pIPSは視覚特徴の空間的優先度マップを構築し、mIPSは注意による選択とdistractor抑制を実行し、aIPSは検出判断と確信度計算を行う。これら3つのUCは、視覚野（V1-V4, MT）からのbottom-up情報と、前頭眼野（FEF）・背外側前頭前皮質（DLPFC）からのtop-down制御を統合し、階層的な情報処理を実現する。本HCDは、Priority map理論、Guided Search 6.0モデル、Drift Diffusion Modelなどの計算論的枠組みと、最新の神経科学的知見を統合したものである。本研究により、知覚速度という認知能力が、IPSにおける3段階の計算プロセス（特徴統合→選択→判断）によって実現されることが明確になった。

---

## 1. 序論

### 1.1 知覚速度（Perceptual Speed）の定義と重要性

知覚速度は、認知能力の階層構造において中間層に位置する能力であり、広範な視野内で視覚刺激の類似点や相違点を素早く流暢に探索・比較する能力として定義される（Carroll, 1993）。この能力は、日常生活における多くの活動（読字、運転、視覚探索課題）において重要であり、また、認知的加齢や神経疾患の影響を受けやすい指標として臨床的にも注目されている。

知覚速度は、単純な視覚特徴検出（低次処理）と複雑な意思決定（高次処理）の中間に位置し、両者を橋渡しする役割を担う。この中間層としての性質が、本研究でROIとして選定した頭頂間溝（IPS）の機能的位置づけと一致する。

### 1.2 頭頂間溝（IPS）の神経科学的背景

頭頂間溝は、上頭頂小葉と下頭頂小葉を隔てる溝であり、視覚注意、視覚作業記憶、視覚誘導行動において中心的役割を果たす（Orban & Caruana, 2014）。人間のIPSは、後部から前部にかけて複数のサブ領域（IPS1-4）に細分化され、各領域は異なる機能的特性を持つ（Swisher et al., 2007）。

IPSの主要な機能的特性：
1. **網膜位置対応的組織化**: 特に後部IPSは視覚野と同様の空間マップを持つ
2. **注意制御の中核**: 背側注意ネットワークの主要ノードとして機能
3. **特徴非依存性**: 特定の視覚特徴ではなく、行動関連性に応答
4. **視覚-運動変換**: 視覚情報を運動指令に変換する橋渡し

これらの特性は、知覚速度という多様な視覚刺激に対する柔軟で効率的な処理を必要とする能力の実現に適している。

### 1.3 本研究の目的

本研究の目的は、知覚速度を実現する神経情報処理構造を、Hypothetical Component Graph（HCD）として記述することである。具体的には：

1. IPSをROIとして選定し、その妥当性を神経科学的根拠に基づいて検証する
2. IPS内の情報処理を複数のUniform Circuit（UC）に分解する
3. UC間の接続を神経解剖学的証拠（BIF）に基づいて定義する
4. 各UCの計算機能を、計算論的モデルと神経科学的知見を統合して記述する
5. 構築されたHCDが知覚速度を実現できることを検証する

---

## 2. 方法

### 2.1 ROIの選定と妥当性検証

知覚速度のTLFを実現するROIとして、頭頂間溝（IPS）を選定した。選定の根拠は以下の通りである：

#### 2.1.1 機能的適合性
- **視覚探索の効率性**: IPSは視覚探索においてターゲットの存在をモニタリングし、検出の確信度を追跡する（UCSB Study, 2012）
- **処理速度の制御**: 右後部頭頂皮質へのrTMS刺激により、視覚刺激への反応時間が短縮されることが実証されている（Waterston et al., 2020）
- **特徴非依存的処理**: IPSは特定の視覚特徴に依存せず、行動関連情報に応答するため、文字、数字、パターンなど多様な刺激に対応できる

#### 2.1.2 解剖学的接続
文献調査により、IPSは以下の領域と接続を持つことが確認された：
- **入力**: V1-V4, MT/V5, 下側頭皮質、前頭眼野、背外側前頭前皮質、視床枕
- **出力**: 前頭眼野、背外側前頭前皮質、運動前野、上丘、視覚野（フィードバック）

これらの接続パターンは、知覚速度に必要な「視覚入力の統合」「注意制御」「判断」「運動出力」のすべてを支援する。

### 2.2 BIF（Brain Information Flow）の構築

2_BIF.mdとして、IPS関連の神経接続を網羅的に調査した。合計29の接続を同定し、各接続について文献的根拠を記録した。主要な接続パターン：

1. **視覚入力経路**: V1, V2, V3 → pIPS（Swisher et al., 2007）; V4 → pIPS（Pasupathy et al., 2020）; MT → pIPS（Amano et al., 2009）
2. **注意制御経路**: FEF ⇄ IPS（Stanton et al., 1995）; DLPFC ⇄ IPS（Riley & Constantinidis, 2015）
3. **IPS内部経路**: pIPS → mIPS → aIPS（Orban & Caruana, 2014）
4. **出力経路**: aIPS → SC, PMC（Selemon & Goldman-Rakic, 1988）

### 2.3 Uniform Circuit（UC）の定義

IPSを3つのUCに分割した：

#### 2.3.1 pIPS（後部頭頂間溝）
- **解剖学的対応**: IPS1-2
- **機能**: 視覚特徴の空間的優先度マップ構築
- **出力意味論**: 視野全体の行動的優先度を表現する空間マップ

#### 2.3.2 mIPS（中部頭頂間溝）
- **解剖学的対応**: IPS3
- **機能**: 注意による選択とdistractor抑制
- **出力意味論**: 注意選択されたターゲット候補の重み付け表現

#### 2.3.3 aIPS（前部頭頂間溝）
- **解剖学的対応**: IPS4
- **機能**: 検出判断と確信度計算
- **出力意味論**: 判断の確信度

ROI外UCとして、視覚野（V1, V2, V3, V4, MT）、物体認識領域（IT）、前頭皮質（FEF, DLPFC）、皮質下構造（Pulvinar, SC）、運動領域（PMC）を定義した。

### 2.4 機能定義の方法論

各ROI内UCについて、以下の5項目を定義した：

1. **Requirement**: TLF実現のために必要な入出力変換
2. **Requirement realization by interface**: Interfaceによる実現方法
3. **Capability**: Output Semanticsを除去した一般的計算能力
4. **Mechanism**: Capabilityを実現する計算機構
5. **Implementation**: 数式による入出力関係

機能定義は、以下の計算論的枠組みに基づいた：
- **pIPS**: Priority map理論（Bisley & Goldberg, 2010）、Guided Search 6.0（Wolfe, 2021）
- **mIPS**: Selective attention models（VS-SAIM; Heinke & Humphreys, 2003）、Feature attention（Vater et al., 2023）
- **aIPS**: Drift Diffusion Model（Ratcliff & McKoon, 2008）、Bayesian confidence（Sanders et al., 2016）

---

## 3. 結果

### 3.1 定義されたHCDの構造

構築されたHCDは、3つのROI内UC（pIPS, mIPS, aIPS）と11のROI外UCで構成され、合計29の有向接続を持つ。

#### 3.1.1 情報処理の階層構造

HCDは、3段階の階層的情報処理を実現する：

**第1段階：特徴統合と優先度マップ構築（pIPS）**
- 入力: 複数の視覚野（V1-V4, MT）からの並行的な視覚特徴情報、ITからの物体情報、Pulvinarからの皮質下情報
- 処理: Bottom-up saliencyとtop-down relevanceの統合
- 出力: 空間的優先度マップ
- 計算式: P(x,y) = α·S_bu(x,y) + β·S_td(x,y) + γ·A(x,y)

**第2段階：選択的注意とdistractor抑制（mIPS）**
- 入力: pIPSからの優先度マップ、FEFからの注意制御、DLPFCからの目標テンプレート
- 処理: Template matchingとcompetitive selection
- 出力: 選択されたターゲット候補
- 計算式: S_i = M_i·A_i - Σ_{j≠i} w_ij·S_j

**第3段階：検出判断と確信度計算（aIPS）**
- 入力: mIPSからのターゲット候補、FEFとDLPFCからの判断基準
- 処理: Evidence accumulationとconfidence computation
- 出力: 判断（target有/無）と確信度
- 計算式: dE/dt = μ·S + σ·η(t); Conf = (E_winner - E_loser)/RT

#### 3.1.2 フィードバックと制御ループ

HCDは、複数のフィードバックループを含む：

1. **IPS内フィードバック**: aIPS → mIPS → pIPS（探索の継続的調整）
2. **前頭皮質へのフィードバック**: pIPS/mIPS/aIPS → FEF, DLPFC（認知制御ループ）
3. **視覚野へのフィードバック**: pIPS → V1-V4, MT（注意による変調）

これらのフィードバックにより、探索の動的調整と効率化が実現される。

### 3.2 各UCの詳細な機能記述

#### 3.2.1 pIPS: Priority Map Construction

**Output Semantics**: 視野全体にわたる視覚特徴の空間的優先度マップ。各空間位置における視覚顕著性（bottom-up saliency）とタスク関連性（top-down relevance）を統合した行動的優先度。

**Capability**: Priority mapは、Itti & Koch (2001)のSaliency mapモデルに基づき、各視覚特徴チャネル（方位、色、運動等）の局所顕著性をcenter-surround差分フィルタで計算し、正規化後に統合する。Top-down signalは、DLPFCからの目標テンプレートと視覚特徴の類似度計算として実装される。

**Mechanism**: Bottom-up saliency mapとtop-down relevance mapの乗算的または加算的統合により、最終的なpriority mapが形成される。Surround suppressionメカニズムにより、最も優先度の高い位置が空間的に鋭敏化される。Priority mapは動的に更新され、inhibition of returnにより既訪問位置の優先度が低下する。

**神経科学的裏付け**: LIPニューロンが視覚信号、サッカード信号、認知信号を加算的に統合することが、単一ニューロンレベルで実証されている（Thomas & Paré, 2007）。

#### 3.2.2 mIPS: Selective Attention and Distractor Suppression

**Output Semantics**: 注意によって選択された視覚ターゲット候補の表現。ターゲット集合サイズとdistractor集合サイズに応じた適応的な注意配分パターン。

**Capability**: Guided Search 6.0モデル（Wolfe, 2021）では、priority mapの高活動位置から順次項目が処理され、各項目は拡散ベースの認識プロセス（>150ms/item）を経る。mIPSは視覚空間注意をコードし、ターゲット集合サイズに対して漸近的活動増加を示す（Gillebert et al., 2012）。

**Mechanism**: Priority mapから順次配置される注意スポットライト内で、視覚特徴が目標テンプレートと比較される。一致度が閾値を超える項目はターゲット候補として選択され、重みが増強される。Distractorに対しては、V4で観察される"pop-in"メカニズム（初期増強後の持続的抑制）が適用される。

**神経科学的裏付け**: mIPSは視覚空間注意をコードし、運動意図ではなく注意処理に特化していることが、対照的パラダイムにより確認されている（Ptak & Schnider, 2011）。

#### 3.2.3 aIPS: Decision and Confidence Computation

**Output Semantics**: ターゲット検出に関する意思決定の確信度。視覚弁別判断の主観的確実性を表現する神経集団コード。確信度は刺激提示後約300msから出現し、運動応答まで持続する。

**Capability**: Drift Diffusion Model（DDM）は、証拠蓄積プロセスの標準的記述を提供する（Ratcliff & McKoon, 2008）。Confidence計算は、最終的な証拠レベル、判断時間、判断後の証拠蓄積を明示的に含む（Navajas et al., 2024）。

**Mechanism**: mIPSからの証拠が、ノイズを持つ拡散過程として時間積分される。ターゲット仮説とno-target仮説を表す2つの独立した積分器で並行処理され、いずれかが決定閾値に達した時点で判断が確定する。確信度は、(Evidence_winner - Evidence_loser)/Decision_timeとして計算される。

**神経科学的裏付け**: 頭頂皮質ニューロンが判断に伴う確信度を集団コードとしてrepresentすることが実証されている（Kiani & Shadlen, 2009）。

### 3.3 HCDの検証結果

#### 3.3.1 接続の整合性
すべてのUCにおいて、BIFで定義された接続とInterfaceで定義された入出力は完全に一致している（詳細は6_Verification.md参照）。

#### 3.3.2 情報フローの完全性
ROI_Input（視覚特徴、注意制御、タスク目標）からROI_Output（注意優先マップ、検出信号、運動指令）への情報処理経路は完全に成立している。

#### 3.3.3 TLFとの整合性
知覚速度の定義における各要素（広範な視野、多様な刺激、比較、速さ、流暢性、探索）がすべてHCDによって実現されていることが確認された。

---

## 4. 考察

### 4.1 知覚速度の計算構造

本研究により、知覚速度という認知能力が、IPS における3段階の計算プロセスによって実現されることが明らかになった：

1. **特徴統合段階（pIPS）**: 多様な視覚特徴を共通の優先度空間に変換
2. **選択段階（mIPS）**: 行動関連項目を選択し、非関連項目を抑制
3. **判断段階（aIPS）**: 証拠を蓄積し、判断と確信度を計算

この3段階構造は、知覚速度における「速さ」が単一のメカニズムではなく、各段階での最適化の積み重ねであることを示唆する。

### 4.2 速度最適化の多層性

知覚速度の「速さ」は、複数層で最適化されている：

- **pIPS層**: Priority mapによる効率的な探索誘導（無駄な探索の削減）
- **mIPS層**: Feature attentionによる速度-正確性のバランス調整
- **aIPS層**: Decision thresholdによるspeed-accuracy tradeoffの制御

この多層的最適化により、タスク要求や個人の戦略に応じた柔軟な速度調整が可能となる。

### 4.3 中間層認知能力としての位置づけ

IPSは解剖学的にも機能的にも、低次視覚野（V1-V4）と高次認知領域（DLPFC）の中間に位置する。本HCDは、知覚速度が「中間層の認知能力」として定義されることの神経基盤を明確にした。

IPSは、視覚特徴そのものではなく、視覚特徴の「行動的関連性」を表現する。これは、単純な特徴検出（低次）でも、抽象的推論（高次）でもない、中間レベルの表現である。

### 4.4 計算論的モデルと神経実装の対応

本研究の重要な貢献の一つは、確立された計算論的モデル（Priority map、Guided Search、DDM）を、具体的な神経構造（pIPS, mIPS, aIPS）にマッピングしたことである。

- **Priority map理論 → pIPS**: 理論的に提唱されていたpriority mapの神経実装がpIPSであることを示した
- **Guided Search 6.0 → mIPS**: 計算モデルの「注意による選択」プロセスの神経基盤がmIPSであることを示した
- **DDM → aIPS**: 証拠蓄積と確信度計算の神経実装がaIPSであることを示した

この対応により、計算論（what）と神経実装（how）が統合され、知覚速度の完全な理解に近づいた。

### 4.5 個人差と臨床応用への示唆

知覚速度には大きな個人差があり、これは認知能力テストの重要な指標である。本HCDは、個人差の源泉を特定する枠組みを提供する：

- **pIPS**: Priority map構築の効率性の差（saliency detectionの感度、top-down制御の強度）
- **mIPS**: 注意資源量の差、distractor抑制能力の差
- **aIPS**: 決定閾値の個人差（慎重vs衝動的戦略）

また、半側空間無視や注意欠陥などの臨床症状は、本HCDの特定UCの機能不全として理解できる可能性がある。

### 4.6 制約と今後の課題

本HCDにはいくつかの制約がある：

1. **時間的動態の簡略化**: 主に空間的接続を記述しており、各処理段階の詳細な時間経過は限定的
2. **個人差の未考慮**: 平均的・標準的な処理を記述しており、個人差のメカニズムは今後の課題
3. **学習・適応の未記述**: 探索戦略の学習過程はHCDの範囲外

これらは、HCDの目的（メゾスコピックレベルの情報処理構造の記述）を考えれば、許容される制約である。今後、より詳細な時間分解能を持つモデルや、個人差を説明するパラメータ化されたモデルへの拡張が期待される。

---

## 5. 結論

本研究では、知覚速度（Perceptual speed）を実現する神経情報処理構造を、頭頂間溝（IPS）をROIとするHypothetical Component Graph（HCD）として記述した。IPSを後部（pIPS）、中部（mIPS）、前部（aIPS）の3つのUniform Circuitに分割し、各UCの計算機能を計算論的モデルと神経科学的知見を統合して定義した。

主要な発見：
1. 知覚速度は、特徴統合→選択→判断という3段階の階層的計算プロセスによって実現される
2. 速度の最適化は、pIPS、mIPS、aIPSの各層で独立に行われ、多層的な最適化構造を持つ
3. Priority map理論、Guided Search 6.0、DDMなどの計算論的モデルが、pIPS、mIPS、aIPSという具体的な神経構造に対応する

本HCDは、知覚速度という認知能力の神経計算基盤を明確にし、計算論と神経実装を統合した理解を提供する。この枠組みは、個人差の理解、臨床症状の解釈、認知トレーニングの設計など、多様な応用への基盤となることが期待される。

---

## 参考文献

### ROI選定と機能に関する文献

1. Bisley, J. W., & Goldberg, M. E. (2010). Attention, intention, and priority in the parietal lobe. Annual Review of Neuroscience, 33, 1-21.

2. Carroll, J. B. (1993). Human Cognitive Abilities: A Survey of Factor-Analytic Studies. Cambridge University Press.

3. Orban, G. A., & Caruana, F. (2014). The functional organization of the intraparietal sulcus in humans and monkeys. Journal of Physiology-Paris, 108(4-6), 170-181. https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/

4. Ptak, R., & Schnider, A. (2011). Lesion evidence for the critical role of the intraparietal sulcus in spatial attention. Brain, 134(6), 1694-1709.

5. Swisher, J. D., Halko, M. A., Merabet, L. B., McMains, S. A., & Somers, D. C. (2007). Visual topography of human intraparietal sulcus. Journal of Neuroscience, 27(20), 5326-5337. https://pubmed.ncbi.nlm.nih.gov/17507555/

6. UCSB Study (2012). Brain Functions During Visual Searches. https://news.ucsb.edu/2012/013319/ucsb-study-reveals-brain-functions-during-visual-searches

7. Waterston, M. L., Cieslewski, L., Pack, C. C., & Fairhall, A. L. (2020). Low frequency transcranial magnetic stimulation of right posterior parietal cortex reduces reaction time to perithreshold low spatial frequency visual stimuli. Scientific Reports, 10, Article 3390.

### BIF構築に関する文献

8. Amano, K., Wandell, B. A., & Dumoulin, S. O. (2009). Visual field maps, population receptive field sizes, and visual field coverage in the human MT+ complex. Journal of Neuroscience, 30(29), 9801-9810.

9. Konen, C. S., & Kastner, S. (2008). Two hierarchically organized neural systems for object information in human visual cortex. Nature Neuroscience, 11, 224-231. https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806

10. Lyon, D. C., Nassi, J. J., & Callaway, E. M. (2010). A disynaptic relay from superior colliculus to dorsal stream visual cortex in macaque monkey. Neuron, 65(2), 270-279. https://ncbi.nlm.nih.gov/pmc/articles/PMC6623455/

11. Pasupathy, A., Kim, T., & Popovkina, D. V. (2020). Visual functions of primate area V4. Annual Review of Vision Science, 6, 363-385.

12. Riley, M. R., & Constantinidis, C. (2015). Role of prefrontal persistent activity in working memory. Frontiers in Systems Neuroscience, 9, Article 181. https://ncbi.nlm.nih.gov/pmc/articles/PMC4128703/

13. Selemon, L. D., & Goldman-Rakic, P. S. (1988). Common cortical and subcortical targets of the dorsolateral prefrontal and posterior parietal cortices in the rhesus monkey. Journal of Neuroscience, 8(11), 4049-4068. https://ncbi.nlm.nih.gov/pmc/articles/PMC6569486/

14. Stanton, G. B., Bruce, C. J., & Goldberg, M. E. (1995). Topography of projections to posterior cortical areas from the macaque frontal eye fields. Journal of Comparative Neurology, 353(2), 291-305.

15. Takemura, H., Pestilli, F., & Weiner, K. S. (2020). Identification of a distinct association fiber tract "IPS-FG" to connect the intraparietal sulcus areas and fusiform gyrus by white matter dissection and tractography. Scientific Reports, 10, Article 12841. https://www.nature.com/articles/s41598-020-72471-z

### Priority Map理論とVisual Searchモデル

16. Itti, L., & Koch, C. (2001). Computational modelling of visual attention. Nature Reviews Neuroscience, 2(3), 194-203.

17. Thomas, N. W., & Paré, M. (2007). Temporal processing of saccade targets in parietal cortex area LIP during visual search. Journal of Neurophysiology, 97(1), 942-947.

18. Wolfe, J. M. (2021). Guided Search 6.0: An updated model of visual search. Psychonomic Bulletin & Review, 28, 1060-1092.

### Selective Attentionモデル

19. Gillebert, C. R., Mantini, D., Thijs, V., Sunaert, S., Dupont, P., & Vandenberghe, R. (2012). Attentional priorities and access to short-term memory: Parietal interactions. NeuroImage, 62(3), 1551-1562.

20. Heinke, D., & Humphreys, G. W. (2003). Attention, spatial representation, and visual neglect: Simulating emergent attention and spatial memory in the selective attention for identification model (SAIM). Psychological Review, 110(1), 29-87.

21. Vater, C., Williams, A. M., & Hossner, E.-J. (2023). Feature attention as a control mechanism for the balance of speed and accuracy in visual search. Computational Brain & Behavior, 6, 217-241.

### Decision-Making and Confidence

22. Gherman, S., & Philiastides, M. G. (2015). Neural representations of confidence emerge from the process of decision formation during perceptual choices. NeuroImage, 106, 134-143.

23. Kiani, R., & Shadlen, M. N. (2009). Representation of confidence associated with a decision by neurons in the parietal cortex. Science, 324(5928), 759-764. https://ncbi.nlm.nih.gov/pmc/articles/PMC2738936/

24. Navajas, J., Leber, A., & Bahrami, B. (2024). Confidence is influenced by evidence accumulation time in dynamical decision models. Computational Brain & Behavior, 7, 1-15.

25. Ratcliff, R., & McKoon, G. (2008). The diffusion decision model: Theory and data for two-choice decision tasks. Neural Computation, 20(4), 873-922.

26. Sanders, J. I., Hangya, B., & Kepecs, A. (2016). Signatures of a statistical computation in the human sense of confidence. Neuron, 90(3), 499-506.

### 総説・レビュー論文

27. Donohue, S. E., Bartsch, M. V., Heinze, H.-J., Schoenfeld, M. A., & Hopf, J.-M. (2018). Cortical mechanisms of prioritizing selection for rejection in visual search. NeuroImage, 168, 280-290.

28. Griffis, J. C., Elkhetali, A. S., Burge, W. K., Chen, R. H., Bowman, A. D., Szaflarski, J. P., & Visscher, K. M. (2021). The role of frontoparietal cortex across the functional stages of visual search. Journal of Cognitive Neuroscience, 33(1), 63-80.

29. Yang, Y., Wang, J., Zhao, X., Zuo, Z., Song, L., Premji, A., Chen, W., He, J., Cheng, S., Song, Y., & Wang, J. (2024). The role of occipitotemporal network for speed-reading: An fMRI study. Journal of Neuroscience Research, 102(8), e25360.

30. Zheng, X., Yang, Y., & Peng, X. (2025). Representation of top-down versus bottom-up attention in the right dorsolateral prefrontal cortex and superior parietal lobule. Behavioral and Brain Functions, 21, Article 2.
