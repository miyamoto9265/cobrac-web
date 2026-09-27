# Uniform Circuit (UC) 定義

本ファイルでは、Perceptual Speed機能を実現するために必要な情報処理の基本単位であるUniform Circuit（UC）を定義する。

## UCの定義基準
1. TLF（Perceptual Speed）の実現に必要な情報処理に関与している
2. 同質的な情報をコードしている神経組織である
3. メゾスコピックレベルとして適切な粒度
4. ROI内（IPS）とROI外を明確に区別する

## UC一覧表（Interface、Output Semantics付き）

| Circuit ID | Names | Comment | Interface | Output Semantics |
| ---------- | ----- | ------- | --------- | ---------------- |
| `Early-Visual-Features` | V1/V2 (Primary and Secondary Visual Cortex) | ROI外（noROI(input)）。基本的な視覚特徴（エッジ、方位、色）を抽出する初期視覚野。Perceptual Speedに必要な視覚刺激の初期処理を担う。 | | [Early-Visual-Features]網膜入力から抽出された基本的な視覚特徴（方位、空間周波数、色、エッジ）; |
| `High-Level-Visual-Representation` | Ventral Temporal Cortex (Fusiform Gyrus) | ROI外（noROI(input/output)）。文字、数字、物体などのカテゴリー特異的な高次視覚表現をコードする。IPS-FG線維束を介してIPSと双方向接続。比較対象となる視覚カテゴリー情報をIPSに提供し、IPSからのトップダウン調整を受ける。 | | [High-Level-Visual-Representation]文字、数字、物体などのカテゴリー特異的な視覚表現; |
| `Motion-Processing` | MT/MST (Middle Temporal and Medial Superior Temporal Areas) | ROI外（noROI(input)）。視覚動き情報を処理し、IPSのVIP、LIP、MIPに投射。動的な刺激の比較に必要な時間的変化情報を提供。 | | [Motion-Processing]視覚刺激の動き方向、速度、軌跡などの時間的変化情報; |
| `Thalamic-Attention-Hub` | Pulvinar (Medial and Lateral) | ROI外（noROI(input)）。視覚注意の調整と文脈信号をIPSに提供。視覚刺激への注意配分を調整し、迅速な比較処理を支援。 | | [Thalamic-Attention-Hub]視覚刺激への注意の優先度と文脈的調整信号; |
| `Visual-Input-Integration` | Posterior IPS (IPS1, IPS2) | ROI内。初期視覚野（V1/V2）と高次視覚野（Fusiform Gyrus）からの視覚情報を統合。視覚刺激の特徴表現を構築し、比較処理の入力を準備する。 | ([Pattern-Comparison], [Working-Memory-Maintenance]) = Visual-Input-Integration([Early-Visual-Features], [High-Level-Visual-Representation], [Thalamic-Attention-Hub], [Top-Down-Attention-Control]) | [Visual-Input-Integration]多層的な視覚特徴が統合された視覚刺激の統一的表現; |
| `Pattern-Comparison` | LIP (Lateral Intraparietal Area) | ROI内。視覚パターン間の関係性符号化と類似性比較を実行。提示された刺激同士、または提示刺激と記憶刺激の比較を担う中核的なUC。LIPvとLIPdの２つのコンパートメントを含む。 | ([Comparison-Decision], [Oculomotor-Control]) = Pattern-Comparison([Visual-Input-Integration], [Working-Memory-Maintenance], [Motion-Processing], [Thalamic-Attention-Hub]) | [Pattern-Comparison]視覚パターン間の類似性距離と相違性の符号化（比較結果）; |
| `Working-Memory-Maintenance` | Dorsal LIP (LIPd) | ROI内。記憶された視覚刺激の表現を保持。FEFからのフィードバックを受け、記憶情報と現在の視覚入力を統合して比較を可能にする。 | ([Pattern-Comparison]) = Working-Memory-Maintenance([Visual-Input-Integration], [Oculomotor-Control], [Top-Down-Attention-Control]) | [Working-Memory-Maintenance]短期間保持された視覚刺激の記憶表現; |
| `Comparison-Decision` | Anterior IPS (IPS3, IPS4, hIP1-3) | ROI内。比較処理の結果を統合し、類似性/相違性の決定を行う。前頭前野との強い接続により、決定信号を出力する。 | ([Decision-Output], [High-Level-Visual-Representation]) = Comparison-Decision([Pattern-Comparison], [Top-Down-Attention-Control]) | [Comparison-Decision]視覚刺激が類似しているか相違しているかの二値的決定信号; |
| `Top-Down-Attention-Control` | Prefrontal Cortex (dlPFC, Insula) | ROI外（noROI(input)）。トップダウン注意制御信号をIPSに送る。どの刺激特徴に注意を向けるかを制御し、比較処理の効率を高める。 | | [Top-Down-Attention-Control]タスク要求に基づく注意制御信号と決定基準; |
| `Oculomotor-Control` | FEF (Frontal Eye Fields) | ROI外（noROI(input/output)）。眼球運動の制御。LIPvからの入力を受けて眼球運動を実行し、LIPdへフィードバックを送る。視覚刺激間の注意シフトと視線移動を制御。 | | [Oculomotor-Control]眼球運動指令と視線位置のフィードバック情報; |
| `Motor-Output` | Premotor Cortex (F4, F5) | ROI外（noROI(output)）。VIPとAIPからの運動指令を受けて、反応実行の準備を行う。Perceptual Speedタスクにおける運動反応（ボタン押しなど）の出力。 | | |
| `Decision-Output` | Prefrontal Cortex (dlPFC) | ROI外（noROI(output)）。前部IPSからの決定信号を受け取り、最終的な判断を行う。類似/相違の判定結果を行動出力へと変換する。 | | |

