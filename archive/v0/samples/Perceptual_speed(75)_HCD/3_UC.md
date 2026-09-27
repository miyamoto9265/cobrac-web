# ステップ3: Uniform Circuit（UC）の定義

## UCの採用基準
1. TLF（知覚速度）の実現に必要な情報処理に関与している
2. 同質的な情報をコードしている神経組織である
3. メゾスコピックレベルとして適切な粒度（大きすぎず、小さすぎない）
4. ROI内とROI外を区別する

## 定義されたUniform Circuit

| Circuit ID | Names | Comment |
|------------|-------|---------|
| `pIPS` | Posterior Intraparietal Sulcus (後部頭頂間溝) | 初期視覚特徴の空間マップを保持し、視覚探索の最初の段階で視野全体の視覚情報を統合する。V1-V3からの網膜位置対応的投射を受け、視覚刺激の位置と基本特徴（方位、空間周波数）を表現。視覚探索における低次特徴の比較を実行。IPS1-2を含む。 |
| `mIPS` | Middle Intraparietal Sulcus (中部頭頂間溝) | 視覚特徴の統合と注意の配分を担当。後部IPSからの情報を受け取り、特徴ベースの注意と空間ベースの注意を統合。探索目標（テンプレート）と現在の視覚情報を比較し、ターゲット候補を選択。IPS3を含む。 |
| `aIPS` | Anterior Intraparietal Sulcus (前部頭頂間溝) | 探索結果の統合と意思決定への橋渡し。ターゲット検出の確信度を計算し、探索の終了判定に関与。前頭皮質との強い接続を持ち、検出結果を運動応答や意思決定に変換。IPS4を含む。 |
| `V1` | Primary Visual Cortex (一次視覚野) | 網膜からの視覚情報を最初に処理し、方位、空間周波数、色などの基本特徴を抽出。網膜位置対応的に組織化。**noROI(input)** |
| `V2` | Visual Area 2 (視覚野2) | V1からの情報を受け取り、より複雑な視覚特徴（輪郭、テクスチャ）を処理。**noROI(input)** |
| `V3` | Visual Area 3 (視覚野3) | 動的形態と大域的運動の処理。背側視覚経路の初期段階。**noROI(input)** |
| `V4` | Visual Area 4 (視覚野4) | 色と形態の統合処理。物体の特徴を表現し、注意による変調を受ける。腹側と背側経路の統合ハブ。**noROI(input)** |
| `MT` | Middle Temporal Area (中側頭野、V5) | 視覚運動情報の処理。運動方向と速度を選択的にコード。背側視覚経路の重要なノード。**noROI(input)** |
| `FEF` | Frontal Eye Field (前頭眼野) | 注意のトップダウン制御と眼球運動の制御。探索目標の仕様を送信し、IPSからの注意優先マップを受け取る。視覚探索における注意シフトを指令。**noROI(input)およびnoROI(output)** |
| `DLPFC` | Dorsolateral Prefrontal Cortex (背外側前頭前皮質) | ワーキングメモリの維持と実行制御。探索目標（ターゲットテンプレート）、タスクルール、意思決定基準を保持し、IPSに送信。IPSからの感覚情報を受け取り、判断を統合。**noROI(input)およびnoROI(output)** |
| `Pulvinar` | Pulvinar Nucleus (視床枕) | 視覚情報の皮質下リレー。上丘からの視覚情報をIPSに中継。注意の調節に関与。**noROI(input)** |
| `IT` | Inferior Temporal Cortex (下側頭皮質) | 物体認識と形態情報の高次表現。探索対象の視覚的特徴（文字、数字、パターンなど）の表現をIPSに提供。**noROI(input)** |
| `SC` | Superior Colliculus (上丘) | サッカード眼球運動の制御。IPSからの注意優先マップに基づいて眼球運動を実行。**noROI(output)** |
| `PMC` | Premotor Cortex (運動前野) | 視覚誘導行動の準備。IPSからの視覚-運動変換信号を受け取り、手や身体の運動を準備。**noROI(output)** |

