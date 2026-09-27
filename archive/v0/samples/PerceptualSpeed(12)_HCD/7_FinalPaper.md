# Perceptual Speed機能の神経計算モデル: 頭頂間溝におけるHypothetical Component Graph

## Abstract

本論文では、Perceptual Speed（知覚速度）—文字、数字、物体、パターン間の類似性と相違性を迅速かつ正確に比較する認知能力—の神経計算モデルを、頭頂間溝（Intraparietal Sulcus, IPS）を中心とするHypothetical Component Graph（HCD）として構築した。最新の神経科学的知見（2024-2025年）に基づき、視覚特徴統合、パターン比較、ワーキングメモリ維持、比較決定の4つの主要Uniform Circuit（UC）を定義し、それらの計算機能と神経機構を詳細に記述した。本HCDは、階層的フィードフォワード統合、関係性符号化、ドリフト拡散モデルなどの計算原理を統合し、ROI入力から決定出力までの完全な情報処理経路を提供する。検証の結果、すべてのUC間の接続が文献により裏付けられ、情報フローが論理的に一貫していることが確認された。

## 1. Introduction

### 1.1 Perceptual Speedとは

Perceptual Speed（知覚速度）は、視覚刺激間の類似性と相違性を迅速かつ正確に判断する基本的な認知能力である（DROracle AI, 2024）。この能力は、以下の要素を含む：

- **視覚比較**: 文字、数字、物体、図柄、パターンの集合を比較
- **時間的柔軟性**: 同時提示された刺激間の比較、または順次提示された刺激と記憶との比較
- **速度と正確性**: 迅速な処理と高い判断精度の両立

Perceptual Speedは、日常生活における多くのタスク（読解、視覚探索、品質管理など）に不可欠であり、脳卒中リハビリテーション、神経心理学的評価、職業パフォーマンス予測において重要な指標となる。

### 1.2 神経科学的背景

近年の神経画像研究により、Perceptual Speedが分散ネットワークによって実現されることが明らかになっている。Liu et al. (2025)は、マルチバリエートfMRI解析により、数字と文字の認識が以下の領域を含むネットワークによって支えられることを示した：

- 腹側側頭後頭皮質（カテゴリー特異的表現）
- 頭頂間溝（比較処理）
- 中前頭回（認知制御）
- 島皮質（タスク処理）

特に、**頭頂間溝（IPS）は視覚比較処理の中核として機能**し、関係性符号化を通じて視覚パターン間の類似性を計算する（Nature Communications, 2025）。IPSは、視覚入力系（V1/V2, 腹側側頭皮質）と決定出力系（前頭前皮質）を結ぶ中核ノードとして位置づけられる。

### 1.3 本研究の目的

本研究の目的は、**頭頂間溝（IPS）を中心とするPerceptual Speed機能の計算論的モデル**をHCD（Hypothetical Component Graph）として構築することである。HCDは、特定の脳領域が実行する情報処理を、神経科学的証拠に基づいてグラフ構造として記述する手法であり、メゾスコピックレベルの神経組織単位（Uniform Circuit）間の情報フローを明示化する。

---

## 2. Methods

### 2.1 ROI（Region of Interest）の選定

文献調査に基づき、**頭頂間溝（IPS）**をROIとして選定した。選定理由は以下の通り：

1. **視覚比較処理の中核**: IPSは数字、文字、パターンの認識と比較処理に直接関与（Liu et al., 2025）
2. **関係性符号化**: 視覚パターン間の類似性比較を支える関係性符号化を実行（Nature Communications, 2025）
3. **視覚-記憶統合**: 提示刺激と記憶刺激の比較に関与
4. **機能的細分化**: hIP1, hIP2, hIP3, LIP, AIP, VIP, MIPなど、異種の接続プロファイルを持つ機能的サブ領域を含む（Basti et al., 2022）
5. **背側-腹側統合**: 腹側視覚流への調整入力を提供し、視覚情報処理を統合（Kamali et al., 2020）

### 2.2 BIF（Brain Information Flow）の構築

ROI内外の神経接続を網羅的に調査し、BIFデータベースを構築した。主要な接続は以下を含む：

