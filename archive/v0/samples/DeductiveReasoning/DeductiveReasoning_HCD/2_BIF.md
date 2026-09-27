# ステップ2: BIF（Brain Information Flow）の構築

## 概要
ROI内外の神経接続を文献調査に基づいて記録する。演繹的推論に関与する主要な脳領域間の解剖学的接続をまとめる。

---

## BIF表

| Sender                                                         | Receiver                                               | Comment                                                                  | Reference                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 後頭皮質（Occipital Cortex, V1/V2/V3）                               | 後部頭頂皮質（Posterior Parietal Cortex, IPS/SPL）             | 背側視覚経路。視覚情報を空間座標系に変換し、運動制御と空間認識に利用。V1→V2→V3→V3A→V6→頭頂間溝の階層的処理。           | Rizzolatti & Matelli, 2003, Two different streams form the dorsal visual system: anatomy and functions                                                                                                                                               |
| 中側頭回後部（Posterior Middle Temporal Gyrus, pMTG）(ROI外)            | 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）              | 意味情報の伝達。側頭葉の意味記憶を前頭葉の実行制御プロセスに統合。                                        | Davey et al., 2015, Exploring the role of the posterior middle temporal gyrus in semantic cognition; Qiao et al., 2025, Functional differentiation and interactions among inferior, medial frontal and posterior temporal cortex in semantic control |
| 上側頭回（Superior Temporal Gyrus, STG）(ROI外)                       | 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）              | 聴覚言語情報の処理。音韻情報と意味情報を前頭葉に伝達。                                              | Qiao et al., 2025, Functional differentiation and interactions among inferior, medial frontal and posterior temporal cortex in semantic control                                                                                                      |
| 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）                      | 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC） | 前頭前野内の情報統合。IFGの言語・意味処理をDLPFCの作業記憶・実行制御に接続。                               | Howlett et al., 2022, Functional connectivity of the inferior frontal gyrus: A meta-analytic connectivity modeling study                                                                                                                             |
| 左下前頭回（Left Inferior Frontal Gyrus, L-IFG, BA 44）               | 両側後部頭頂皮質（Bilateral Posterior Parietal Cortex）          | 前頭-頭頂ネットワーク。IFG BA44は最も広範な共活性化パターンを示し、両側前頭葉、両側頭頂葉、左側頭葉、左皮質下領域（視床・被殻）に接続。 | Howlett et al., 2022, Functional connectivity of the inferior frontal gyrus: A meta-analytic connectivity modeling study                                                                                                                             |
| 左下前頭回（Left Inferior Frontal Gyrus, L-IFG, BA 45）               | 左側頭葉（Left Temporal Lobe）                               | 前頭-側頭ネットワーク。BA45は主に左半球の前頭側頭領域に関与し、言語処理の機能分化を示す。                          | Howlett et al., 2022, Functional connectivity of the inferior frontal gyrus: A meta-analytic connectivity modeling study                                                                                                                             |
| 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC）         | 左尾状核背側後部（Left Dorsal-Posterior Caudate Nucleus）        | 前頭-線条体投射。DLPFCは尾状核の背側後部領域に投射し、認知制御と目標指向行動を支援。                            | Leh et al., 2007, Fronto-striatal connections in the human brain: A probabilistic diffusion tractography study                                                                                                                                       |
| 左腹外側前頭前野（Left Ventrolateral Prefrontal Cortex, VLPFC, 下前頭回を含む） | 左尾状核腹側前部（Left Ventral-Anterior Caudate Nucleus）        | 前頭-線条体投射。VLPFCは尾状核の腹側前部領域に投射し、柔軟な認知制御を支援。                                | Leh et al., 2007, Fronto-striatal connections in the human brain: A probabilistic diffusion tractography study                                                                                                                                       |
| 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC）         | 左被殻（Left Putamen）                                      | 前頭-線条体投射。被殻は運動関連皮質（補足運動野、一次運動野）との別個の接続を示すが、DLPFCからの入力も受ける。               | Leh et al., 2007, Fronto-striatal connections in the human brain: A probabilistic diffusion tractography study                                                                                                                                       |
| 左尾状核（Left Caudate Nucleus）                                     | 腹側前核（Ventral Anterior Nucleus, VA）(ROI外)               | 直接経路・間接経路の出力。尾状核と被殻からのGABA作動性投射が淡蒼球内節・黒質網様部を介して視床に到達。                    | McFarland & Haber, 2002, Thalamic Relay Nuclei of the Basal Ganglia Form Both Reciprocal and Nonreciprocal Cortical Connections                                                                                                                      |
| 左被殻（Left Putamen）                                              | 腹側前核（Ventral Anterior Nucleus, VA）(ROI外)               | 直接経路・間接経路の出力。被殻からの出力は主に運動回路に関与するが、VAを介して前運動野にも投射。                        | McFarland & Haber, 2002, Thalamic Relay Nuclei of the Basal Ganglia Form Both Reciprocal and Nonreciprocal Cortical Connections                                                                                                                      |
| 左尾状核（Left Caudate Nucleus）                                     | 内側背側核（Mediodorsal Nucleus, MD）(ROI外)                   | 認知回路の出力。尾状核からの出力がMD核を介して背外側前頭前野と眼窩前頭皮質に投射。                               | McFarland & Haber, 2002, Thalamic Relay Nuclei of the Basal Ganglia Form Both Reciprocal and Nonreciprocal Cortical Connections                                                                                                                      |
| 内側背側核（Mediodorsal Nucleus, MD）(ROI外)                           | 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC） | 視床皮質投射。MD核の後外側部が背腹軸に沿った地誌的組織化でDLPFCに投射し、作業記憶・注意・行動抑制などの認知制御を支援。          | Sung et al., 2014, Thalamocortical Connections between the Mediodorsal Nucleus and Prefrontal Cortex; Varela et al., 2019, Topographic organization of connections between prefrontal cortex and mediodorsal thalamus                                |
| 内側背側核（Mediodorsal Nucleus, MD）(ROI外)                           | 左腹外側前頭前野（Left Ventrolateral Prefrontal Cortex, VLPFC）  | 視床皮質投射。MD核の中間部がVLPFCに投射。                                                 | Sung et al., 2014, Thalamocortical Connections between the Mediodorsal Nucleus and Prefrontal Cortex                                                                                                                                                 |
| 内側背側核（Mediodorsal Nucleus, MD）(ROI外)                           | 眼窩前頭皮質（Orbitofrontal Cortex, OFC）(ROI外)                | 視床皮質投射。MD核の前内側部がOFCに投射し、最も大きな投射束を形成。                                     | Sung et al., 2014, Thalamocortical Connections between the Mediodorsal Nucleus and Prefrontal Cortex                                                                                                                                                 |
| 腹側前核（Ventral Anterior Nucleus, VA）(ROI外)                       | 左前運動皮質（Left Premotor Cortex, L-PMC）                    | 視床皮質投射。VAは尾状核・被殻からの入力を受け、前運動野（帯状皮質、前補足運動野を含む）に投射。                        | McFarland & Haber, 2002, Thalamic Relay Nuclei of the Basal Ganglia Form Both Reciprocal and Nonreciprocal Cortical Connections                                                                                                                      |
| 腹側前核（Ventral Anterior Nucleus, VA）(ROI外)                       | 左内側前頭回（Left Medial Frontal Gyrus, L-MeFG）              | 視床皮質投射。VAからの投射が内側前頭領域に到達し、認知制御を支援。                                       | Haber & Calzavara, 2009, The cortico-basal ganglia integrative network                                                                                                                                                                               |
| 左角回（Left Angular Gyrus, L-AG）                                  | 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）              | 頭頂-前頭投射。角回の意味的統合機能を前頭葉の実行制御に統合。両側角回、左側頭葉、両側前運動野、左前頭前野が共活性化ネットワークを形成。     | Seghier, 2013, The angular gyrus: multiple functions and multiple subdivisions; Meta-analysis studies                                                                                                                                                |
| 左角回（Left Angular Gyrus, L-AG）                                  | 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC） | 頭頂-前頭投射。角回は上頭頂小葉・縁上回と共にDLPFCとの機能的ネットワークを形成し、作業記憶と推論を支援。                  | Meta-analysis and connectivity studies                                                                                                                                                                                                               |
| 左頭頂間溝（Left Intraparietal Sulcus, L-IPS）                        | 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC） | 頭頂-前頭投射。IPSは空間的作業記憶と数値処理の情報をDLPFCに伝達。                                    | Connectivity studies of fronto-parietal networks                                                                                                                                                                                                     |
| 左上頭頂小葉（Left Superior Parietal Lobule, L-SPL）                   | 左頭頂間溝（Left Intraparietal Sulcus, L-IPS）                | 頭頂葉内投射。SPLとIPSは垂直線維束で接続され、視空間統合と選択的注意を支援。ヒトで特に発達。                        | Anatomical studies of posterior parietal cortex                                                                                                                                                                                                      |
| 左角回（Left Angular Gyrus, L-AG）                                  | 左縁上回（Left Supramarginal Gyrus, L-SMG）                  | 下頭頂小葉内接続。角回（BA 39）と縁上回（BA 40）は機能的に相互作用し、言語と空間処理を統合。                      | Anatomical and functional connectivity studies                                                                                                                                                                                                       |
| 左楔前部（Left Precuneus）                                           | 左角回（Left Angular Gyrus, L-AG）                          | 内側頭頂から外側頭頂への投射。楔前部の自己参照的・視空間的処理を角回の意味統合に接続。                              | Parietal connectivity studies                                                                                                                                                                                                                        |
| 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）                      | 左被殻（Left Putamen）                                      | 前頭-線条体投射。IFG（特にBA 44）は被殻との強い機能的結合を示す。                                    | Howlett et al., 2022, Functional connectivity of the inferior frontal gyrus                                                                                                                                                                          |
| 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）                      | 視床（Thalamus）(ROI外)                                     | 前頭-視床投射。IFG BA44は視床との共活性化を示し、認知制御ループの一部を形成。                              | Howlett et al., 2022, Functional connectivity of the inferior frontal gyrus                                                                                                                                                                          |
| 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC）         | 左前運動皮質（Left Premotor Cortex, L-PMC）                    | 前頭葉内投射。DLPFCの背側-吻側亜領域は前頭葉と辺縁系領域に接続し、腹側-尾側領域は前頭・頭頂・辺縁皮質に広範に接続。            | Cocchi et al., 2022, Subregions of DLPFC Display Graded yet Distinct Structural and Functional Connectivity                                                                                                                                          |
| 左前運動皮質（Left Premotor Cortex, L-PMC）                            | 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）              | 前頭葉内の相互接続。運動準備と言語・推論機能の統合。                                               | Lateral prefrontal cortex connectivity studies                                                                                                                                                                                                       |
| 左内側前頭回（Left Medial Frontal Gyrus, L-MeFG, BA 6）                | 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）              | 内側から外側前頭への投射。認知制御の統合。                                                    | Frontal lobe connectivity studies                                                                                                                                                                                                                    |
| 左背外側前頭前野（Left Dorsolateral Prefrontal Cortex, L-DLPFC）         | 左角回（Left Angular Gyrus, L-AG）                          | 前頭-頭頂フィードバック。トップダウンの認知制御信号を頭頂葉に送信。                                       | Fronto-parietal network studies                                                                                                                                                                                                                      |
| 左下前頭回（Left Inferior Frontal Gyrus, L-IFG）                      | 左角回（Left Angular Gyrus, L-AG）                          | 前頭-頭頂フィードバック。意味処理と空間的表現の統合。                                              | Semantic network and fronto-parietal connectivity studies                                                                                                                                                                                            |

