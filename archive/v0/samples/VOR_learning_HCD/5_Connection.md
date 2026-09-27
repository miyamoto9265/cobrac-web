# ステップ4: Connectionの定義とInterfaceの追加

## 4-1. Connectionの定義

BIFで特定した神経接続を、定義したUC間の接続として記述。

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
| ------------------------- | -------------------------- | ------- | --------- |
| `VN-input` | `GrC` | 前庭神経核から顆粒細胞へ苔状線維投射。前庭感覚情報（頭部運動速度・加速度）および眼球運動のefference copyを伝達。二次前庭求心性線維。 | Barmack, 2003; Springer Vestibulocerebellar Functional Connections |
| `PN` | `GrC` | 橋核から顆粒細胞へ苔状線維投射。視覚運動情報（optic flow）を伝達。大脳皮質の視覚野・前頭眼野からの情報を中継。 | Buttner-Ennever & Horn, 1997; Frontiers in Neural Circuits 2017 |
| `NOT-AOS` | `IO` | 視覚誤差信号処理領域から下オリーブ核へ投射。Retinal slip errorを符号化し、誤差信号生成のための視覚情報を提供。 | Escholarship AOS review; PMC Smooth Pursuit 2010 |
| `IO` | `PC` | 下オリーブ核からプルキンエ細胞へ登上線維投射。誤差信号（教師信号）を伝達し、複雑スパイクを誘発。平行線維-プルキンエ細胞シナプスの可塑性（LTD/LTP）を誘導。 | Najafi et al., 2024; Herzfeld et al., 2024; Wikipedia Climbing fiber |
| `GrC` | `PF` | 顆粒細胞の軸索が平行線維として分子層へ上昇。顆粒細胞で処理された感覚情報を平行線維ネットワークへ伝達。 | Wikipedia Parallel fiber; Frontiers in Synaptic Neuroscience 2016 |
| `PF` | `PC` | 平行線維からプルキンエ細胞樹状突起へ興奮性シナプス。感覚情報（前庭感覚・視覚運動）を伝達。シナプス可塑性の主要部位（LTD/LTP）。 | Frontiers in Synaptic Neuroscience 2016; Annual Reviews Neuroscience 2022 |
| `PF` | `BC` | 平行線維からBasket cellsへ興奮性入力。Lateral inhibition回路を駆動。 | Annual Reviews Neuroscience 2022; Lab 6 Cerebellar Cortex |
| `PF` | `SC` | 平行線維からStellate cellsへ興奮性入力。Lateral inhibition回路を駆動。 | Annual Reviews Neuroscience 2022; Lab 6 Cerebellar Cortex |
| `PF` | `GoC` | 平行線維からGolgi cellsへ興奮性入力。フィードバック抑制回路を形成。 | Frontiers in Cellular Neuroscience 2014; PMC Golgi Cells 2008 |
| `VN-input` | `GoC` | 前庭神経核から（苔状線維経由で）Golgi cellsへ興奮性入力。フィードフォワード抑制回路を形成。注: 苔状線維は顆粒細胞層でGolgi cellsとも接触。 | Frontiers in Cellular Neuroscience 2014; PMC Golgi Cells 2008 |
| `PN` | `GoC` | 橋核から（苔状線維経由で）Golgi cellsへ興奮性入力。フィードフォワード抑制回路を形成。注: 苔状線維は顆粒細胞層でGolgi cellsとも接触。 | Frontiers in Cellular Neuroscience 2014; PMC Golgi Cells 2008 |
| `GoC` | `GrC` | Golgi cellsから顆粒細胞へGABA作動性抑制。小脳糸球体内で接触。顆粒細胞-平行線維経路のゲイン調整。 | Frontiers in Cellular Neuroscience 2014; Wikipedia Glomerulus cerebellum |
| `BC` | `PC` | Basket cellsからプルキンエ細胞の軸索初節周囲へGABA作動性抑制。Lateral inhibitionを媒介し、プルキンエ細胞の出力を鋭敏化。 | Lab 6 Cerebellar Cortex; Frontiers in Molecular Neuroscience 2019 |
| `SC` | `PC` | Stellate cellsからプルキンエ細胞樹状突起へGABA作動性抑制。Lateral inhibitionを媒介し、樹状突起の情報統合を調整。 | Lab 6 Cerebellar Cortex; Frontiers in Molecular Neuroscience 2019 |
| `PC` | `VN-output` | プルキンエ細胞から前庭神経核へGABA作動性抑制性投射。VORゲインを調整し、適応的な運動指令を生成。Flocculus target neurons (FTNs)へ投射。 | Buttner-Ennever & Horn, 1997; Wiley 1995; NCBI VOR pathway |
| `VN-output` | `ABN` | 前庭神経核から外転神経核へ興奮性投射。Medial longitudinal fasciculus (MLF)経由。水平VORの運動出力。 | NCBI Neuroanatomy VOR; Neuroanatomy BS 13 |
| `VN-output` | `OMN` | 前庭神経核から動眼神経核へ投射。MLF経由。垂直・回旋VORの運動出力。 | NCBI Neuroanatomy VOR; NCBI Central Vestibular Pathways |
| `VN-output` | `TN` | 前庭神経核から滑車神経核へ投射。MLF経由。垂直・回旋VORの運動出力。 | NCBI Neuroanatomy VOR; NCBI Central Vestibular Pathways |

## 4-2. Interfaceの追加

3_UC.mdに戻り、ROI内の各UCのInterfaceを追加。形式: [Output1, Output2, ...] = UC名(Input1, Input2, ...)