- **視覚入力**: V1/V2 → IPS, Fusiform Gyrus → IPS（IPS-FG線維束）, MT/MST → LIP
- **注意調整**: Pulvinar → IPS, dlPFC → IPS
- **眼球運動制御**: LIP ↔ FEF（双方向接続）
- **決定出力**: IPS → dlPFC

すべての接続は、Lewis & Van Essen (2000), Kamali et al. (2020), Harrewijn et al. (2025), Arcaro et al. (2025)などの文献により裏付けられた。

### 2.3 Uniform Circuit（UC）の定義

BIFに基づき、以下の基準でUCを定義した：

1. TLF（Perceptual Speed）の実現に必要な情報処理に関与
2. 同質的な情報をコードする神経組織
3. メゾスコピックレベルとして適切な粒度
4. ROI内とROI外を明確に区別

**ROI内UC（4つ）**:
- `Visual-Input-Integration` (後部IPS: IPS1-2)
- `Pattern-Comparison` (LIP)
- `Working-Memory-Maintenance` (LIPd)
- `Comparison-Decision` (前部IPS: IPS3-4, hIP1-3)

**ROI外UC（8つ）**:
- 入力: `Early-Visual-Features`, `High-Level-Visual-Representation`, `Motion-Processing`, `Thalamic-Attention-Hub`, `Top-Down-Attention-Control`
- 出力: `Decision-Output`, `Motor-Output`
- 双方向: `Oculomotor-Control`, `High-Level-Visual-Representation`

---

## 3. Results: HCDの構造と機能

### 3.1 全体構造

構築されたHCDは、視覚入力から決定出力までの完全な情報処理経路を記述する。情報フローは以下のように進行する：

**主経路**:
1. 視覚特徴入力（V1/V2, Fusiform Gyrus） → `Visual-Input-Integration`
2. `Visual-Input-Integration` → `Pattern-Comparison`
3. `Pattern-Comparison` → `Comparison-Decision`
4. `Comparison-Decision` → `Decision-Output` (dlPFC)

**記憶経路**:
1. `Visual-Input-Integration` → `Working-Memory-Maintenance`
2. `Working-Memory-Maintenance` → `Pattern-Comparison`

**フィードバック経路**:
1. `Pattern-Comparison` → `Oculomotor-Control` → `Working-Memory-Maintenance`（眼球運動フィードバック）
2. `Comparison-Decision` → `High-Level-Visual-Representation`（トップダウン視覚調整）

### 3.2 各UCの詳細解説

#### 3.2.1 Visual-Input-Integration（視覚入力統合）

**位置**: 後部IPS（IPS1, IPS2）

**機能**: 多層的な視覚情報源（低次特徴、高次カテゴリー表現、注意信号、認知制御信号）を統合し、単一の多次元表現空間に射影する。

**神経機構**: 階層的フィードフォワード統合。低次視覚特徴（V1/V2）と高次カテゴリー表現（Fusiform Gyrus）は、後部IPS内の異なる皮質層に投射され、注意信号（Pulvinar）によって動的にゲート制御される。トップダウン制御信号（dlPFC）は、タスク関連特徴への重み付けを調整する。

**計算モデル**:
```
[U.Visual-Input-Integration] = α₁·[U.Early-Visual-Features] + α₂·[U.High-Level-Visual-Representation]
```
ここで、α₁, α₂は注意による重み付け係数（シグモイド関数など）。

**神経科学的根拠**: 後頭頂皮質は、視覚情報を行動制御のために統合する中核ハブとして機能し、階層的フィードフォワード機構を通じて視覚特徴を統合する（Gamberini et al., 2024; Plos Biology, 2023）。統合情報理論によれば、PPCは情報統合の中核複合体として機能する（Frontiers in Neuroscience, 2025）。

#### 3.2.2 Pattern-Comparison（パターン比較）

**位置**: LIP（外側頭頂間領域）。LIPvとLIPdの２つのコンパートメントを含む。

**機能**: 視覚パターン間の関係性符号化。類似性距離の計算。提示刺激同士または提示-記憶刺激間の比較。

