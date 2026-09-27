# 2_BIF.md - Brain Information Flow（神経接続データベース）

## TLF: VOR (Vestibulo-Ocular Reflex)
## ROI: 小脳片葉複合体 (Floccular Complex)

---

## 神経接続一覧

| Sender | Receiver | Comment | Reference |
|--------|----------|---------|-----------|
| Semicircular Canals (ROI外) | Vestibular Ganglion (ROI外) | 半規管有毛細胞から前庭神経節への求心性投射。頭部回転に伴う角加速度信号を伝達 | Goldberg JM et al., 2012, The Vestibular System: A Sixth Sense |
| Vestibular Ganglion (ROI外) | Vestibular Nuclei (ROI外) | 前庭神経（CN VIII）による投射。頭部速度信号を前庭核へ伝達 | Highstein SM & Holstein GR, 2006, Prog Brain Res |
| Vestibular Nuclei (ROI外) | Granule Cells | 苔状線維による興奮性投射。頭部速度信号および眼球運動関連信号を伝達 | Lisberger SG & Fuchs AF, 1978, J Neurophysiol |
| Vestibular Nuclei (ROI外) | Oculomotor Nuclei (ROI外) | 内側縦束(MLF)経由の興奮性投射。VORの直接経路（3ニューロン弧）を構成 | Leigh RJ & Zee DS, 2015, The Neurology of Eye Movements |
| Retina (ROI外) | Accessory Optic System/NOT (ROI外) | 網膜神経節細胞からの投射。網膜スリップ（視覚誤差）信号を伝達 | Simpson JI et al., 1988, Ann NY Acad Sci |
| Accessory Optic System/NOT (ROI外) | Inferior Olive (ROI外) | 視覚誤差信号を下オリーブ核へ伝達 | Maekawa K & Simpson JI, 1973, J Neurophysiol |
| Inferior Olive (ROI外) | Purkinje Cells | 登上線維による興奮性投射。視覚誤差信号（教師信号）をプルキンエ細胞に伝達。複雑スパイクを誘発 | Ito M, 1982, Annu Rev Neurosci |
| Granule Cells | Purkinje Cells | 平行線維による興奮性投射。約10万本の平行線維が1つのプルキンエ細胞に収束。学習の主要部位 | Eccles JC et al., 1967, The Cerebellum as a Neuronal Machine |
| Granule Cells | Golgi Cells | 平行線維による興奮性投射。分子層でゴルジ細胞樹状突起にシナプス | D'Angelo E & De Zeeuw CI, 2009, Trends Neurosci |
| Granule Cells | Basket Cells | 平行線維による興奮性投射。分子層の籠細胞を興奮させる | Palay SL & Chan-Palay V, 1974, Cerebellar Cortex |
| Granule Cells | Stellate Cells | 平行線維による興奮性投射。分子層の星状細胞を興奮させる | Palay SL & Chan-Palay V, 1974, Cerebellar Cortex |
| Golgi Cells | Granule Cells | GABA作動性抑制投射。糸球体内で顆粒細胞樹状突起を抑制。フィードバック抑制回路 | Dugue GP et al., 2009, Neuron |
| Basket Cells | Purkinje Cells | GABA作動性抑制投射。プルキンエ細胞体と軸索起始部（AIS）を抑制。低周波フィルタリング | Ito M, 1984, The Cerebellum and Neural Control |
| Stellate Cells | Purkinje Cells | GABA作動性抑制投射。プルキンエ細胞樹状突起を抑制。高周波フィルタリング | Mittmann W et al., 2005, Nat Neurosci |
| Purkinje Cells | Vestibular Nuclei (ROI外) | GABA作動性抑制投射。内側前庭核（MVN）ニューロンを抑制。VORゲイン制御の出力経路 | Shin SL et al., 2011, PLoS ONE |
| Vestibular Nuclei (ROI外) | Abducens Nucleus (ROI外) | 興奮性投射。対側外転神経核へ投射し、水平性VORを実現 | McCrea RA et al., 1987, J Comp Neurol |
| Vestibular Nuclei (ROI外) | Oculomotor Nucleus (ROI外) | 興奮性投射。同側動眼神経核（内直筋支配）へ投射 | McCrea RA et al., 1987, J Comp Neurol |
| Oculomotor Nuclei (ROI外) | Extraocular Muscles (ROI外) | 運動ニューロン投射。外眼筋（内直筋、上直筋、下直筋、下斜筋）を支配 | Leigh RJ & Zee DS, 2015, The Neurology of Eye Movements |
| Abducens Nucleus (ROI外) | Extraocular Muscles (ROI外) | 運動ニューロン投射。外直筋を支配 | Leigh RJ & Zee DS, 2015, The Neurology of Eye Movements |

---

## 補足情報

### 苔状線維（Mossy Fiber）の起源
VOR関連の苔状線維は以下から供給される:
1. **前庭核**: 頭部速度信号（主要入力）
2. **舌下神経前位核（Nucleus Prepositus Hypoglossi）**: 眼球位置信号
3. **橋核**: 皮質からの下行性入力

### 登上線維（Climbing Fiber）の起源
- **下オリーブ核背側帽（Dorsal Cap）**: 水平方向の網膜スリップ信号
- **下オリーブ核腹外側突起**: 垂直方向の網膜スリップ信号

### 投射の性質
| 投射タイプ | 性質 | 神経伝達物質 |
|-----------|------|-------------|
| 苔状線維 → 顆粒細胞 | 興奮性 | グルタミン酸 |
| 平行線維 → プルキンエ細胞 | 興奮性 | グルタミン酸 |
| 登上線維 → プルキンエ細胞 | 興奮性 | グルタミン酸 |
| プルキンエ細胞 → 前庭核 | 抑制性 | GABA |
| ゴルジ細胞 → 顆粒細胞 | 抑制性 | GABA/グリシン |
| 籠細胞 → プルキンエ細胞 | 抑制性 | GABA |
| 星状細胞 → プルキンエ細胞 | 抑制性 | GABA |