## ROI内UCの詳細説明

### `Visual-Input-Integration` (後部IPS)
- **位置**: 頭頂間溝後部（IPS1, IPS2）
- **入力**: V1/V2からの基本視覚特徴、Fusiform Gyrusからの高次視覚表現、MT/MSTからの動き情報
- **機能**: 多様な視覚情報源からの入力を統合し、視覚刺激の統一的な表現を構築
- **出力**: 統合された視覚表現を`Pattern-Comparison`へ送る
- **神経科学的根拠**: 後部IPSは初期視覚野と強く接続し、視覚情報の統合ハブとして機能（Greenberg et al., 2012）

### `Pattern-Comparison` (LIP)
- **位置**: 外側頭頂間領域（LIP）。LIPvとLIPdの２つのコンパートメントを含む
- **入力**: `Visual-Input-Integration`からの視覚表現、`Working-Memory-Maintenance`からの記憶表現、`Thalamic-Attention-Hub`からの注意信号
- **機能**: 視覚パターン間の関係性符号化。類似性距離の計算。提示刺激同士または提示-記憶刺激間の比較
- **出力**: 比較処理結果を`Comparison-Decision`へ、眼球運動信号を`Oculomotor-Control`へ
- **神経科学的根拠**: LIPは視覚パターンの関係性符号化を行い、類似性比較を支える（Nature Communications, 2025）。LIPvは眼球運動制御への強いフィードフォワード接続を持つ（Harrewijn et al., 2025）

### `Working-Memory-Maintenance` (背側LIP)
- **位置**: 背側外側頭頂間領域（LIPd）
- **入力**: `Visual-Input-Integration`からの視覚表現、`Oculomotor-Control`からのフィードバック、`Top-Down-Attention-Control`からの認知制御信号
- **機能**: 記憶された視覚刺激の表現を短期間保持。現在の視覚入力と記憶情報を統合
- **出力**: 記憶表現を`Pattern-Comparison`へ送る
- **神経科学的根拠**: LIPdはFEFからのフィードバック接続を受け、認知制御に関与（Harrewijn et al., 2025）。視覚ワーキングメモリは頭頂皮質で維持される（Nature Communications, 2025）