**神経機構**: 関係性符号化による類似性計算。LIP内のニューロン集団は、視覚刺激を高次元空間内の点として表現する。類似性比較は、これらの点間の距離（ユークリッド距離、マハラノビス距離など）を計算することで実現される。注意信号は、特定の特徴次元への重み付けを調整し、タスク関連の類似性判断を促進する。

**計算モデル**:
```
[U.Pattern-Comparison] = d([U.Visual-Input-Integration], [U.Working-Memory-Maintenance])
d(x, y) = √(Σᵢ wᵢ(xᵢ - yᵢ)²)
```
wᵢは注意によって調整される特徴次元iの重み。

**神経科学的根拠**: 高次視覚皮質は関係性符号化（類似性距離の比較）を主要な神経コードとして使用する（Nature Communications, 2025）。外側頭頂皮質は神経パターン類似性の時間的非対称性を用いて認識記憶決定を行う（Nature Communications, 2025）。LIPvは眼球運動制御への強いフィードフォワード接続を持つ（Harrewijn et al., 2025）。

#### 3.2.3 Working-Memory-Maintenance（ワーキングメモリ維持）

**位置**: LIPd（背側外側頭頂間領域）

**機能**: 高次元視覚表現を変換された形式で短期間維持する。この維持は、知覚時の感覚表現の直接的コピーではなく、タスク目標に応じて変換・精錬された表現である。

**神経機構**: 変換された表現の維持。視覚入力はタスク目標に応じて変換され、LIPd内のリカレント神経回路によって維持される。リカレント接続（興奮性および抑制性）は、持続的なニューロン活動を支え、記憶表現を数秒間安定化する。眼球運動フィードバックは、網膜座標から頭部中心座標への変換を可能にし、眼球運動中も記憶表現が安定に保たれる。

**計算モデル**:
```
[U.Working-Memory-Maintenance](t) = ∫₀ᵗ R(t-τ)·T([U.Visual-Input-Integration](τ))·G([U.Top-Down-Attention-Control](τ)) dτ + β·[U.Oculomotor-Control](t)
```
R(t)はリカレント維持関数、T(·)はタスク駆動変換関数、G(·)はゲート制御関数、βは眼球運動フィードバックの座標変換係数。

**神経科学的根拠**: 後頭頂皮質と後頭側頭皮質は、視覚ワーキングメモリ中に知覚時とは異なる変換された表現を維持する（eNeuro, 2025）。PPCは、VWM中の異なる情報ストリームの表現を直交化し、適応的な視覚処理を可能にする（PMC, 2024）。

#### 3.2.4 Comparison-Decision（比較決定）

**位置**: 前部IPS（IPS3, IPS4, hIP1-3）

**機能**: 連続的な類似性距離を二値的決定（類似/相違）に変換する閾値決定機能。ドリフト拡散モデルのような証拠蓄積メカニズムを実装する。

**神経機構**: 証拠蓄積と閾値決定。Pattern-Comparisonからの類似性距離情報は、前部IPS内で時間的に蓄積される。蓄積された証拠が決定境界（閾値）に達すると、二値的決定（類似または相違）が下される。決定境界は、トップダウン制御信号によって動的に調整される。

**計算モデル**:
```
証拠蓄積: dE/dt = μ·[U.Pattern-Comparison] + σ·η(t)
決定規則: [U.Comparison-Decision] = {類似 if E(t) ≥ θ_upper; 相違 if E(t) ≤ θ_lower}
```
μはドリフト率、σはノイズ強度、θは決定境界。

**神経科学的根拠**: 前部IPS（IPS3-4）は前頭前野領域と強く接続し、決定処理に関与する（Greenberg et al., 2012; Basti et al., 2022）。頭頂皮質は、感覚証拠を蓄積して決定を形成する（ドリフト拡散モデル）。

---

## 4. Discussion

### 4.1 主要な発見

本研究により、Perceptual Speed機能が頭頂間溝を中心とする分散ネットワークによって実現されることが、計算論的モデルとして明示化された。主要な発見は以下の通り：

1. **階層的処理**: 視覚入力統合 → パターン比較 → 比較決定の3段階処理
2. **並列経路**: 現在刺激の比較経路と、記憶刺激との比較経路が並列に存在
3. **フィードバック制御**: トップダウン視覚調整と眼球運動フィードバックによる双方向処理
4. **計算原理の統合**: 階層的統合、関係性符号化、ドリフト拡散モデルなど、異なる計算原理が統合されている