| Circuit ID | Names | Comment | Interface |
| ---------- | ----- | ------- | --------- |
| `VN-input` | Vestibular nuclei (vestibular input source) | **ROI外: noROI(input)** - 前庭感覚入力源。前庭神経から一次前庭感覚を受け取り、小脳へ二次前庭求心性線維を送る。Medial, lateral, descending, superior vestibular nucleiを含む。頭部運動の速度・加速度情報および眼球運動のefference copyを符号化。 |  |
| `PN` | Pontine nuclei | **ROI外: noROI(input)** - 視覚運動情報入力源。大脳皮質の視覚野および前頭眼野からの情報を中継し、苔状線維として小脳へ投射。視覚的な運動情報（optic flow）を符号化。 |  |
| `NOT-AOS` | Nucleus of the optic tract / Accessory optic system | **ROI外: noROI(input)** - 視覚誤差信号入力源。網膜像のずれ（retinal slip）を検出し、下オリーブ核へ投射。遅い視覚運動に対して方向選択性を持つ。誤差信号を生成する前段階。 |  |
| `IO` | Inferior olivary nucleus | **ROI外: noROI(input)** - 誤差信号（教師信号）入力源。視覚誤差信号（retinal slip error）を統合し、登上線維を介してプルキンエ細胞へ投射。シナプス可塑性を誘導する教師信号を提供。Dorsomedial cell column, β-nucleusなどの亜核を含む。 |  |
| `GrC` | Granule cells | **ROI内** - 小脳皮質の顆粒細胞層に位置。苔状線維から前庭感覚および視覚運動情報を受け取り、軸索を平行線維として分子層へ送る。小脳皮質における唯一の興奮性介在ニューロン。感覚情報の符号化と拡散を担当。 | [`PF`] = `GrC`(`VN-input`, `PN`, `GoC`) |
| `GoC` | Golgi cells | **ROI内** - 顆粒細胞層に位置する抑制性介在ニューロン。苔状線維および平行線維から興奮性入力を受け、顆粒細胞へGABA作動性抑制を行う。フィードフォワードおよびフィードバック抑制を通じて、顆粒細胞-平行線維経路の時空間的ゲイン調整を担当。 | [`GrC`] = `GoC`(`VN-input`, `PN`, `PF`) |
| `PF` | Parallel fibers | **ROI内** - 顆粒細胞の軸索が分子層でT字型に分岐した線維。プルキンエ細胞樹状突起および分子層介在ニューロンへ興奮性入力を提供。感覚情報をプルキンエ細胞へ広範に伝達し、情報の結合（conjunction）を実現。 | [`PC`, `BC`, `SC`, `GoC`] = `PF`(`GrC`) |
| `BC` | Basket cells | **ROI内** - 分子層深部に位置する抑制性介在ニューロン。平行線維から興奮性入力を受け、プルキンエ細胞の軸索初節周囲へGABA作動性抑制を行う。Lateral inhibitionを媒介し、プルキンエ細胞の出力パターンを鋭敏化。 | [`PC`] = `BC`(`PF`) |
| `SC` | Stellate cells | **ROI内** - 分子層に位置する抑制性介在ニューロン。平行線維から興奮性入力を受け、プルキンエ細胞樹状突起へGABA作動性抑制を行う。Lateral inhibitionを媒介し、プルキンエ細胞の樹状突起における情報統合を調整。 | [`PC`] = `SC`(`PF`) |
| `PC` | Purkinje cells | **ROI内** - 小脳皮質の主要な出力ニューロン。平行線維から膨大な数の興奮性入力、登上線維から単一の強力な興奮性入力（誤差信号）、Basket/Stellate cellsから抑制性入力を受ける。前庭神経核へGABA作動性の抑制性投射を行い、VORゲインを調整。平行線維-プルキンエ細胞シナプスにおける可塑性（LTD/LTP）がVOR学習の主要メカニズム。 | [`VN-output`] = `PC`(`PF`, `IO`, `BC`, `SC`) |
| `VN-output` | Vestibular nuclei (output target) | **ROI外: noROI(output)** - VOR運動指令の調整を受ける出力先。プルキンエ細胞から抑制性投射を受け、外眼筋運動核（外転神経核、動眼神経核、滑車神経核）へ投射。VORゲインの最終的な調整を実現し、適応的な眼球運動を生成。`VN-input`と同一の前庭神経核だが、情報処理フロー上では出力として機能。 |  |
| `ABN` | Abducens nucleus | **ROI外: noROI(output)** - 外眼筋運動核の一つ。前庭神経核から興奮性入力を受け、外直筋（lateral rectus）を支配。水平方向のVORを実行。 |  |
| `OMN` | Oculomotor nucleus | **ROI外: noROI(output)** - 外眼筋運動核の一つ。前庭神経核から入力を受け、垂直および回旋方向の眼球運動を制御。 |  |
| `TN` | Trochlear nucleus | **ROI外: noROI(output)** - 外眼筋運動核の一つ。前庭神経核から入力を受け、上斜筋（superior oblique）を支配。垂直および回旋方向の眼球運動を制御。 |  |

## 注記

- ROI外のUCはInterfaceを空欄としている
- Interfaceは情報処理フローの方向性を明確に示している
- `GoC`は`GrC`への出力として記述されているが、これは抑制性の調整信号を意味する
- `BC`と`SC`も`PC`への出力として記述されているが、抑制性の調整信号
- すべてのUC名はバッククォートで囲んでいる

## 次のステップ

ステップ5では、各UCのOutput Semanticsを定義する。