### `Comparison-Decision` (前部IPS)
- **位置**: 頭頂間溝前部（IPS3, IPS4, hIP1-3）
- **入力**: `Pattern-Comparison`からの比較結果、`Top-Down-Attention-Control`からの決定基準
- **機能**: 比較処理の結果を統合し、類似性/相違性の最終決定を行う
- **出力**: 決定信号を`Decision-Output`へ、視覚調整信号を`High-Level-Visual-Representation`へ
- **神経科学的根拠**: 前部IPSは前頭前野領域と強く接続し、決定処理に関与（Greenberg et al., 2012; Basti et al., 2022）

## ROI外UCの役割
- **入力UC**: `Early-Visual-Features`, `High-Level-Visual-Representation`, `Motion-Processing`, `Thalamic-Attention-Hub`, `Top-Down-Attention-Control`, `Oculomotor-Control` (フィードバック)
- **出力UC**: `High-Level-Visual-Representation` (トップダウン調整), `Oculomotor-Control`, `Motor-Output`, `Decision-Output`
- **双方向UC**: `High-Level-Visual-Representation`, `Oculomotor-Control`

## 機能関連項目（ROI内UCのみ）

以下では、ROI内の各UCについて、Requirement, Requirement realization by interface, Capability, Mechanism, Implementationを定義する。

### `Visual-Input-Integration` の機能関連項目

#### 1. Requirement
[U.Visual-Input-Integration]は、Perceptual Speed機能を実現するために、入力:[U.Early-Visual-Features]（基本的な視覚特徴）と入力:[U.High-Level-Visual-Representation]（文字、数字、物体などのカテゴリー特異的な視覚表現）、入力:[U.Thalamic-Attention-Hub]（視覚刺激への注意の優先度と文脈的調整信号）、入力:[U.Top-Down-Attention-Control]（タスク要求に基づく注意制御信号と決定基準）を受け取り、これらを統合して、出力:[U.Visual-Input-Integration]（多層的な視覚特徴が統合された視覚刺激の統一的表現）を生成する。この統一的表現は、その後の比較処理に必要な視覚刺激の包括的な記述を提供する。

#### 2. Requirement realization by interface
Interfaceは([U.Pattern-Comparison], [U.Working-Memory-Maintenance]) = U.Visual-Input-Integration([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])である。入力として[U.Early-Visual-Features]から基本視覚特徴を、[U.High-Level-Visual-Representation]からカテゴリー表現を、[U.Thalamic-Attention-Hub]から注意調整信号を、[U.Top-Down-Attention-Control]からタスク制御信号を受ける。これらを統合処理して、出力:[U.Visual-Input-Integration]（統一的視覚表現）を[U.Pattern-Comparison]と[U.Working-Memory-Maintenance]の両方に送る。Requirementで記述された入出力関係とInterfaceは整合している。

#### 3. Capability
入力として、低次視覚特徴（エッジ、方位、色）と高次カテゴリー表現、注意調整信号、認知制御信号を受け取り、これらを重み付けして統合し、単一の多次元表現空間に射影する機能。この処理は、階層的フィードフォワード統合と注意による動的重み付けを組み合わせたものである。Perceptual Speedのような迅速比較タスクにおいては、タスク関連特徴への選択的注意配分が統合効率を決定する。

**神経科学的根拠**: 後頭頂皮質は、視覚情報を行動制御のために統合する中核ハブとして機能し、階層的フィードフォワード機構を通じて視覚特徴を統合する（Gamberini et al., 2024; Plos Biology, 2023）。視覚皮質の表層はsaliency mapを作成し、これが頭頂皮質へとフィードフォワードされる。統合情報理論によれば、PPCは情報統合の中核複合体として機能する（Frontiers in Neuroscience, 2025）。

#### 4. Mechanism
階層的フィードフォワード統合: 低次視覚特徴（V1/V2からの）と高次カテゴリー表現（Fusiform Gyrusからの）は、後部IPS内の異なる皮質層に投射される。これらの入力は、注意信号（Pulvinarからの）によって動的にゲート制御される。トップダウン制御信号（dlPFCからの）は、タスク関連特徴への重み付けを調整する。統合は、複数の視覚情報源からの入力を単一の高次元表現空間内で結合することで実現される。この空間では、視覚刺激は多次元ベクトルとして表現され、各次元は異なる視覚特徴（低次と高次の両方）に対応する。注意による重み付けは、乗算的ゲインとして作用し、タスク関連特徴の表現強度を増幅する。