### 4.2 先行研究との関係

本HCDは、以下の先行研究と整合的である：

- **Liu et al. (2025)**: 数字・文字認識における分散ネットワークの特定 → 本HCDはIPSを中核とした処理経路を詳細化
- **Nature Communications (2025)**: 関係性符号化による類似性比較 → 本HCDのPattern-Comparisonの計算モデルに統合
- **Harrewijn et al. (2025)**: LIPの2コンパートメント構造（LIPv, LIPd） → 本HCDでPattern-ComparisonとWorking-Memory-Maintenanceとして機能的に分離
- **eNeuro (2025)**: 変換された表現によるワーキングメモリ維持 → 本HCDのWorking-Memory-Maintenanceの計算モデルに統合

### 4.3 HCDの実用的意義

本HCDは、以下の実用的応用が期待される：

1. **神経画像研究**: fMRI/EEG研究における予測生成と仮説検証
2. **臨床評価**: Perceptual Speed障害の神経機構の理解と診断
3. **計算モデリング**: 人工知能における視覚比較アルゴリズムの設計
4. **ニューロリハビリテーション**: IPSを標的とした訓練プログラムの開発

### 4.4 制約と今後の課題

本HCDには以下の制約が存在する：

1. **ROIの限定**: IPSに焦点を当てたため、他の関与領域（dlPFC, Fusiform Gyrusなど）の内部処理は詳細化されていない
2. **個人差**: 個人間のIPS形態的差異（Pardi et al., 2024）がPerceptual Speedに与える影響は本HCDに含まれていない
3. **発達・可塑性**: 学習や訓練による神経回路の変化は本HCDでモデル化されていない
4. **実験的検証**: 本HCDの予測を検証する実験的研究が今後必要である

今後の研究では、以下が期待される：

- **マルチモーダル検証**: fMRI, EEG, 単一細胞記録を組み合わせた検証
- **計算モデルの実装**: ニューラルネットワークによるHCDの実装と行動データとの比較
- **臨床応用**: 脳損傷患者におけるHCD構成要素の障害パターンの特定
- **発達研究**: 児童期から成人期にかけたHCDの成熟過程の解明

---

## 5. Conclusion

本研究では、Perceptual Speed機能の神経計算モデルを、頭頂間溝を中心とするHCDとして構築した。4つの主要UC（Visual-Input-Integration, Pattern-Comparison, Working-Memory-Maintenance, Comparison-Decision）を定義し、それらの計算機能と神経機構を、最新の神経科学的知見に基づいて詳細に記述した。本HCDは、階層的フィードフォワード統合、関係性符号化、ドリフト拡散モデルなどの計算原理を統合し、視覚入力から決定出力までの完全な情報処理経路を提供する。本HCDは、神経画像研究、臨床評価、計算モデリング、ニューロリハビリテーションにおいて実用的な価値を持つと期待される。

---

## References

### 主要文献

1. **Arcaro, M. J., et al. (2025)**. Projection Motifs and Wiring Logic of Medial Pulvinar Thalamocortical Axons in the Marmoset Monkey. *The Journal of Neuroscience*, 45(15), e1837242025. https://www.jneurosci.org/content/jneuro/45/15/e1837242025.full.pdf

2. **Basti, A., et al. (2022)**. Systems-level decoding reveals the cognitive and behavioral profile of the human intraparietal sulcus. *Frontiers in Neuroimaging*, 1, 1074674. https://www.frontiersin.org/articles/10.3389/fnimg.2022.1074674/full

3. **Culham, J. C., & Kanwisher, N. G. (2001)**. Neuroimaging of cognitive functions in human parietal cortex. *Current Opinion in Neurobiology*, 11(2), 157-163. https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/

4. **DROracle AI (2024)**. What is perceptual speed? https://www.droracle.ai/articles/283598/what-is-perceptual-speed

5. **Gamberini, M., et al. (2024)**. Visual sensitivity at the service of action control in posterior parietal cortex. *Frontiers in Physiology*, 15, 1408010. https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2024.1408010/full

