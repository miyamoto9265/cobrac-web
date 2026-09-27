# ステップ3: Uniform Circuit（UC）の定義

## UCの定義基準

1. TLFの実現に必要な情報処理に関与している
2. 同質的な情報をコードしている神経組織である
3. メゾスコピックレベルとして適切な粒度
4. ROI内とROI外を区別する

## TLFの確認

**TLF: Mathematical knowledge - Range of general knowledge about mathematics, not the performance of mathematical operations or the solving of math problem**

このTLFは、数学的事実・概念の表象と検索を指し、計算の実行や問題解決は含まない。

## UC一覧表（Interface、Output Semantics付き）

| Circuit ID | Names | Comment | Interface | Output Semantics |
| ------ | -------- | -------- | -------- | ---------------- |
| `V1` | Primary Visual Cortex (V1) | 視覚情報の最初の皮質処理領域。数字や数式の視覚的特徴を抽出。（ROI外、入力のみ） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`V1`]網膜座標における輝度コントラスト、エッジ方向、空間周波数; |
| `V2` | Secondary Visual Cortex (V2) | 初期視覚処理の第2段階。色、形状、方向などの基本的な視覚特徴を処理。（ROI外、入力） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`V2`]色、形状、テクスチャなどの初期視覚特徴の統合表象; |
| `V3` | Visual Area V3 | 形状処理と運動検出。視覚情報の中間レベル処理。（ROI外、入力） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`V3`]形状の輪郭と運動の方向; |
| `V4` | Visual Area V4 | 色と形状の高次処理。物体認識の前段階。（ROI外、入力） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`V4`]物体の色と複雑な形状特徴の統合表象; |
| `pIPS` | Posterior Intraparietal Sulcus | IPSの後部領域（IPS0-2, hIP1を含む）。視覚的に提示された数字や数量の初期表象を形成。視空間情報と数量情報の統合。（ROI内） | ([`aIPS`], [`FG-math`], [`Pulvinar`], [`ACC`], [`Striatum`]) = `pIPS`([`V2`], [`V3`], [`V4`], [`FG-math`], [`aIPS`], [`dlPFC`], [`Pulvinar`], [`ACC`], [`Hippocampus`], [`Striatum`], [`Broca`]) | [`pIPS`]視覚的に提示された数量の大小関係と空間的配置。数字の視空間的表象; |
| `aIPS` | Anterior Intraparietal Sulcus | IPSの前部領域（IPS3-4, hIP2-3を含む）。抽象的な数量関係の表象と数学的推論。前頭前野との連携により、作業記憶内での数量操作を支援。（ROI内） | ([`pIPS`], [`AG`], [`LIPFC`], [`ACC`], [`Striatum`], [`PMC`]) = `aIPS`([`pIPS`], [`AG`], [`dlPFC`], [`ACC`], [`Hippocampus`], [`Striatum`], [`Broca`]) | [`aIPS`]抽象的な数量関係、数的順序性、数学的推論の中間結果。感覚モダリティから独立した数量表象; |
| `FG-math` | Fusiform Gyrus - Mathematical Area | 紡錘状回の数学的処理領域。数字形態の視覚的認識と数学的概念の意味的表象を保持。数学的内容に特異的に応答する。（ROI内） | ([`pIPS`], [`ITG-math`]) = `FG-math`([`V4`], [`pIPS`], [`ITG-math`], [`dlPFC`], [`Wernicke`]) | [`FG-math`]数字の形態認識、数学的記号の視覚的アイデンティティ、数字-意味の対応づけ; |
| `ITG-math` | Inferior Temporal Gyrus - Mathematical Area | 下側頭回の数学的処理領域。数学的概念の高次意味表象（例：「素数」「周期性」などの抽象概念）を保持。言語から独立した数学的知識の意味記憶。（ROI内） | ([`FG-math`], [`AG`], [`LIPFC`], [`PMC`]) = `ITG-math`([`V4`], [`FG-math`], [`AG`], [`dlPFC`], [`Wernicke`]) | [`ITG-math`]数学的概念の意味内容（例：素数性、周期性、対称性など）、数学的事実の意味表象、数学的カテゴリー; |
| `AG` | Angular Gyrus | 角回。算術的事実の検索と数学的記憶の想起を媒介。意味記憶システムの一部として、数学的知識の明示的検索を支援。（ROI外、出力） Comment: noROI(output) | （ROI外のためInterface記載なし） | [`AG`]検索された算術的事実（例：「7×8=56」）、数学的記憶の明示的想起; |
| `dlPFC` | Dorsolateral Prefrontal Cortex | 背外側前頭前野。作業記憶の保持と制御信号の送信。数学的知識の検索と操作を支援するトップダウン制御。（ROI外、入出力） Comment: noROI(input/output) | （ROI外のためInterface記載なし） | [`dlPFC`]トップダウン制御信号、注意の選択的配分、検索の制御信号; |
| `LIPFC` | Lateral Inferior Prefrontal Cortex | 外側下前頭前野。宣言的数学的事実の検索を支援。作業記憶への数学的情報の転送。（ROI外、出力） Comment: noROI(output) | （ROI外のためInterface記載なし） | （ROI外で出力のみのため記載なし） |
| `Pulvinar` | Pulvinar Nucleus of Thalamus | 視床枕核。視覚的注意の調節とIPSへの入力を制御。（ROI外、入力） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`Pulvinar`]視覚的注意の調節信号、サリエンスマップ; |
| `ACC` | Anterior Cingulate Cortex | 前帯状皮質。認知制御とタスク遂行の監視。数学的知識の検索における制御信号。（ROI外、入出力） Comment: noROI(input/output) | （ROI外のためInterface記載なし） | [`ACC`]認知制御信号、エラー検出、タスク切り替え信号; |
| `Hippocampus` | Hippocampus | 海馬。エピソード記憶と数学的事実の文脈情報を提供。学習時の記憶形成に関与。（ROI外、入力） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`Hippocampus`]エピソード記憶、文脈情報、学習時の記憶痕跡形成信号; |
| `Striatum` | Striatum | 線条体（基底核の一部）。報酬と学習に関連する信号を提供。数学的知識の獲得における強化学習。（ROI外、入出力） Comment: noROI(input/output) | （ROI外のためInterface記載なし） | [`Striatum`]報酬予測誤差、強化学習信号; |
| `Broca` | Broca's Area | Broca野。数学的ステートメントの構文解析（言語構造のみ、数学的内容ではない）。（ROI外、入力） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`Broca`]構文構造情報（数学的ステートメントの文法的解析）、量化子や論理演算子の構文処理; |
| `Wernicke` | Wernicke's Area | Wernicke野。言語的数学概念の処理。口頭で提示された数学的情報の理解。（ROI外、入力） Comment: noROI(input) | （ROI外のためInterface記載なし） | [`Wernicke`]言語的数学概念、口頭で提示された数学的情報の意味内容; |
| `PMC` | Premotor Cortex | 運動前野。数学的応答の運動計画（例：答えを発話する、書くための準備）。（ROI外、出力） Comment: noROI(output) | （ROI外のためInterface記載なし） | （ROI外で出力のみのため記載なし） |