#### 5. Implementation
[U.Visual-Input-Integration] = α₁·[U.Early-Visual-Features] + α₂·[U.High-Level-Visual-Representation]

ここで、α₁とα₂は注意による重み付け係数であり、
α₁ = f([U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])
α₂ = g([U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])

f, gは注意信号に依存する非線形ゲイン関数（例: シグモイド関数）

---

### `Pattern-Comparison` の機能関連項目

#### 1. Requirement
[U.Pattern-Comparison]は、Perceptual Speed機能を実現するために、入力:[U.Visual-Input-Integration]（多層的な視覚特徴が統合された視覚刺激の統一的表現）、入力:[U.Working-Memory-Maintenance]（短期間保持された視覚刺激の記憶表現）、入力:[U.Motion-Processing]（視覚刺激の動き方向、速度、軌跡などの時間的変化情報）、入力:[U.Thalamic-Attention-Hub]（視覚刺激への注意の優先度と文脈的調整信号）を受け取り、これらの視覚表現間の類似性距離を計算し、出力:[U.Pattern-Comparison]（視覚パターン間の類似性距離と相違性の符号化）を生成する。この比較処理は、提示された複数の刺激間、または提示刺激と記憶された刺激間の類似性/相違性を定量化する。

#### 2. Requirement realization by interface
Interfaceは([U.Comparison-Decision], [U.Oculomotor-Control]) = U.Pattern-Comparison([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub])である。入力として[U.Visual-Input-Integration]から現在の視覚表現を、[U.Working-Memory-Maintenance]から記憶表現を、[U.Motion-Processing]から動き情報を、[U.Thalamic-Attention-Hub]から注意調整を受ける。これらを用いて類似性比較を実行し、比較結果を[U.Comparison-Decision]へ、眼球運動信号を[U.Oculomotor-Control]へ出力する。Requirementで記述された入出力関係とInterfaceは整合している。

#### 3. Capability
複数の高次元視覚表現ベクトル間の類似性距離を計算する機能。この計算は、関係性符号化（relational coding）を用いて、視覚パターン間の類似性距離行列を構築する。類似性メトリックは、タスク要求に応じて動的に調整可能であり、特定の視覚特徴次元（形状、色、カテゴリーなど）に対する選択的重み付けを含む。この機能は、パターン間の時間的非対称性も考慮し、現在の刺激と過去/未来の刺激との類似性を区別する。

**神経科学的根拠**: 高次視覚皮質は関係性符号化（類似性距離の比較）を主要な神経コードとして使用する（Nature Communications, 2025）。外側頭頂皮質は神経パターン類似性の時間的非対称性を用いて認識記憶決定を行う（Nature Communications, 2025）。LIPは視覚パターンの関係性符号化を実行し、類似性比較を支える。複数の相補的な表現類似性メトリック（幾何学、ユニットレベル調整、線形復号化可能性）を統合することで、より鮮明な領域弁別と階層組織が明らかになる（arXiv, 2024）。

#### 4. Mechanism
関係性符号化による類似性計算: LIP内のニューロン集団は、視覚刺激を高次元空間内の点として表現する。類似性比較は、これらの点間の距離（例: ユークリッド距離、マハラノビス距離）を計算することで実現される。LIPは、視覚表現空間内で類似性距離行列を構築し、どの刺激ペアが最も類似/相違しているかを符号化する。時間的統合により、現在の視覚入力（[U.Visual-Input-Integration]からの）と記憶された刺激（[U.Working-Memory-Maintenance]からの）を同じ表現空間内で比較可能にする。注意信号（[U.Thalamic-Attention-Hub]からの）は、特定の特徴次元への重み付けを調整し、タスク関連の類似性判断を促進する。動き情報（[U.Motion-Processing]からの）は、時間的に変化する刺激の比較を可能にする。

#### 5. Implementation
[U.Pattern-Comparison] = d([U.Visual-Input-Integration], [U.Working-Memory-Maintenance])