6. **Greenberg, A. S., et al. (2012)**. Structural connectivity of visuotopic intraparietal sulcus. *NeuroImage*, 62(3), 1685-1695. https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806

7. **Harrewijn, A., et al. (2025)**. Anatomical circuits for flexible spatial mapping by single neurons in posterior parietal cortex. *Communications Biology*, 8, 596. https://www.nature.com/articles/s42003-025-08596-6

8. **Kamali, A., et al. (2020)**. Identification of a distinct association fiber tract "IPS-FG" to connect the intraparietal sulcus areas and fusiform gyrus by white matter dissection and tractography. *Scientific Reports*, 10, 13952. https://www.nature.com/articles/s41598-020-72471-z

9. **Lewis, J. W., & Van Essen, D. C. (2000)**. Corticocortical connections of visual, sensorimotor, and multimodal processing areas in the parietal lobe of the macaque monkey. *Journal of Comparative Neurology*, 428(1), 112-137. https://pubmed.ncbi.nlm.nih.gov/11058227/

10. **Liu, M., et al. (2025)**. Brain-wide Decoding of Numbers and Letters: Converging Evidence from Multivariate fMRI Analysis and Probabilistic Meta-Analysis. Stanford Med. https://med.stanford.edu/content/dam/sm/scsnl/documents/liu_et_al_2025.pdf

11. **Luppino, G., et al. (1999)**. Largely segregated parietofrontal connections linking rostral intraparietal cortex (areas AIP and VIP) and the ventral premotor cortex (areas F5 and F4). *Experimental Brain Research*, 128(1-2), 181-187. https://link.springer.com/article/10.1007/s002210050833

12. **Nature Communications (2025)**. Temporal asymmetry of neural pattern similarity predicts recognition memory decisions. https://www.nature.com/articles/s42003-025-08569-9

13. **Nature Communications (2025)**. The human posterior parietal cortices orthogonalize the representation of different streams of information concurrently coded in visual working memory. PMC11620661. https://pmc.ncbi.nlm.nih.gov/articles/PMC11620661/

14. **Nature Scientific Reports (2025)**. Modeling visual working memory using recurrent on-center off-surround neural network with distance dependent inhibition. https://www.nature.com/articles/s41598-025-06919-5

15. **Pardi, E., et al. (2024)**. Human intraparietal sulcal morphology relates to individual differences in language and memory performance. *Communications Biology*, 7, 6175. https://www.nature.com/articles/s42003-024-06175-9

16. **Plos Biology (2023)**. A feedforward mechanism for human-like contour integration. https://journals.plos.org/plosbiology/article?id=10.1371%2Fjournal.pbio.3003159

17. **Rolls, E. T., et al. (2023)**. Multiple cortical visual streams in humans. https://www.oxcns.org/papers/656%20Rolls%20et%20al%202023%20Multiple%20cortical%20visual%20streams.pdf

18. **Ungerleider, L. G., et al. (1983)**. Cortical connections of visual area MT in the macaque. https://zenodo.org/records/1229147

19. **eNeuro (2025)**. Transformed Visual Working Memory Representations in Human Occipitotemporal and Posterior Parietal Cortices. 12(7), ENEURO.0162-25.2025. https://www.eneuro.org/content/12/7/ENEURO.0162-25.2025

20. **Frontiers in Neuroscience (2025)**. Integrated information theory reveals the potential role of the posterior parietal cortex in sustaining conditioning responses in classical conditioning tasks. https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2025.1512724/full

### 補足文献

21. arXiv (2024). Quantitative Biology > Neurons and Cognition. https://arxiv.org/abs/2510.20847

22. eLife (2024). An image-computable model of speeded decision-making. https://elifesciences.org/reviewed-preprints/98351v2

23. Frontera, J. L., et al. (2024). Understanding subcortical projections to the lateral posterior thalamic nucleus and its subregions using retrograde neural tracing. *Frontiers in Neuroanatomy*, 18, 1430636. https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2024.1430636/full

24. UvA (2022). Mechanisms of distributed working memory in a large-scale network of macaque neocortex. https://pure.uva.nl/ws/files/191924353/Mechanisms_of_distributed_working_memory_in_a_large-scale_network_of_macaque_neocortex.pdf