## UCの採用理由と神経科学的根拠

### ROI内のUC

#### `pIPS` (Posterior Intraparietal Sulcus)
- **根拠**: IPS後部（IPS0-2, hIP1）は視覚野から直接入力を受け、視空間情報と数量情報を統合する（Konen & Kastner, 2008; Swisher et al., 2007）
- **機能**: 視覚的に提示された数字や数量の初期表象を形成
- **TLFとの関連**: 数学的知識の視覚的入力を処理し、数量的側面を抽出

#### `aIPS` (Anterior Intraparietal Sulcus)
- **根拠**: IPS前部（IPS3-4, hIP2-3）は前頭前野との強い接続を持ち、抽象的な数量関係を表象（Konen & Kastner, 2008; Boisgueheneuc et al., 2006）
- **機能**: 抽象的な数量関係の表象と数学的推論
- **TLFとの関連**: 数量的知識の高次表象を保持し、作業記憶と連携

#### `FG-math` (Fusiform Gyrus - Mathematical Area)
- **根拠**: 紡錘状回は数学的処理に特異的に応答し、数字形態領域（Number Form Area）を含む（Grotheer et al., 2016, 2018）。IPS-FG白質路によりIPSと直接接続（Takemura et al., 2020）
- **機能**: 数字の視覚的認識と数学的記号の意味的表象
- **TLFとの関連**: 数学的知識の視覚-意味統合を担う