ここで、dは重み付き距離関数:
d(x, y) = √(Σᵢ wᵢ(xᵢ - yᵢ)²)

wᵢは[U.Thalamic-Attention-Hub]によって調整される特徴次元iの重み
動き情報の統合:
[U.Pattern-Comparison](t) = ∫ d([U.Visual-Input-Integration](τ), [U.Working-Memory-Maintenance]) · κ(t-τ, [U.Motion-Processing]) dτ

κは時間的統合カーネル

---

### `Working-Memory-Maintenance` の機能関連項目

#### 1. Requirement
[U.Working-Memory-Maintenance]は、Perceptual Speed機能を実現するために、入力:[U.Visual-Input-Integration]（多層的な視覚特徴が統合された視覚刺激の統一的表現）、入力:[U.Oculomotor-Control]（眼球運動指令と視線位置のフィードバック情報）、入力:[U.Top-Down-Attention-Control]（タスク要求に基づく注意制御信号と決定基準）を受け取り、視覚刺激の表現を短期間（数秒）保持し、出力:[U.Working-Memory-Maintenance]（短期間保持された視覚刺激の記憶表現）を生成する。この記憶表現は、現在の視覚入力と比較するための参照刺激として機能する。

#### 2. Requirement realization by interface
Interfaceは([U.Pattern-Comparison]) = U.Working-Memory-Maintenance([U.Visual-Input-Integration], [U.Oculomotor-Control], [U.Top-Down-Attention-Control])である。入力として[U.Visual-Input-Integration]から視覚表現を、[U.Oculomotor-Control]から眼球運動フィードバックを、[U.Top-Down-Attention-Control]から認知制御信号を受ける。これらを統合して記憶表現を維持し、[U.Pattern-Comparison]へ出力する。Requirementで記述された入出力関係とInterfaceは整合している。

#### 3. Capability
高次元視覚表現を変換された形式で短期間維持する機能。この維持は、知覚時の感覚表現の直接的コピーではなく、タスク目標に応じて変換・精錬された表現である。維持機構は、リカレント神経回路による持続的活動と、領域間の反響（inter-areal reverberation）を組み合わせる。眼球運動フィードバックは、記憶表現の空間的座標を更新し（座標変換）、トップダウン制御は、タスク関連情報の優先的維持を調整する。複数の情報ストリームが並行して維持される場合、表現は直交化され、干渉が最小化される。

**神経科学的根拠**: 後頭頂皮質と後頭側頭皮質は、視覚ワーキングメモリ中に知覚時とは異なる変換された表現を維持する（eNeuro, 2025）。PPCは、VWM中の異なる情報ストリームの表現を直交化し、適応的な視覚処理を可能にする（PMC, 2024）。大規模ネットワークモデルは、領域間反響を通じて記憶状態が持続されることを示す（UvA, 2022）。リカレントon-center off-surround神経網が距離依存抑制を伴ってVWMをモデル化できる（Nature Scientific Reports, 2025）。タスク駆動変換アカウントがVWMをよりよく説明する（Nature Communications, 2024）。

#### 4. Mechanism
変換された表現の維持: 視覚入力（[U.Visual-Input-Integration]からの）は、タスク目標に応じて変換される。この変換は、タスク非関連情報を抑制し、タスク関連情報を増幅する。変換された表現は、背側LIP（LIPd）内のリカレント神経回路によって維持される。リカレント接続（興奮性および抑制性）は、持続的なニューロン活動を支え、記憶表現を数秒間安定化する。眼球運動フィードバック（[U.Oculomotor-Control]からの）は、網膜座標から頭部中心座標への変換を可能にし、眼球運動中も記憶表現が安定に保たれる。トップダウン制御（[U.Top-Down-Attention-Control]からの）は、記憶表現の選択的強化とゲート制御を行う。複数の記憶項目がある場合、表現は高次元空間内で直交化され、干渉が回避される。

#### 5. Implementation
[U.Working-Memory-Maintenance](t) = ∫₀ᵗ R(t-τ) · T([U.Visual-Input-Integration](τ)) · G([U.Top-Down-Attention-Control](τ)) dτ + β·[U.Oculomotor-Control](t)