## UCの命名規則
- スペースを使用せず、Kebab caseまたは広く認識されている略称を使用
- マークダウン内でUC名を記述する際は、必ずバッククォート（`）で囲む
- 例: `pIPS`, `FEF`, `DLPFC`

## ROI内UCとROI外UCの区別

### ROI内UC（3つ）
1. `pIPS`: 後部頭頂間溝
2. `mIPS`: 中部頭頂間溝
3. `aIPS`: 前部頭頂間溝

### ROI外UC - Input（9つ）
1. `V1`: 一次視覚野
2. `V2`: 視覚野2
3. `V3`: 視覚野3
4. `V4`: 視覚野4
5. `MT`: 中側頭野
6. `FEF`: 前頭眼野（入出力両方）
7. `DLPFC`: 背外側前頭前皮質（入出力両方）
8. `Pulvinar`: 視床枕
9. `IT`: 下側頭皮質

### ROI外UC - Output（4つ）
1. `FEF`: 前頭眼野（入出力両方）
2. `DLPFC`: 背外側前頭前皮質（入出力両方）
3. `SC`: 上丘
4. `PMC`: 運動前野

## UCの粒度の妥当性

### 粒度の選択理由
1. **IPS内の分割**: IPSを後部・中部・前部に分割することで、視覚特徴処理→注意統合→意思決定という機能的階層を適切に表現。各部分は解剖学的にも機能的にも区別可能（IPS1-2, IPS3, IPS4）。

2. **視覚野の分割**: V1, V2, V3, V4, MTという標準的な視覚野区分を採用。各領域は異なる視覚特徴（基本特徴、輪郭、運動、色・形態）を処理し、同質的情報をコード。

3. **前頭皮質の分割**: FEFとDLPFCを分離。FEFは注意制御と眼球運動、DLPFCはワーキングメモリと実行制御という異なる機能を担当。

4. **皮質下構造**: PulvinarとSCを個別のUCとして定義。それぞれ視覚情報リレーとサッカード実行という明確な機能を持つ。

## TLFとUCの対応関係

TLF「知覚速度」を実現するための情報処理フロー:
1. 視覚刺激の特徴抽出（`V1`, `V2`, `V3`, `V4`, `MT`）
2. 視覚特徴の空間マップ作成（`pIPS`）
3. 探索目標との比較と注意配分（`mIPS`、`FEF`, `DLPFC`からの制御）
4. ターゲット検出と確信度計算（`aIPS`）
5. 意思決定と運動応答（`DLPFC`, `SC`, `PMC`）

各UCは知覚速度の異なる側面（特徴抽出の速度、探索の効率性、比較の速度、検出判断の速度）に寄与します。

---

## ステップ4-2: Interface の追加

各UC（ROI内のみ）のInterfaceを以下に定義します。形式は [Output1, Output2, ...] = UC名(Input1, Input2, ...) です。

| Circuit ID | Names | Comment | Interface |
|------------|-------|---------|-----------|
| `pIPS` | Posterior Intraparietal Sulcus | 初期視覚特徴の空間マップを保持し、視覚探索の最初の段階で視野全体の視覚情報を統合する。 | ([`mIPS`], [`V1`], [`V2`], [`V3`], [`V4`], [`MT`], [`FEF`]) = `pIPS`([`V1`], [`V2`], [`V3`], [`V4`], [`MT`], [`IT`], [`Pulvinar`], [`FEF`], [`DLPFC`]) |
| `mIPS` | Middle Intraparietal Sulcus | 視覚特徴の統合と注意の配分を担当。 | ([`aIPS`], [`FEF`]) = `mIPS`([`pIPS`], [`FEF`], [`DLPFC`]) |
| `aIPS` | Anterior Intraparietal Sulcus | 探索結果の統合と意思決定への橋渡し。 | ([`pIPS`], [`mIPS`], [`FEF`], [`DLPFC`], [`SC`], [`PMC`]) = `aIPS`([`mIPS`], [`FEF`], [`DLPFC`]) |
| `V1` | Primary Visual Cortex | 網膜からの視覚情報を最初に処理。**noROI(input)** | |
| `V2` | Visual Area 2 | V1からの情報を受け取り、より複雑な視覚特徴を処理。**noROI(input)** | |
| `V3` | Visual Area 3 | 動的形態と大域的運動の処理。**noROI(input)** | |
| `V4` | Visual Area 4 | 色と形態の統合処理。**noROI(input)** | |
| `MT` | Middle Temporal Area | 視覚運動情報の処理。**noROI(input)** | |
| `FEF` | Frontal Eye Field | 注意のトップダウン制御と眼球運動の制御。**noROI(input)およびnoROI(output)** | |
| `DLPFC` | Dorsolateral Prefrontal Cortex | ワーキングメモリの維持と実行制御。**noROI(input)およびnoROI(output)** | |
| `Pulvinar` | Pulvinar Nucleus | 視覚情報の皮質下リレー。**noROI(input)** | |
| `IT` | Inferior Temporal Cortex | 物体認識と形態情報の高次表現。**noROI(input)** | |
| `SC` | Superior Colliculus | サッカード眼球運動の制御。**noROI(output)** | |
| `PMC` | Premotor Cortex | 視覚誘導行動の準備。**noROI(output)** | |

---

## ステップ5: Output Semantics の追加

各UCが出力する情報の意味を以下に定義します。

| Circuit ID | Names | Comment | Interface | Output Semantics |
|------------|-------|---------|-----------|------------------|
| `pIPS` | Posterior Intraparietal Sulcus | 初期視覚特徴の空間マップを保持 | (省略) | [`pIPS`]視野全体にわたる視覚特徴の空間的優先度マップ（Spatial priority map）。各空間位置における視覚顕著性（bottom-up saliency）とタスク関連性（top-down relevance）を統合した行動的優先度を表現。視覚刺激の位置、方位、色、形態、運動などの基本特徴を網膜位置対応的に保持し、探索目標との初期的な一致度を空間マップとしてコード。; |
| `mIPS` | Middle Intraparietal Sulcus | 視覚特徴の統合と注意の配分 | (省略) | [`mIPS`]注意によって選択された視覚ターゲット候補の表現。視覚探索における複数のターゲット候補の重み付け表現と、気を散らすもの（distractors）の抑制信号。ターゲット集合サイズと気を散らすもの集合サイズに応じた適応的な注意配分パターン。行動的に関連する項目を短期記憶にアクセスさせるための優先度重み付け信号。視覚空間注意の動的な配分状態。; |
| `aIPS` | Anterior Intraparietal Sulcus | 探索結果の統合と意思決定への橋渡し | (省略) | [`aIPS`]ターゲット検出に関する意思決定の確信度（Decision confidence）。視覚弁別判断の主観的確実性を表現する神経集団コード。ターゲットが存在するか否かの二値判断と、その判断の信頼性を同時に表現。運動実行（サッカード、手指応答）への変換準備信号。探索の終了判定に必要な証拠の蓄積状態。確信度は刺激提示後約300msから出現し、運動応答まで持続する。; |
| `V1` | Primary Visual Cortex | 網膜からの視覚情報を最初に処理。**noROI(input)** | | [`V1`]網膜位置対応的な視覚特徴マップ。方位、空間周波数、色（単純型と複雑型色対比応答）、輝度コントラストなどの基本的な視覚特徴を局所的に抽出。; |
| `V2` | Visual Area 2 | V1からの情報を受け取り、より複雑な視覚特徴を処理。**noROI(input)** | | [`V2`]輪郭、テクスチャ、立体視差などのより複雑な視覚特徴。図と地の分離における境界表現。; |
| `V3` | Visual Area 3 | 動的形態と大域的運動の処理。**noROI(input)** | | [`V3`]大域的運動パターン（グローバルモーション）と動的形態の表現。; |
| `V4` | Visual Area 4 | 色と形態の統合処理。**noROI(input)** | | [`V4`]色恒常性と形態の統合表現。物体の色と形態の組み合わせ特徴。注意による変調を受けた視覚特徴。; |
| `MT` | Middle Temporal Area | 視覚運動情報の処理。**noROI(input)** | | [`MT`]視覚運動の方向と速度の選択的表現。オプティカルフローパターン。; |
| `FEF` | Frontal Eye Field | 注意のトップダウン制御と眼球運動の制御。**noROI(input)およびnoROI(output)** | | [`FEF`]注意制御信号（探索すべき空間位置・特徴の指定）、サッカード運動指令、探索戦略の制御信号。視覚空間における注意シフトの目標位置。; |
| `DLPFC` | Dorsolateral Prefrontal Cortex | ワーキングメモリの維持と実行制御。**noROI(input)およびnoROI(output)** | | [`DLPFC`]探索目標テンプレート（ターゲットの視覚的特徴の表現）、タスクルール、意思決定基準（検出閾値）、ワーキングメモリ内容、実行制御信号。; |
| `Pulvinar` | Pulvinar Nucleus | 視覚情報の皮質下リレー。**noROI(input)** | | [`Pulvinar`]上丘を経由した視覚情報の高速リレー。注意調節信号。視覚顕著性情報の皮質下経路。; |
| `IT` | Inferior Temporal Cortex | 物体認識と形態情報の高次表現。**noROI(input)** | | [`IT`]物体カテゴリと形態の高次表現。文字、数字、複雑パターンなどの視覚刺激の同一性表現。視覚不変性を持つ物体表現。; |
| `SC` | Superior Colliculus | サッカード眼球運動の制御。**noROI(output)** | | |
| `PMC` | Premotor Cortex | 視覚誘導行動の準備。**noROI(output)** | | |

---

## ステップ6: 機能関連項目の定義

ROI内の各Uniform Circuitについて、以下の5項目を定義します。

### `pIPS` (Posterior Intraparietal Sulcus)

#### 1. Requirement
[U.pIPS]は、知覚速度を実現するために、広範な視野にわたる視覚刺激の空間的優先度マップを構築する必要がある。入力として、[U.V1]（[V1]網膜位置対応的な視覚特徴マップ；方位、空間周波数、色、輝度コントラスト）、[U.V2]（[V2]輪郭、テクスチャ、立体視差などのより複雑な視覚特徴）、[U.V3]（[V3]大域的運動パターンと動的形態の表現）、[U.V4]（[V4]色恒常性と形態の統合表現、物体の色と形態の組み合わせ特徴）、[U.MT]（[MT]視覚運動の方向と速度の選択的表現、オプティカルフローパターン）、[U.IT]（[IT]物体カテゴリと形態の高次表現、文字・数字・複雑パターンなどの視覚刺激の同一性表現）、[U.Pulvinar]（[Pulvinar]上丘を経由した視覚情報の高速リレー、注意調節信号、視覚顕著性情報の皮質下経路）、[U.FEF]（[FEF]注意制御信号として探索すべき空間位置・特徴の指定）、[U.DLPFC]（[DLPFC]探索目標テンプレート、タスクルール）を受け取る。これらを統合し、各空間位置における視覚顕著性（bottom-up saliency）とタスク関連性（top-down relevance）を結合した行動的優先度を計算し、視野全体の空間的優先度マップとして[U.mIPS]、[U.V1]、[U.V2]、[U.V3]、[U.V4]、[U.MT]、[U.FEF]に出力する。この変換により、視覚探索における最初の段階として、視野のどの領域を優先的に処理すべきかを決定し、知覚速度の効率性を高める。

#### 2. Requirement realization by interface
[U.pIPS]のInterfaceは、([U.mIPS], [U.V1], [U.V2], [U.V3], [U.V4], [U.MT], [U.FEF]) = [U.pIPS]([U.V1], [U.V2], [U.V3], [U.V4], [U.MT], [U.IT], [U.Pulvinar], [U.FEF], [U.DLPFC])と定義されている。Requirementで記述された機能は、このInterfaceによって以下のように実現される：初期視覚野（[U.V1], [U.V2], [U.V3], [U.V4], [U.MT]）からのbottom-up視覚特徴情報、[U.IT]からの物体同一性情報、[U.Pulvinar]からの皮質下高速視覚情報が入力として統合される。同時に、[U.FEF]からのtop-down注意制御信号と[U.DLPFC]からの探索目標テンプレートが入力され、タスク関連性を調節する。これらを統合した空間的優先度マップが[U.mIPS]に送られ、さらに視覚野（[U.V1]-[U.MT]）への逆投射により注意による感度変調が実現され、[U.FEF]へのフィードバックにより注意シフトの候補位置が伝達される。このInterfaceは、Requirementで要求されるbottom-upとtop-downの統合、および下流UCへの優先度情報伝達を完全に支援する。

#### 3. Capability
Bottom-up刺激駆動情報とtop-down目標駆動情報を統合し、行動的優先度を表現する空間マップを構築する能力。この能力は、複数の異なる情報源（初期視覚特徴、物体表現、注意制御信号、探索目標）を共通の空間座標系に変換し、各空間位置に単一の優先度値を割り当てる計算を含む。Priority mapの計算は、視覚顕著性（saliency）の自動的抽出と、タスクゴールによる重み付けの乗算的または加算的統合によって実現される。このメカニズムは、Itti & Koch (2001)のSaliency mapモデル、Bisley & Goldberg (2010)のPriority map理論、Wolfe (2021)のGuided Search 6.0モデルで理論化されている。神経科学的には、LIPニューロンが視覚信号、サッカード信号、認知信号を加算的に統合することが単一ニューロンレベルで実証されている（Thomas & Paré, 2007）。Priority mapは特徴非依存的であり、様々な視覚刺激（文字、数字、パターン）に対して汎用的に機能する。

#### 4. Mechanism
Priority mapの構築は、以下の計算ステップで実現される。まず、各視覚特徴チャネル（方位、色、運動など）において局所的な顕著性が計算される。これは、center-surround差分フィルタによる局所コントラスト検出として実装される。各特徴チャネルの顕著性マップは正規化され、特徴次元を超えて統合される（Winner-take-allまたは加重和）。これがbottom-up saliency mapを形成する。並行して、top-down信号（[U.FEF]と[U.DLPFC]から）が探索目標に一致する特徴を持つ空間位置の重みを増強する。これは、目標テンプレートと視覚特徴の類似度計算（例：テンプレートマッチング、特徴空間での距離計算）として実装される。Bottom-up saliency mapとtop-down relevance mapは乗算的または加算的に統合され、最終的なpriority mapを形成する。Priority mapの各位置の活動は、その位置への注意配分とサッカード実行の確率に比例する。Surround suppressionメカニズムにより、priority mapは空間的に鋭敏化され、最も優先度の高い位置が強調される。Priority mapは動的に更新され、探索の進行とともに既に訪問した位置の優先度は低下する（inhibition of return）。

#### 5. Implementation
- Bottom-up saliency: S_bu(x,y) = Σ_i w_i * N(F_i(x,y))
  - F_i(x,y): 特徴チャネルiにおける位置(x,y)の顕著性、N(): 正規化関数、w_i: チャネル重み
- Top-down relevance: S_td(x,y) = sim(V(x,y), T)
  - V(x,y): 位置(x,y)の視覚特徴ベクトル（[U.V1]-[U.MT]から）、T: 探索目標テンプレート（[U.DLPFC]から）、sim(): 類似度関数
- Priority map: P(x,y) = α * S_bu(x,y) + β * S_td(x,y) + γ * A(x,y)
  - A(x,y): [U.FEF]からの注意制御信号、α, β, γ: 統合重み
- Surround suppression: P'(x,y) = P(x,y) - k * ∫∫ G(x-x', y-y') * P(x',y') dx'dy'
  - G(): ガウシアンカーネル、k: 抑制強度
- [U.pIPS] = P'(x,y)

---

### `mIPS` (Middle Intraparietal Sulcus)

#### 1. Requirement
[U.mIPS]は、知覚速度を実現するために、視野内の複数の視覚刺激の中からターゲット候補を選択し、気を散らすもの（distractors）を抑制する必要がある。入力として、[U.pIPS]（[pIPS]視野全体にわたる視覚特徴の空間的優先度マップ）、[U.FEF]（[FEF]注意配分の制御信号、探索戦略の調整）、[U.DLPFC]（[DLPFC]ワーキングメモリ内容と実行制御、探索中の情報維持）を受け取る。[U.pIPS]からの優先度マップに基づき、複数のターゲット候補に対して注意資源を適応的に配分し、同時にdistractorsからの干渉を抑制する。ターゲット集合サイズとdistractor集合サイズに応じて、注意配分パターンを動的に調整する。選択された候補とその重み付け情報を[U.aIPS]と[U.FEF]に出力する。この変換により、視覚探索における中間段階として、候補の絞り込みと注意の集中を実現し、知覚速度における「比較の効率性」を高める。

#### 2. Requirement realization by interface
[U.mIPS]のInterfaceは、([U.aIPS], [U.FEF]) = [U.mIPS]([U.pIPS], [U.FEF], [U.DLPFC])と定義されている。Requirementで記述された機能は、このInterfaceによって以下のように実現される：[U.pIPS]からの空間的優先度マップが入力され、どの空間位置が行動的に重要かの初期情報が提供される。[U.FEF]からの注意配分制御信号と[U.DLPFC]からのワーキングメモリ内容（探索目標の詳細、タスクルール）が入力され、ターゲット候補の選択基準が調節される。[U.mIPS]は、これらの入力を統合してターゲット候補を選択し、その情報を[U.aIPS]に送ることで検出判断の準備を整える。同時に、選択結果と注意の必要性を[U.FEF]にフィードバックすることで、注意シフトの制御ループを形成する。このInterfaceは、Requirementで要求される優先度マップからの候補選択、top-downによる調節、および下流への選択情報伝達を完全に支援する。

#### 3. Capability
複数の視覚刺激の中から行動関連項目（ターゲット候補）を選択し、行動非関連項目（distractors）を抑制する選択的注意の能力。この能力は、視覚短期記憶へのアクセス権を制御し、ターゲット集合サイズとdistractor集合サイズに応じて注意資源を適応的に配分する計算を含む。Guided Search 6.0モデル（Wolfe, 2021）では、priority mapの高活動位置から順次項目が処理され、各項目は拡散ベースの認識プロセス（>150ms/item）を経る。VS-SAIMモデル（Heinke & Humphreys, 2003）では、選択段階と物体同定段階の並列競合プロセスが注意選択を実現する。神経科学的には、mIPSは視覚空間注意をコードし（Ptak & Schnider, 2011）、ターゲット集合サイズに対して漸近的活動増加を示し、distractorが存在すると抑制効果が現れることが実証されている（Gillebert et al., 2012）。Feature attentionは探索速度と正確性のバランスを制御するメカニズムとして機能する（Vater et al., 2023）。

#### 4. Mechanism
選択的注意は、以下の計算メカニズムで実現される。[U.pIPS]からのpriority mapにおいて、活動がピークに達する位置から順次、注意スポットライトが配置される。各注意スポットライトの範囲内で、視覚特徴が[U.DLPFC]からの目標テンプレートと比較される（template matching）。一致度が閾値を超える項目はターゲット候補として選択され、その重みが増強される。Distractorに対しては、V4で観察されるような"pop-in"メカニズム（初期増強後の持続的抑制）が適用される。複数ターゲットが存在する場合、注意資源は各候補に分割配分される。Distractor集合サイズが大きい場合、抑制プロセスが強化される。知識ベースのon-centre-off-surround受容野メカニズムにより、選択された項目の周辺のdistractorsが自動的に抑制される（VS-SAIMモデル）。Feature attentionの強度は、探索時間コストとエラーコストを最小化するように動的に調整される。選択プロセスは並列競合として実装され、複数候補間で相互抑制が働き、最も強い候補が勝者となる（Winner-take-all機構）。

#### 5. Implementation
- Attention spotlight placement: A(x,y,t) = Θ(P(x,y,t) - θ_att)
  - P(x,y,t): [U.pIPS]からの時刻tでのpriority map、Θ: ステップ関数、θ_att: 注意閾値
- Template matching: M_i = sim(V_i, T)
  - V_i: 位置iの視覚特徴、T: [U.DLPFC]からの目標テンプレート、sim(): 類似度
- Target selection: S_i = M_i * A_i - Σ_{j≠i} w_ij * S_j
  - w_ij: 競合的相互抑制重み
- Distractor suppression: D_i(t) = max(0, I_i(t) - k * (I_i(t-Δt) + Σ_j w_ij * S_j))
  - I_i: 項目iの初期活動、k: 抑制係数
- Feature attention modulation: F = arg min (C_time * RT + C_error * ER)
  - F: feature attention強度、RT: 反応時間、ER: エラー率、C_time, C_error: コスト重み
- [U.mIPS] = {S_i | S_i > θ_sel}、θ_sel: 選択閾値

---

### `aIPS` (Anterior Intraparietal Sulcus)

#### 1. Requirement
[U.aIPS]は、知覚速度を実現するために、視覚探索の最終段階として、ターゲットが検出されたか否かの判断とその判断の確信度を計算する必要がある。入力として、[U.mIPS]（[mIPS]注意によって選択された視覚ターゲット候補の表現、重み付け表現、distractorsの抑制信号）、[U.FEF]（[FEF]探索終了と応答開始の制御信号）、[U.DLPFC]（[DLPFC]意思決定基準と応答ルール、検出判断の閾値制御）を受け取る。[U.mIPS]から送られるターゲット候補の証拠を時間的に蓄積し、判断基準（[U.DLPFC]から）と比較することで、ターゲット検出の有無を決定する。同時に、蓄積された証拠の強度と蓄積時間に基づいて、その判断の確信度を計算する。確信度は刺激提示後約300msから出現し、運動応答まで持続する。検出判断と確信度を[U.pIPS]、[U.mIPS]（探索継続の判断のためのフィードバック）、[U.FEF]、[U.DLPFC]（意思決定への証拠提供）、[U.SC]、[U.PMC]（運動応答の実行）に出力する。この変換により、知覚速度における「判断の速さと正確さ」のトレードオフを最適化する。

#### 2. Requirement realization by interface
[U.aIPS]のInterfaceは、([U.pIPS], [U.mIPS], [U.FEF], [U.DLPFC], [U.SC], [U.PMC]) = [U.aIPS]([U.mIPS], [U.FEF], [U.DLPFC])と定義されている。Requirementで記述された機能は、このInterfaceによって以下のように実現される：[U.mIPS]からのターゲット候補情報が入力され、検出判断の証拠が提供される。[U.FEF]からの探索終了制御信号と[U.DLPFC]からの意思決定基準（検出閾値）が入力され、判断のタイミングと基準が調節される。[U.aIPS]は証拠を蓄積し判断と確信度を計算し、その結果を[U.FEF]と[U.DLPFC]に送ることで認知制御ループを閉じる。同時に、[U.SC]と[U.PMC]への出力により運動応答が開始される。さらに、[U.pIPS]と[U.mIPS]へのフィードバックにより、探索が継続すべきか終了すべきかを制御する。このInterfaceは、Requirementで要求される証拠蓄積、判断・確信度計算、認知制御フィードバック、運動出力のすべてを支援する。

#### 3. Capability
感覚証拠を時間的に蓄積し、二値判断（ターゲット有/無）とその判断の確信度を同時に計算する能力。この能力は、ノイズの多い感覚入力から統計的に最適な判断を導き、判断の信頼性をメタ認知的に評価する計算を含む。Drift Diffusion Model（DDM）は、証拠蓄積プロセスの標準的記述を提供し、判断は証拠が閾値に達した時点で行われる（Ratcliff & McKoon, 2008）。Confidence計算は、最終的な証拠レベルだけでなく、判断に要した時間（decision time）と判断後の証拠蓄積（post-decisional accumulation）を明示的に含む（Navajas et al., 2024）。ベイズ的確信度モデル（POMDP; Sanders et al., 2016）は、確信度を「判断が正しい事後確率」として定義する規範的アプローチを提供する。神経科学的には、頭頂皮質ニューロンが判断に伴う確信度を集団コードとしてrepresentすることが実証されている（Kiani & Shadlen, 2009）。確信度信号は刺激提示後約300msから出現し、運動応答まで持続する（Gherman & Philiastides, 2015）。

#### 4. Mechanism
判断と確信度の計算は、以下のメカニズムで実現される。[U.mIPS]から送られるターゲット候補の証拠（選択強度）が、ノイズを持つ拡散過程として時間積分される。証拠蓄積は、ターゲット仮説とno-target仮説を表す2つの独立した積分器（accumulator）で並行して行われる。各時刻で、sensory evidenceのドリフト率に比例した増分とガウスノイズが積分器に加えられる。いずれかの積分器が決定閾値（[U.DLPFC]から設定）に達した時点で判断が確定する。確信度は、判断時点での「勝者積分器の証拠量」と「敗者積分器の証拠量」の差分、および判断に要した時間の関数として計算される。具体的には、Confidence ∝ (Evidence_winner - Evidence_loser) / Decision_time。あるいは、ベイズモデルでは、Confidence = P(correct | evidence, choice, time)として計算される。判断後も証拠蓄積は継続し（post-decisional accumulation）、これが確信度の更新に寄与する。確信度は刺激提示後約300msから神経活動として出現し、運動準備信号と並行して維持される。閾値が高い場合は判断は遅いが確信度は高く、閾値が低い場合は判断は速いが確信度は低い（speed-accuracy tradeoff）。

#### 5. Implementation
- Evidence accumulation (Drift Diffusion Model):
  - dE_target/dt = μ_target * S + σ * η(t)
  - dE_notarget/dt = μ_notarget * (1-S) + σ * η(t)
  - E: 蓄積証拠、μ: ドリフト率、S: [U.mIPS]からのsensory evidence、σ: ノイズ強度、η(t): ガウスノイズ
- Decision: Choice = arg max(E_target, E_notarget) if max(E_target, E_notarget) > θ_decision
  - θ_decision: [U.DLPFC]からの決定閾値
- Decision time: RT = t when max(E_target, E_notarget) = θ_decision
- Confidence (evidence-based): Conf = (max(E_target, E_notarget) - min(E_target, E_notarget)) / RT
- Confidence (Bayesian): Conf = P(correct | E, Choice, RT) 
  - = ∫ P(correct | drift_rate) * P(drift_rate | E, Choice, RT) d(drift_rate)
- Post-decisional accumulation: E(t) = E(RT) + ∫_{RT}^{t} (μ * S(τ) + σ * η(τ)) dτ for t > RT
- [U.aIPS] = (Choice, Conf)
