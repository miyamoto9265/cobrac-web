# 4_Connection.md - UC間接続定義

## TLF: VOR (Vestibulo-Ocular Reflex)
## ROI: 小脳片葉複合体 (Floccular Complex)

---

## Connection一覧

| Sender(UC) | Receiver(UC) | Comment | Reference |
|------------|--------------|---------|-----------|
| `VN` | `GrC` | 苔状線維による興奮性投射。頭部速度信号、眼球位置信号を顆粒細胞に伝達 | Lisberger SG & Fuchs AF, 1978, J Neurophysiol |
| `VN` | `OMN` | 興奮性投射。VORの直接経路（3ニューロン弧）。頭部速度信号を眼球運動核に伝達 | Leigh RJ & Zee DS, 2015, The Neurology of Eye Movements |
| `IO` | `PC` | 登上線維による興奮性投射。視覚誤差信号（教師信号）を伝達し、複雑スパイクを誘発 | Ito M, 1982, Annu Rev Neurosci |
| `GrC` | `PC` | 平行線維による興奮性投射。約10万本の平行線維が収束。学習可塑性の主要部位（LTD/LTP） | Eccles JC et al., 1967, The Cerebellum as a Neuronal Machine |
| `GrC` | `GoC` | 平行線維による興奮性投射。分子層でゴルジ細胞を興奮させ、フィードバック回路を形成 | D'Angelo E & De Zeeuw CI, 2009, Trends Neurosci |
| `GrC` | `BC` | 平行線維による興奮性投射。籠細胞を興奮させる | Palay SL & Chan-Palay V, 1974, Cerebellar Cortex |
| `GrC` | `SC` | 平行線維による興奮性投射。星状細胞を興奮させる | Palay SL & Chan-Palay V, 1974, Cerebellar Cortex |
| `GoC` | `GrC` | GABA作動性抑制投射。顆粒層糸球体で顆粒細胞樹状突起を抑制。入力ゲイン制御 | Dugue GP et al., 2009, Neuron |
| `BC` | `PC` | GABA作動性抑制投射。プルキンエ細胞体・軸索起始部を抑制。低周波フィルタリング | Ito M, 1984, The Cerebellum and Neural Control |
| `SC` | `PC` | GABA作動性抑制投射。プルキンエ細胞樹状突起を抑制。高周波フィルタリング | Mittmann W et al., 2005, Nat Neurosci |
| `PC` | `VN` | GABA作動性抑制投射。前庭核ニューロンを抑制し、VORゲインを調節 | Shin SL et al., 2011, PLoS ONE |

---

## 接続の詳細説明

### 入力経路

#### 苔状線維経路（`VN` → `GrC`）
- 前庭核からの主要入力
- 伝達情報: 頭部速度信号、眼球位置信号（遠心性コピー）
- 特性: 高頻度発火、持続的な信号伝達

#### 登上線維経路（`IO` → `PC`）
- 下オリーブ核からの教師信号
- 伝達情報: 視覚誤差信号（網膜スリップ）
- 特性: 低頻度発火（1-2Hz）、複雑スパイク誘発、学習誘導

### 小脳皮質内回路

#### 興奮性経路
- `GrC` → `PC`: 学習の主要部位
- `GrC` → `BC`, `SC`: 抑制性介在ニューロンの駆動
- `GrC` → `GoC`: フィードバック回路形成

#### 抑制性経路
- `GoC` → `GrC`: 入力ゲイン制御、時間窓制御
- `BC` → `PC`: 低周波成分の抑制
- `SC` → `PC`: 高周波成分の抑制

### 出力経路

#### 小脳-前庭核経路（`PC` → `VN`）
- プルキンエ細胞の唯一の軸索出力
- 伝達情報: VORゲイン調節信号
- 特性: 持続的な抑制、学習に伴う変化

#### 前庭-眼球運動経路（`VN` → `OMN`）
- VOR直接経路（ROI外）
- 伝達情報: 眼球運動指令
- 特性: 高速、3シナプス

---

## 接続図（概念図）

```
[入力]                    [ROI: 小脳皮質]                    [出力]
                         ┌─────────────────┐
                         │     `SC`        │
                         │       ↓ (抑制)   │
`VN` ──苔状線維──→ `GrC` ──平行線維──→ `PC` ──────→ `VN` ──→ `OMN`
         ↑              │  ↑  ↓           │
         └──────────── `GoC` (抑制)       │
                         │       ↓ (抑制)   │
                         │     `BC`        │
                         └─────────────────┘
                                ↑
                        登上線維（教師信号）
                                │
                              `IO`
```
