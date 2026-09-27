# 4_Connection.md - UC間接続定義

## 対象領域
- **ROI**: 小脳片葉（Cerebellar Flocculus）
- **TLF**: VOR（前庭動眼反射）の適応的制御

---

## Connection一覧

### ROI内接続

| Sender(UC) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `GrC` | `PC` | 興奮性接続。平行線維経由でグルタミン酸を放出。約20万本の平行線維が1つのPCに収束。単純スパイクの主要入力源。 | Eccles et al., 1967; Napper & Harvey, 1988 |
| `GrC` | `BC` | 興奮性接続。平行線維経由でバスケット細胞を活性化。側方抑制回路の駆動源。 | Palay & Chan-Palay, 1974 |
| `GrC` | `SC` | 興奮性接続。平行線維経由でステレート細胞を活性化。時間的精密な抑制を誘発。 | Palay & Chan-Palay, 1974 |
| `GrC` | `GoC` | 興奮性接続。上行軸索（基底樹状突起へ）と平行線維（尖端樹状突起へ）の両経路で接続。フィードバック抑制回路の駆動。 | Cesana et al., 2013; Jakab & Bhumbra, 2013 |
| `BC` | `PC` | 抑制性接続。GABA作動性。PC細胞体と軸索起始部を標的とし、出力を強力に抑制。低周波フィルタリング。 | Ango et al., 2004; Eyre & Bhumbra, 2025 |
| `SC` | `PC` | 抑制性接続。GABA作動性。PC樹状突起を標的とし、入力統合を調整。高周波フィルタリング。 | Jelitai et al., 2016; Kim et al., 2014 |
| `GoC` | `GrC` | 抑制性接続。GABA/グリシン作動性。グロメルルス内でGrC樹状突起を抑制。入力ゲイン制御と時間窓の調整。 | Dugue et al., 2009; D'Angelo et al., 2013 |

### ROI外からの入力接続

| Sender(UC) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `VN` (ROI外) | `GrC` | 興奮性接続。苔状線維経由。頭部速度、眼球運動信号を伝達。VORの主要入力経路。 | Barmack, 2003; Lisberger & Fuchs, 1978 |
| `IO` (ROI外) | `PC` | 興奮性接続。登上線維経由。視覚誤差信号（retinal slip）を伝達。複雑スパイクを誘発。教師信号として機能。 | Simpson et al., 1996; Ito, 2001 |

### ROI外への出力接続

| Sender(UC) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `PC` | `VN` (ROI外) | 抑制性接続。GABA作動性。FTN（Flocculus Target Neurons）を標的。VORゲインを調整。学習結果を反映。 | Lisberger et al., 1994; Stahl & Simpson, 1995 |

---

## 接続の機能的特性

### フィードフォワード経路（入力→出力）
```
VN → GrC → PC → VN
```
前庭信号が顆粒細胞を介してプルキンエ細胞に伝達され、プルキンエ細胞が前庭核を抑制することでVORゲインを調整。

### 登上線維経路（教師信号）
```
IO → PC
```
視覚誤差信号が登上線維を介してプルキンエ細胞に直接入力。平行線維-PC間シナプスの長期抑圧（LTD）を誘導。

### 側方抑制経路
```
GrC → BC/SC → PC
```
平行線維が分子層介在ニューロンを活性化し、周囲のプルキンエ細胞を抑制。空間的・時間的なコントラスト強調。

### フィードバック抑制経路
```
GrC → GoC → GrC
```
顆粒細胞がゴルジ細胞を活性化し、ゴルジ細胞が顆粒細胞を抑制。入力ゲインの自動調整。

---

## 参考文献

- Eccles JC, Ito M, Szentagothai J (1967) The Cerebellum as a Neuronal Machine. Springer
- Ito M (2001) Cerebellar long-term depression. Physiol Rev 81:1143-1195
- Lisberger SG et al. (1994) Neural basis for motor learning in the vestibuloocular reflex of primates. J Neurophysiol 72:928-953
- Simpson JI et al. (1996) The accessory optic system. Ann NY Acad Sci 781:119-148
- Cesana E et al. (2013) Granule cell ascending axon synapses onto Golgi cells. J Neurosci 33:12430-12446