#### `ITG-math` (Inferior Temporal Gyrus - Mathematical Area)
- **根拠**: 下側頭回は数学的内容に対して領域・難易度に関わらず応答し、数学的概念の意味表象を保持（Amalric & Dehaene, 2019）
- **機能**: 数学的概念の高次意味表象（抽象概念）
- **TLFとの関連**: 言語から独立した数学的知識の意味記憶の中核

### ROI外のUC（主要な入出力）

#### `AG` (Angular Gyrus) - 出力
- **根拠**: 角回は算術的事実の検索を特異的に媒介（Grabner et al., 2009）
- **機能**: 数学的記憶の明示的検索
- **TLFとの関連**: ROI内で表象された数学的知識を意識的に想起

#### `dlPFC` (Dorsolateral Prefrontal Cortex) - 入出力
- **根拠**: 背外側前頭前野はIPSと双方向接続し、作業記憶と認知制御を支援（Selemon & Goldman-Rakic, 1988）
- **機能**: トップダウン制御信号と作業記憶の保持
- **TLFとの関連**: 数学的知識の検索を制御し、検索された情報を作業記憶に保持

#### `LIPFC` (Lateral Inferior Prefrontal Cortex) - 出力
- **根拠**: 外側下前頭前野は宣言的数学的事実の検索に関与（Menon, 2016）
- **機能**: 作業記憶への数学的情報の転送
- **TLFとの関連**: 検索された数学的知識を作業記憶で利用可能にする

#### 視覚野（`V1`, `V2`, `V3`, `V4`） - 入力
- **根拠**: 視覚野は階層的に情報を処理し、ITG/FGへ投射（Felleman & Van Essen, 1991）
- **機能**: 数字、数式、幾何図形などの視覚的特徴抽出
- **TLFとの関連**: 数学的知識の視覚的入力を処理

#### その他の補助的UC
- `Pulvinar`: 視覚的注意の調節
- `ACC`: 認知制御
- `Hippocampus`: エピソード記憶と文脈
- `Striatum`: 強化学習
- `Broca`, `Wernicke`: 言語的入力の処理
- `PMC`: 運動出力の準備

## UCの粒度について

### メゾスコピックレベルの妥当性

1. **IPSの分割**: IPSは機能的・構造的に異質な前部と後部に分割することで、視覚的数量表象（pIPS）と抽象的数量表象（aIPS）を区別した。これは神経科学的証拠（Konen & Kastner, 2008）に基づく。

2. **ITG/FGの分割**: 腹側側頭皮質を紡錘状回の数学領域（FG-math）と下側頭回の数学領域（ITG-math）に分割した。FG-mathは視覚-意味統合、ITG-mathは高次概念表象という機能的分離に基づく。

3. **前頭前野の分割**: 前頭前野をdlPFCとLIPFCに分割し、作業記憶の制御と宣言的事実の検索という異なる機能を区別した。

## 機能関連項目（ROI内のUCのみ）

以下、ROI内のUniform Circuitについて、機能関連項目を定義する。

