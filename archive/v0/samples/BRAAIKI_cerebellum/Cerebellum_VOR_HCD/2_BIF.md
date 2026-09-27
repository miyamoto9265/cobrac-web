# ステップ2: BIF（Brain Information Flow）

## BIFとは
BIFは神経細胞の解剖学的投射の有無に関するデータであり、UC間のConnectionを定義する際の神経科学的根拠となります。

## 表記規則
- ROI外の神経組織には「(ROI外)」を付記
- 投射の強度や性質（興奮性/抑制性）が明らかな場合はCommentに記載

---

## BIFテーブル

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 前庭神経（Scarpa神経節）(ROI外) | 前庭神経核 (ROI外) | 一次前庭求心性線維。半規管からの頭部角速度情報を伝達。興奮性（グルタミン酸作動性） | Cullen & Roy 2004, https://www.ncbi.nlm.nih.gov/books/NBK557380/ |
| 前庭神経（Scarpa神経節）(ROI外) | 小脳小節 顆粒細胞層 | 一次前庭求心性線維の一部が直接小脳へ投射（苔状線維として）。下小脳脚経由 | Voogd et al. 2012, https://www.ncbi.nlm.nih.gov/books/NBK557380/ |
| 前庭神経核 (ROI外) | 小脳小節 顆粒細胞層 | 二次前庭神経の苔状線維投射。両側性。前庭・視運動・頸部固有受容情報を伝達 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| 橋底核 (ROI外) | 小脳小節 顆粒細胞層 | 苔状線維入力。両側性投射。背外側、外側、腹内側、背内側の柱状配置 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| 舌下神経周囲核群 (ROI外) | 小脳小節 顆粒細胞層 | 苔状線維入力。両側性投射。前庭動眼反射関連情報 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| 傍正中束核（MLF介在核）(ROI外) | 小脳小節 顆粒細胞層 | 苔状線維入力。運動コマンドのコピーを伝達（efference copy）。サッケード関連ニューロンの投射 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| 視索核（NOT）・副視索背側核（DTN）(ROI外) | 下オリーブ核 (ROI外) | 視覚誤差信号（retinal slip）を下オリーブ核へ中継。同側性投射 | Mustari & Fuchs 1990, https://link.springer.com/article/10.1007/BF00247315 |
| 下オリーブ核（β核・背内側細胞柱）(ROI外) | 小脳小節 プルキンエ細胞 | 登上線維による投射。対側性。網膜滑り等の視覚誤差信号を伝達。各プルキンエ細胞は単一の登上線維から強力な入力を受ける | Voogd et al. 2012, https://pmc.ncbi.nlm.nih.gov/articles/PMC3227528/ |
| 苔状線維終末 | 小脳小節 顆粒細胞 | 糸球（glomerulus）内でシナプス形成。興奮性（グルタミン酸作動性） | Altman & Bayer 1997, https://www.ncbi.nlm.nih.gov/books/NBK10865/ |
| 顆粒細胞 | 顆粒細胞（上行軸索） | 顆粒細胞の軸索が分子層へ上行する過程で他の顆粒細胞の樹状突起と接触する可能性あり | Eccles et al. 1967, https://en.wikipedia.org/wiki/Cerebellar_granule_cell |
| 顆粒細胞（上行軸索） | ゴルジ細胞 | 顆粒細胞の上行軸索がゴルジ細胞の頂樹状突起（apical dendrite）に興奮性シナプス形成。フィードバック回路 | Cesana et al. 2013, https://www.jneurosci.org/content/33/30/12430 |
| 顆粒細胞（平行線維） | プルキンエ細胞 | 平行線維が分子層でプルキンエ細胞の樹状突起棘にシナプス形成。各平行線維は3-5個のプルキンエ細胞に接触し、各プルキンエ細胞は数千の平行線維から入力を受ける。興奮性（グルタミン酸作動性） | Napper & Harvey 1988, https://en.wikipedia.org/wiki/Cerebellar_granule_cell |
| 顆粒細胞（平行線維） | バスケット細胞 | 平行線維がバスケット細胞を興奮。興奮性（グルタミン酸作動性） | Sultan & Bower 1998, https://www.frontiersin.org/journals/molecular-neuroscience/articles/10.3389/fnmol.2019.00267 |
| 顆粒細胞（平行線維） | ステラ細胞 | 平行線維がステラ細胞を興奮。興奮性（グルタミン酸作動性） | Sultan & Bower 1998, https://www.frontiersin.org/journals/molecular-neuroscience/articles/10.3389/fnmol.2019.00267 |
| 苔状線維終末 | ゴルジ細胞 | ゴルジ細胞の基底樹状突起（basal dendrite）に苔状線維がシナプス形成。フィードフォワード興奮 | Vos et al. 1999, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| ゴルジ細胞 | 顆粒細胞 | 糸球内でゴルジ細胞軸索が顆粒細胞樹状突起に抑制性シナプス形成。フィードバック抑制とフィードフォワード抑制の両方を実現。抑制性（GABA/グリシン作動性） | D'Angelo et al. 2013, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| 登上線維 | プルキンエ細胞 | 各プルキンエ細胞の樹状突起樹を登るように強力なシナプス形成。1対1の接続。"教師信号"として機能。興奮性（グルタミン酸作動性） | Ito 2006, https://www.ncbi.nlm.nih.gov/books/NBK10865/ |
| バスケット細胞 | プルキンエ細胞（細胞体・軸索起始部） | プルキンエ細胞の細胞体と軸索起始部周囲にバスケット様のシナプス複合体を形成。強力な抑制性入力。抑制性（GABA作動性） | Kawaguchi & Kubota 1998, https://www.nature.com/articles/s41598-025-09964-2 |
| ステラ細胞 | プルキンエ細胞（樹状突起） | プルキンエ細胞の樹状突起にシナプス形成。抑制性（GABA作動性） | Sultan 2000, https://www.nature.com/articles/s41598-025-09964-2 |
| プルキンエ細胞 | 前庭神経核（内側前庭神経核・上前庭神経核）(ROI外) | 小脳皮質からの唯一の出力。前庭神経核の大細胞部と小細胞部/舌下前核境界領域に投射。抑制性（GABA作動性） | Barmack et al. 1993, Blazquez et al. 2000, https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0164037 |
| 前庭神経核 (ROI外) | 動眼神経核（CN III）(ROI外) | 内側縦束（MLF）経由。同側性興奮性投射。VOR経路の一部 | Highstein & McCrea 1988, https://www.ncbi.nlm.nih.gov/books/NBK10987/ |
| 前庭神経核 (ROI外) | 外転神経核（CN VI）(ROI外) | 内側縦束（MLF）経由。対側性興奮性投射。VOR経路の一部 | Highstein & McCrea 1988, https://www.ncbi.nlm.nih.gov/books/NBK10987/ |
| 前庭神経核 (ROI外) | 滑車神経核（CN IV）(ROI外) | 内側縦束（MLF）経由。興奮性投射。VOR経路の一部 | Highstein & McCrea 1988, https://en.wikipedia.org/wiki/Medial_longitudinal_fasciculus |
| 前庭遠心性ニューロン (ROI外) | 小脳小節 | 両側性投射。顔面神経膝背側に位置。VOR調整に関与する可能性 | Sato et al. 2000, https://www.sciencedirect.com/science/article/abs/pii/S0006899300031176 |