---

## 主要な接続パターンのまとめ

### 1. 入力経路（ROI外 → ROI内）

#### 視覚入力
- **後頭皮質（V1/V2/V3）→ 後部頭頂皮質（IPS/SPL）**
  - 背側視覚経路
  - 空間情報の処理

#### 意味情報入力
- **側頭葉（pMTG, STG）→ 左下前頭回（L-IFG）**
  - 意味記憶の伝達
  - 言語情報の処理

#### 視床からの入力
- **内側背側核（MD）→ 左背外側前頭前野（L-DLPFC）**
  - 基底核出力の中継
  - 認知制御の調節

- **腹側前核（VA）→ 左前運動皮質（L-PMC）/ 左内側前頭回（L-MeFG）**
  - 基底核出力の中継
  - 運動準備と認知制御

### 2. ROI内の主要回路

#### 前頭-頭頂ネットワーク
- **左下前頭回（L-IFG）↔ 左角回（L-AG）**
  - 双方向の情報交換
  - 言語・意味処理と空間表現の統合

- **左背外側前頭前野（L-DLPFC）↔ 左頭頂間溝（L-IPS）**
  - 作業記憶と空間処理の統合

- **左背外側前頭前野（L-DLPFC）↔ 左角回（L-AG）**
  - 実行制御と意味的統合