| Circuit ID | Requirement | Requirement realization by interface | Capability | Mechanism | Implementation |
| ---------- | ----------- | ------------------------------------ | ---------- | --------- | -------------- |
| `pIPS` | TLF「Mathematical knowledge」を実現するために、視覚的に提示された数学的情報（数字、数式）から、その**数量的側面を抽出**し、数量の大小関係や空間配置を表象する必要がある。入力:[U.V2][U.V3][U.V4]から視覚的特徴を受け取り、[U.FG-math]から数字の意味情報を受け取る。出力:[U.aIPS]へ数量表象を送り、[U.FG-math]へフィードバックを送る。トップダウン制御として[U.dlPFC][U.ACC]から注意・制御信号を受け取り、文脈情報として[U.Hippocampus]からエピソード記憶を、[U.Striatum]から報酬信号を、[U.Broca]から構文情報を受け取る。 | インターフェース([`aIPS`], [`FG-math`], [`Pulvinar`], [`ACC`], [`Striatum`]) = `pIPS`([`V2`], [`V3`], [`V4`], [`FG-math`], [`aIPS`], [`dlPFC`], [`Pulvinar`], [`ACC`], [`Hippocampus`], [`Striatum`], [`Broca`])により実現される。視覚野[U.V2][U.V3][U.V4]からの視覚特徴と[U.FG-math]からの数字形態情報を統合し、数量表象を形成して[U.aIPS]へ出力する。[U.dlPFC]と[U.ACC]からの制御信号により、注意が選択的に配分される。 | 視覚的に提示された刺激集合から、その**数量（numerosity）を抽出**する能力。視空間的な配置情報を保持しながら、数量の大小関係を符号化する。この能力はWeber-Fechner法則に従う近似数量システム（Approximate Number System, ANS）として実装される（Dehaene, 2011）。単一ニューロンレベルでは、特定の数量に対して選好を示す「数量チューニング曲線」が観察される（Nieder & Miller, 2004; Harvey et al., 2013）。 | 数量チューニングを持つニューロン集団による符号化。視覚入力から位置マップを構築し、合算クラスタ（summation cluster）で単調なチューニングを形成した後、中央興奮と側方抑制により単峰性の数量チューニングを持つニューロンを生成する（Dehaene & Changeux, 1993）。数量が増加するにつれてチューニング曲線の幅が広がり、これがWeber-Fechner法則として観察される行動特性を説明する（Piazza et al., 2004）。 | [U.pIPS] = Σ(Gaussian([U.V2], [U.V3], [U.V4]) * w_visual) + [U.FG-math] * w_semantic - Lateral_inhibition([U.pIPS_neighbors]) + [U.dlPFC] * w_attention + [U.ACC] * w_control |
| `aIPS` | TLFを実現するために、`pIPS`で形成された視覚的数量表象を、**感覚モダリティから独立した抽象的な数量関係**へと変換する必要がある。入力:[U.pIPS]から視覚的数量表象を、[U.AG]から検索された算術的事実を受け取る。出力:[U.pIPS]へフィードバックを、[U.AG]へ数量情報を、[U.LIPFC]へ作業記憶転送を、[U.PMC]へ運動計画を出力する。制御信号として[U.dlPFC][U.ACC]から、文脈として[U.Hippocampus][U.Striatum]から、構文情報として[U.Broca]から入力を受ける。 | インターフェース([`pIPS`], [`AG`], [`LIPFC`], [`ACC`], [`Striatum`], [`PMC`]) = `aIPS`([`pIPS`], [`AG`], [`dlPFC`], [`ACC`], [`Hippocampus`], [`Striatum`], [`Broca`])により実現される。[U.pIPS]からの視覚的数量表象を抽象化し、[U.AG]との相互作用により算術的知識と統合する。[U.dlPFC]からの作業記憶制御により、数量操作が支援される。 | 視覚的・聴覚的・触覚的などの感覚モダリティから独立した**抽象的数量表象**を形成し、数の順序性、大小関係、数学的推論を支援する能力。この能力は「mental number line」として概念化され、空間的な数の表象（SNARC効果）として行動レベルでも観察される（Dehaene et al., 1993）。数量の比較、加算・減算の概念的理解など、算術の基礎となる数量関係を表象する（Arsalidou & Taylor, 2011）。 | 数量の抽象的符号化は、視覚的表象から感覚的詳細を除去し、数量そのものを符号化するニューロン集団により実現される。前頭前野からのトップダウン信号により、作業記憶内で数量が保持・操作される。数量の順序性は、前頭頭頂ネットワークでの相対的数量符号化（relative magnitude coding）により実現される（Harvey et al., 2024）。 | [U.aIPS] = Abstract([U.pIPS]) + [U.AG] * w_fact + [U.dlPFC] * w_WM + [U.Hippocampus] * w_context, ここで Abstract(x) は感覚的詳細を除去する写像 |
| `FG-math` | TLFを実現するために、視覚的に提示された**数字や数学的記号の形態を認識**し、それを意味的表象に結びつける必要がある。入力:[U.V4]から高次視覚特徴を、[U.pIPS]から数量情報を、[U.ITG-math]から概念情報を受け取る。出力:[U.pIPS]へ数字-意味対応を、[U.ITG-math]へ視覚的アイデンティティを出力する。制御として[U.dlPFC]から注意制御を、[U.Wernicke]から言語的数学情報を受け取る。 | インターフェース([`pIPS`], [`ITG-math`]) = `FG-math`([`V4`], [`pIPS`], [`ITG-math`], [`dlPFC`], [`Wernicke`])により実現される。[U.V4]からの視覚特徴を数字形態として認識し、[U.pIPS]の数量表象および[U.ITG-math]の概念表象と統合する。 | 視覚的に提示された数字（アラビア数字、ローマ数字など）および数学的記号（+、−、=、∫など）の**形態を認識**し、それを対応する意味表象に結びつける能力。これは視覚単語形態領域（VWFA）の数字版として機能する「数字形態領域（Number Form Area）」として特徴づけられる（Grotheer et al., 2016, 2018）。数学的処理への選好は、単なる数字の視覚的認識よりも優先される（Grotheer et al., 2018）。 | 視覚的特徴（線分の配置、曲線など）から数字の視覚的アイデンティティを抽出し、それを腹側側頭皮質内の意味表象と結びつける。階層的視覚処理の最終段階として、物体認識の一般的メカニズム（受容野の統合、不変性の獲得）を数字・記号に適用する。 | [U.FG-math] = Visual_identity([U.V4]) + Semantic_link([U.ITG-math]) + Quantity_link([U.pIPS]) + [U.dlPFC] * w_attention |
| `ITG-math` | TLFを実現するために、数学的概念の**高次意味表象**を保持し、言語から独立した数学的知識の意味記憶を形成する必要がある。例えば「素数」「周期性」「対称性」といった抽象的な数学的カテゴリーや概念を表象する。入力:[U.V4]から視覚特徴を、[U.FG-math]から数字形態を、[U.AG]から検索された事実を、[U.dlPFC]から制御信号を、[U.Wernicke]から言語的概念を受け取る。出力:[U.FG-math]へフィードバックを、[U.AG]へ概念表象を、[U.LIPFC]へ作業記憶転送を、[U.PMC]へ運動計画を出力する。 | インターフェース([`FG-math`], [`AG`], [`LIPFC`], [`PMC`]) = `ITG-math`([`V4`], [`FG-math`], [`AG`], [`dlPFC`], [`Wernicke`])により実現される。[U.FG-math]からの視覚-意味統合情報を受け取り、抽象的な数学的概念を形成する。[U.AG]との相互作用により、概念と事実が統合される。 | 数学的概念の**意味的カテゴリー化**と抽象表象の保持。数学的ドメイン（算術、代数、幾何、解析など）や数学的性質（素数性、周期性、対称性、連続性など）を符号化する。この表象は言語から独立しており、数学的反省時に言語野をスキップして活性化する（Amalric & Dehaene, 2016, 2018）。意味的距離に基づいて組織化され、類似した概念が近接して表象される（Amalric & Dehaene, 2018）。 | 腹側側頭皮質の一般的な意味記憶メカニズムを数学的概念に適用。階層的カテゴリー構造を形成し、抽象度の異なるレベル（具体的な数字→数学的性質→数学的ドメイン）で概念を組織化する。意味的類似度に基づく神経表象の組織化により、関連概念間での般化が可能になる。 | [U.ITG-math] = Semantic_encode([U.FG-math], [U.V4]) + [U.AG] * w_retrieved_fact + Conceptual_hierarchy([U.ITG-math]) + [U.dlPFC] * w_control |