---

## 補足説明

### 小脳小節の層構造
小脳小節は小脳皮質の一部であり、以下の3層構造を持つ：
1. **分子層（Molecular layer）**: 平行線維、バスケット細胞、ステラ細胞、プルキンエ細胞の樹状突起
2. **プルキンエ細胞層（Purkinje cell layer）**: プルキンエ細胞の細胞体
3. **顆粒細胞層（Granule layer）**: 顆粒細胞、ゴルジ細胞、苔状線維終末、糸球

### 主要な入力経路（ROI外からROI内）
1. **苔状線維（Mossy fibers）**:
   - 前庭神経核、橋底核、舌下神経周囲核群、傍正中束核からの入力
   - 顆粒細胞を興奮させる

2. **登上線維（Climbing fibers）**:
   - 下オリーブ核（β核、背内側細胞柱）からの入力
   - プルキンエ細胞に直接投射
   - 視覚誤差信号（retinal slip）を伝達

### 主要な出力経路（ROI内からROI外）
- **プルキンエ細胞軸索**: 前庭神経核（内側・上前庭神経核）への抑制性投射

### ROI内の情報処理回路
1. **興奮性経路**: 苔状線維 → 顆粒細胞 → 平行線維 → プルキンエ細胞
2. **抑制性フィードバック回路**: 顆粒細胞 → ゴルジ細胞 → 顆粒細胞
3. **フィードフォワード抑制**: 平行線維 → バスケット/ステラ細胞 → プルキンエ細胞
4. **教師信号**: 登上線維 → プルキンエ細胞（シナプス可塑性の誘導）

### VOR経路全体における小脳の位置
- **直接VOR経路**: 半規管 → 前庭神経 → 前庭神経核 → 外眼筋運動神経核
- **小脳経由経路**: 前庭神経核 ⇄ 小脳小節 ⇄ 前庭神経核（適応学習・ゲイン調整）

---

## 次のステップ
ステップ3に進み、これらのBIFに基づいてUniform Circuit（UC）を定義します。