#### 前頭-線条体ループ
- **左背外側前頭前野（L-DLPFC）→ 左尾状核（L-Caudate）→ MD → L-DLPFC**
  - 認知制御のループ
  - ルール選択と適用

- **左下前頭回（L-IFG）→ 左被殻（L-Putamen）→ VA → 前運動野**
  - 言語-運動統合
  - 応答選択

#### 頭頂葉内ネットワーク
- **左上頭頂小葉（L-SPL）→ 左頭頂間溝（L-IPS）**
  - 視空間統合

- **左角回（L-AG）↔ 左縁上回（L-SMG）**
  - 下頭頂小葉内の統合

- **左楔前部（L-Precuneus）→ 左角回（L-AG）**
  - 自己参照処理と意味統合

#### 前頭葉内ネットワーク
- **左下前頭回（L-IFG）↔ 左背外側前頭前野（L-DLPFC）**
  - 言語処理と作業記憶の統合

- **左背外側前頭前野（L-DLPFC）→ 左前運動皮質（L-PMC）**
  - 認知制御から運動準備へ

- **左内側前頭回（L-MeFG）→ 左下前頭回（L-IFG）**
  - 認知制御の統合

### 3. 出力経路（ROI内 → ROI外）

#### 基底核への出力
- **左背外側前頭前野（L-DLPFC）→ 左尾状核背側後部**
  - 認知制御信号