ここで、
R(t)はリカレント維持関数（例: 指数減衰 e^(-t/τ_decay)）
T(·)はタスク駆動変換関数
G(·)はゲート制御関数（0から1の値）
βは眼球運動フィードバックの座標変換係数

直交化（複数項目の場合）:
[U.Working-Memory-Maintenance]ᵢ ⊥ [U.Working-Memory-Maintenance]ⱼ for i ≠ j

---

### `Comparison-Decision` の機能関連項目

#### 1. Requirement
[U.Comparison-Decision]は、Perceptual Speed機能を実現するために、入力:[U.Pattern-Comparison]（視覚パターン間の類似性距離と相違性の符号化）と入力:[U.Top-Down-Attention-Control]（タスク要求に基づく注意制御信号と決定基準）を受け取り、類似性距離を決定基準と比較して、出力:[U.Comparison-Decision]（視覚刺激が類似しているか相違しているかの二値的決定信号）を生成する。この決定信号は、前頭前野へ送られ、最終的な行動出力（例: 「同じ」または「異なる」ボタンを押す）へと変換される。

#### 2. Requirement realization by interface
Interfaceは([U.Decision-Output], [U.High-Level-Visual-Representation]) = U.Comparison-Decision([U.Pattern-Comparison], [U.Top-Down-Attention-Control])である。入力として[U.Pattern-Comparison]から比較結果を、[U.Top-Down-Attention-Control]から決定基準を受ける。これらを統合して二値的決定を行い、決定信号を[U.Decision-Output]へ、視覚調整信号を[U.High-Level-Visual-Representation]へ出力する。Requirementで記述された入出力関係とInterfaceは整合している。

#### 3. Capability
連続的な類似性距離を二値的決定（類似/相違）に変換する閾値決定機能。この機能は、ドリフト拡散モデル（drift-diffusion model）のような証拠蓄積メカニズムを実装する。類似性距離の情報は時間的に蓄積され、決定境界に達すると決定が下される。決定基準（閾値）は、タスク要求、速度-正確性トレードオフ、事前確率に応じて動的に調整される。前部IPSは、前頭前野との強い結合を通じて、決定形成と認知制御を統合する。

**神経科学的根拠**: 前部IPS（IPS3-4）は前頭前野領域と強く接続し、決定処理に関与する（Greenberg et al., 2012; Basti et al., 2022）。頭頂皮質は、感覚証拠を蓄積して決定を形成する（ドリフト拡散モデル）。Image-computable modelは、視覚入力から決定までの迅速な決定形成プロセスをモデル化する（eLife, 2024）。

#### 4. Mechanism
証拠蓄積と閾値決定: [U.Pattern-Comparison]からの類似性距離情報は、前部IPS内で時間的に蓄積される。蓄積された証拠が決定境界（閾値）に達すると、二値的決定（類似または相違）が下される。決定境界は、[U.Top-Down-Attention-Control]からの信号によって動的に調整される。速度を重視するタスクでは閾値が低く設定され、正確性を重視するタスクでは閾値が高く設定される。決定が下されると、決定信号が前頭前野（[U.Decision-Output]）へ送られ、同時にトップダウン視覚調整信号が腹側視覚流（[U.High-Level-Visual-Representation]）へ送られる。このフィードバックは、決定に関連する視覚表現を強化し、後続の処理を最適化する。

#### 5. Implementation
証拠蓄積（ドリフト拡散プロセス）:
dE/dt = μ·[U.Pattern-Comparison] + σ·η(t)

ここで、
E: 蓄積された証拠
μ: ドリフト率（類似性距離から決定への変換率）
σ: ノイズ強度
η(t): ガウスノイズ

決定規則:
[U.Comparison-Decision] = {
  "類似" if E(t) ≥ θ_upper
  "相違" if E(t) ≤ θ_lower
}

決定境界:
θ_upper = f([U.Top-Down-Attention-Control])
θ_lower = -f([U.Top-Down-Attention-Control])

fは決定基準調整関数

## 次のステップ
ステップ7では、HCD全体の整合性を検証する。ステップ8では、完成したHCDの最終報告を作成する。