## 参考文献

1. Amalric, M., & Dehaene, S. (2019). A distinct cortical network for mathematical knowledge in the human brain. NeuroImage, 189, 19-31.
2. Amalric, M., & Dehaene, S. (2018). Cortical circuits for mathematical knowledge: evidence for a major subdivision within the brain's semantic networks. Philosophical Transactions of the Royal Society B, 373(1740), 20160515.
3. Amalric, M., & Dehaene, S. (2016). Origins of the brain networks for advanced mathematics in expert mathematicians. Proceedings of the National Academy of Sciences, 113(18), 4909-4917.
4. Grotheer, M., Zhen, Z., Lerma-Usabiaga, G., & Grill-Spector, K. (2018). Separate lanes for adding and reading in the white matter highways of the human brain. bioRxiv, 427435.
5. Grotheer, M., Ambrus, G. G., & Kovács, G. (2016). Causal evidence of the involvement of the number form area in the visual detection of numbers and letters. NeuroImage, 132, 314-319.
6. Konen, C. S., & Kastner, S. (2008). Two hierarchically organized neural systems for object information in human visual cortex. Nature neuroscience, 11(2), 224-231.
7. Takemura, H., Kruper, J., Miyata, T., & Rokem, A. (2020). Identification of a distinct association fiber tract "IPS-FG" to connect the intraparietal sulcus areas and fusiform gyrus by white matter dissection and tractography. Scientific Reports, 10(1), 15402.
8. Grabner, R. H., Ansari, D., Koschutnig, K., Reishofer, G., Ebner, F., & Neuper, C. (2009). To retrieve or to calculate? Left angular gyrus mediates the retrieval of arithmetic facts during problem solving. Neuropsychologia, 47(2), 604-608.
9. Selemon, L. D., & Goldman-Rakic, P. S. (1988). Common cortical and subcortical targets of the dorsolateral prefrontal and posterior parietal cortices in the rhesus monkey: evidence for a distributed neural network subserving spatially guided behavior. Journal of Neuroscience, 8(11), 4049-4068.
10. Menon, V. (2016). Memory and cognitive control circuits in mathematical cognition and learning. Progress in brain research, 227, 159-186.
11. Felleman, D. J., & Van Essen, D. C. (1991). Distributed hierarchical processing in the primate cerebral cortex. Cerebral cortex, 1(1), 1-47.
12. Dehaene, S. (2011). The number sense: How the mind creates mathematics. Oxford University Press.
13. Nieder, A., & Miller, E. K. (2004). A parieto-frontal network for visual numerical information in the monkey. Proceedings of the National Academy of Sciences, 101(19), 7457-7462.
14. Harvey, B. M., Klein, B. P., Petridou, N., & Dumoulin, S. O. (2013). Topographic representation of numerosity in the human parietal cortex. Science, 341(6150), 1123-1126.
15. Dehaene, S., & Changeux, J. P. (1993). Development of elementary numerical abilities: A neuronal model. Journal of cognitive neuroscience, 5(4), 390-407.
16. Piazza, M., Izard, V., Pinel, P., Le Bihan, D., & Dehaene, S. (2004). Tuning curves for approximate numerosity in the human intraparietal sulcus. Neuron, 44(3), 547-555.
17. Arsalidou, M., & Taylor, M. J. (2011). Is 2+ 2= 4? Meta-analyses of brain areas needed for numbers and calculations. Neuroimage, 54(3), 2382-2393.
18. Harvey, B. M., Fracasso, A., Dagnino, B., & Dumoulin, S. O. (2024). Hierarchical representations of relative numerical magnitudes in the human frontoparietal cortex. Nature Communications, 15(1), 1-15.
