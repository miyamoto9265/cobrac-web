# 2_BIF.md - Brain Information Flow（神経接続データベース）

## 対象領域
- **ROI**: 小脳片葉（Cerebellar Flocculus）
- **TLF**: VOR（前庭動眼反射）の適応的制御

---

## 神経接続一覧

### ROI内接続（小脳皮質内）

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 苔状線維 (Mossy fiber) | 顆粒細胞 (Granule cell) | 興奮性、グロメルルス内でシナプス形成、前庭・運動情報を伝達 | D'Angelo & De Zeeuw, 2009; Billings et al., 2014 |
| 顆粒細胞 (Granule cell) | プルキンエ細胞 (Purkinje cell) | 興奮性、平行線維経由、グルタミン酸作動性 | Eccles et al., 1967; Ito, 2006 |
| 顆粒細胞 (Granule cell) | バスケット細胞 (Basket cell) | 興奮性、平行線維経由 | Palay & Chan-Palay, 1974 |
| 顆粒細胞 (Granule cell) | ステレート細胞 (Stellate cell) | 興奮性、平行線維経由 | Palay & Chan-Palay, 1974 |
| 顆粒細胞 (Granule cell) | ゴルジ細胞 (Golgi cell) | 興奮性、上行軸索と平行線維の両方で接続 | Cesana et al., 2013; Jakab & Bhaumik, 2013 |
| 登上線維 (Climbing fiber) | プルキンエ細胞 (Purkinje cell) | 興奮性、1対1の強力な接続、複雑スパイクを誘発、誤差信号を伝達 | Ito, 2001; Lisberger, 1988 |
| バスケット細胞 (Basket cell) | プルキンエ細胞 (Purkinje cell) | 抑制性、GABA作動性、細胞体と軸索起始部を標的（pinceau構造） | Ango et al., 2004; Eyre & Bhumbra, 2025 |
| ステレート細胞 (Stellate cell) | プルキンエ細胞 (Purkinje cell) | 抑制性、GABA作動性、樹状突起を標的 | Palay & Chan-Palay, 1974; Jelitai et al., 2016 |
| ゴルジ細胞 (Golgi cell) | 顆粒細胞 (Granule cell) | 抑制性、GABA/グリシン作動性、グロメルルス内でフィードバック抑制 | Dugue et al., 2009; D'Angelo et al., 2013 |

### ROI外からの入力接続

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 前庭核 (Vestibular nuclei) (ROI外) | 苔状線維 (Mossy fiber) | 内側・上・下行前庭核から、頭部速度情報を伝達 | Barmack, 2003; Balaban et al., 1981 |
| 下オリーブ核 (Inferior olive) (ROI外) | 登上線維 (Climbing fiber) | 視覚誤差信号（retinal slip）を伝達、副視索系経由 | Simpson et al., 1996; Graf et al., 1988 |
| 前前庭核 (Prepositus hypoglossi) (ROI外) | 苔状線維 (Mossy fiber) | 眼球位置・速度信号を伝達 | McFarland & Fuchs, 1992 |

### ROI外への出力接続

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| プルキンエ細胞 (Purkinje cell) | 前庭核 (Vestibular nuclei) (ROI外) | 抑制性、GABA作動性、VORゲイン調整、FTN（Flocculus Target Neurons）を標的 | Lisberger et al., 1994; Stahl & Simpson, 1995 |

---

## 接続の補足情報

### 苔状線維の起源
苔状線維は複数の源から小脳片葉に投射する：
- **前庭核**（主要な入力源）: 頭部速度、角加速度情報
- **前前庭核（NPH）**: 眼球位置・速度情報
- **橋核**: 皮質からの運動指令

### 登上線維の特性
- **起源**: 下オリーブ核（背側帽、内側副オリーブ）
- **機能**: 教師信号として機能、視覚誤差（retinal slip）を伝達
- **特性**: 1 Hz程度の低頻度発火、複雑スパイクを誘発

### プルキンエ細胞の出力先
小脳片葉のプルキンエ細胞は5つのゾーンに分かれ、異なる前庭核に投射：
- Zone 1, 3 → 上前庭核 (SVN)
- Zone 2, 4 → 内側前庭核 (MVN)
- Zone 5 → 小脳核（後位核）

### 分子層介在ニューロンの機能分化
- **バスケット細胞**: 分子層下部、低周波応答をフィルタリング
- **ステレート細胞**: 分子層上部、高周波応答をフィルタリング
- 両者は相補的に働き、プルキンエ細胞の出力周波数帯域を制御

---

## 参考文献

- Ito M (2001) Cerebellar long-term depression: characterization, signal transduction, and functional roles. Physiol Rev 81:1143-1195
- Lisberger SG (1988) The neural basis for learning of simple motor skills. Science 242:728-735
- Simpson JI et al. (1996) The accessory optic system. Ann NY Acad Sci 781:119-148
- D'Angelo E, De Zeeuw CI (2009) Timing and plasticity in the cerebellum: focus on the granular layer. Trends Neurosci 32:30-40
- Stahl JS, Simpson JI (1995) Dynamics of abducens nucleus neurons in the awake rabbit. J Neurophysiol 73:1383-1395
- Cesana E et al. (2013) Granule cell ascending axon excitatory synapses onto Golgi cells. J Neurosci 33:12430-12446
