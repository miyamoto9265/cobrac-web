# 1_Thinking.md - HCD作成思考過程ログ

## TLFとROIの定義
- **TLF (Top Level Function)**: VOR (Vestibulo-Ocular Reflex, 前庭動眼反射)
- **ROI (Region of Interest)**: 小脳（特に片葉複合体: Floccular Complex）

---

## ステップ1: ROIとTLFの妥当性検証

### 1.1 VOR（前庭動眼反射）の定義
VORは、頭部が回転した際に眼球を反対方向に動かすことで、網膜上の像を安定させる反射である。これにより、頭部運動中も視覚的な安定性が維持される。

### 1.2 ROI_Input（小脳への入力情報）
VORを実現するために小脳に必要な入力情報:

1. **頭部回転速度信号**
   - 半規管で検出された頭部の角加速度/角速度情報
   - 前庭神経節を経由して前庭核へ、そこから苔状線維として小脳片葉に入力
   
2. **視覚誤差信号（網膜スリップ）**
   - 網膜上での像のずれ（retinal slip）を表すエラー信号
   - 副視覚系（AOS）/ 視索核（NOT）を経由して下オリーブ核へ
   - 下オリーブ核から登上線維として小脳片葉のプルキンエ細胞に入力

3. **眼球運動コピー信号（efference copy）**
   - 現在の眼球位置・速度に関する遠心性コピー
   - 苔状線維経由で小脳に入力

### 1.3 ROI_Output（小脳からの出力情報）
TLFから期待される出力情報:

1. **眼球運動指令の調節信号**
   - 片葉プルキンエ細胞から前庭核への抑制性出力
   - VORゲインの調節（増幅または減衰）
   - 適応的な眼球運動補正信号

### 1.4 小脳（片葉）がVOR実現に適している根拠

#### 解剖学的根拠
- 小脳片葉複合体（flocculus + paraflocculus）は、VOR制御の中枢として確立されている（Ito, 1982; Lisberger & Fuchs, 1978）
- 片葉は前庭核から直接苔状線維入力を受ける
- 片葉プルキンエ細胞は前庭核のVOR関連ニューロンに直接投射する

#### 機能的根拠
- 片葉損傷によりVOR適応が障害される（Robinson, 1976）
- 片葉プルキンエ細胞の活動はVOR中の眼球運動と相関する
- 登上線維は視覚誤差信号を伝達し、VOR学習を駆動する

#### 計算論的根拠
- 小脳はMarr-Albus-Itoモデルに基づく運動学習の場として理論的に支持されている
- 登上線維による誤差信号と苔状線維からの状態信号の統合により、適応学習が可能

### 1.5 妥当性検証の結論
**ROI（小脳片葉複合体）はTLF（VOR）の実現に適切である。**

理由:
1. 解剖学的に前庭系と眼球運動系の両方と接続している
2. VOR適応学習の必須構造として実験的に確認されている
3. 誤差駆動型学習を行う計算アーキテクチャを備えている

---

## ステップ2: BIF構築のための文献調査

### 2.1 主要な神経構造と接続

#### 入力系（ROI外）
| 構造 | 役割 |
|------|------|
| 半規管 (Semicircular Canals) | 頭部回転の検出 |
| 前庭神経節 (Vestibular Ganglion) | 前庭求心性神経の細胞体 |
| 前庭核 (Vestibular Nuclei) | VOR経路の中継核、学習部位 |
| 下オリーブ核 (Inferior Olive) | 登上線維の起源、誤差信号伝達 |
| 副視覚系/視索核 (AOS/NOT) | 網膜スリップの検出と伝達 |
| 眼球運動核 (Oculomotor Nuclei) | 眼筋への運動指令出力 |

#### 小脳皮質（ROI内）
| 構造 | 役割 |
|------|------|
| 顆粒細胞 (Granule Cells) | 苔状線維入力を受け、平行線維として出力 |
| プルキンエ細胞 (Purkinje Cells) | 小脳皮質の主要出力細胞、学習の場 |
| ゴルジ細胞 (Golgi Cells) | 顆粒細胞へのフィードバック抑制 |
| 籠細胞 (Basket Cells) | プルキンエ細胞への抑制（低周波フィルタ） |
| 星状細胞 (Stellate Cells) | プルキンエ細胞への抑制（高周波フィルタ） |

### 2.2 VOR神経回路の概要図

```
[入力系]
半規管 → 前庭神経節 → 前庭核 ──┬──→ 眼球運動核 → 外眼筋
                                │         ↑
                          苔状線維       │
                                ↓         │
                            顆粒細胞      │
                                ↓         │
                            平行線維      │
                                ↓         │
[小脳ROI]                  プルキンエ細胞 │
                              ↓↑          │
                    登上線維 ← 下オリーブ核 ← 視索核 ← 網膜
                                ↓
                            前庭核 ────────┘
```

### 2.3 主要文献
1. Ito M (1982) Cerebellar Control of the Vestibulo-Ocular Reflex. Annu Rev Neurosci
2. Lisberger SG (1994) Neural basis for motor learning in the vestibuloocular reflex of primates
3. Raymond JL, Lisberger SG (1998) Neural learning rules for the vestibulo-ocular reflex
4. Medina JF (2011) The multiple roles of Purkinje cells in sensori-motor calibration
5. Boyden ES et al. (2004) Cerebellum-dependent learning: the role of multiple plasticity mechanisms

---

## ステップ3-6の準備: UC候補の同定

### 小脳皮質（ROI内）のUC候補
1. `GrC` - 顆粒細胞 (Granule Cells)
2. `PC` - プルキンエ細胞 (Purkinje Cells)
3. `GoC` - ゴルジ細胞 (Golgi Cells)
4. `BC` - 籠細胞 (Basket Cells)
5. `SC` - 星状細胞 (Stellate Cells)

### ROI外のUC（入力）
- `VN_MF` - 前庭核からの苔状線維入力
- `IO_CF` - 下オリーブ核からの登上線維入力

### ROI外のUC（出力）
- `VN_OUT` - 前庭核（プルキンエ細胞の出力先）

---

## 調査の推論過程メモ

### VORの計算論的解釈
VORは以下の計算を実行している:
1. 頭部速度信号の検出（前庭器官）
2. 期待される眼球運動の生成（VORゲイン適用）
3. 実際の視覚結果との比較（誤差検出）
4. 誤差に基づく適応学習（ゲイン調整）

小脳片葉は特に2と4に関与:
- 前庭核からの頭部速度信号を処理
- 登上線維からの誤差信号に基づき、平行線維-プルキンエ細胞シナプスを可塑的に変化
- プルキンエ細胞出力で前庭核の活動を調節し、VORゲインを制御

### 学習メカニズムに関する考察
- 古典的理論: 登上線維の誤差信号がPF-PCシナプスのLTDを誘導
- 現代的理解: 複数の可塑性部位が存在（小脳皮質 + 前庭核）
- 周波数依存性: 低周波では単純スパイク信号、高周波では登上線維が重要