- **左下前頭回（L-IFG）→ 左被殻**
  - 運動プログラム選択

#### 視床を介した出力
- **左尾状核 → 腹側前核（VA）→ 前運動野**
  - 行動選択信号

- **左尾状核 → 内側背側核（MD）→ 背外側前頭前野**
  - 認知制御のフィードバック

---

## 演繹的推論における情報フローの概要

1. **前提情報の入力**
   - 視覚的/聴覚的刺激 → 後頭葉/側頭葉
   - 意味情報 → 側頭葉（pMTG, STG）→ 左下前頭回（L-IFG）
   - 空間情報 → 後頭皮質 → 後部頭頂皮質（IPS/SPL/AG）

2. **前提の統合と作業記憶**
   - 左下前頭回（L-IFG）で意味的処理
   - 左背外側前頭前野（L-DLPFC）で作業記憶維持
   - 左角回（L-AG）で心的モデル構築

3. **ルールの選択と適用**
   - 前頭前野（DLPFC, IFG）→ 基底核（尾状核、被殻）
   - ルールベースの決定戦略の選択
   - 基底核 → 視床（MD, VA）→ 前頭前野へのフィードバック

4. **結論の生成**
   - 前頭-頭頂ネットワークでの統合処理
   - 論理的妥当性の評価
   - 前運動皮質（PMC）への出力 → 応答生成

この情報フローは、メタ解析研究（Prado et al., 2011）で同定された一貫した活性化パターンと整合的である。

---

## 次のステップ

ステップ3に進み、これらのBIFに基づいてUniform Circuit（UC）を定義する。ROI内の主要な神経組織をメゾスコピックレベルで同定し、UCとして記述する。
