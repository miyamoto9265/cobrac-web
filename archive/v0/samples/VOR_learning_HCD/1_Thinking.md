# ステップ1: ROIとTLFの妥当性検証

## TLF: VOR学習（Vestibulo-Ocular Reflex Learning）

### VOR学習とは
前庭動眼反射（VOR）学習は、視覚フィードバックに基づいて前庭動眼反射のゲインや位相を適応的に変化させる運動学習の一種である。頭部運動時に視線を安定化させるための反射であるVORが、視覚入力と前庭入力の不一致（retinal slip error）を検出することで、その特性を調整していく。

### VOR学習の特徴
- **適応の二方向性**: ゲイン増加（gain-up）とゲイン減少（gain-down）の両方向で学習が可能
- **周波数選択性**: 訓練に使用した周波数で最大のゲイン変化が起こる（Broussard et al., 2020）
- **方向依存性**: 運動方向によって異なる学習メカニズムが働く可能性がある（Inoshita et al., 2017）
- **時間経過**: 急性期の学習と長期記憶の固定化では異なるメカニズムが関与する

## ROI: 小脳（Cerebellum）

### 小脳がVOR学習に適している理由

#### 1. 神経科学的証拠の豊富さ
小脳、特に片葉・傍片葉（flocculus/paraflocculus）は、VOR学習における最も重要な脳領域として広範な研究により実証されている。

- **Flocculus/Paraflocculusの役割**: 急性期および慢性期のVOR運動学習において異なる役割を果たす（Ito, 2004）
- **可塑性の実証**: 小脳皮質における長期抑圧（LTD）と長期増強（LTP）がVORゲイン変化を媒介することが実験的に示されている（Broussard & Titley, 2013）
- **誤差信号の統合**: 登上線維を介して誤差信号（retinal slip error）が小脳に伝達される（Najafi et al., 2024; Herzfeld et al., 2024）

#### 2. ROIの適切性評価

**結論: 小脳はVOR学習のROIとして適切である**

理由:
- VOR学習における小脳の必要性と十分性が損傷実験・薬理実験で実証されている
- 神経回路レベルでの可塑性メカニズムが詳細に解明されている
- 入力（感覚情報）から出力（運動指令調整）までの情報処理経路が明確である

### ROIの範囲の特定

VOR学習に関与する小脳領域として、以下を含む:

1. **小脳皮質**
   - Flocculus/Paraflocculus（片葉/傍片葉）- 主要領域
   - Granule cells（顆粒細胞）
   - Purkinje cells（プルキンエ細胞）
   - Molecular layer interneurons（分子層介在ニューロン: Basket cells, Stellate cells）
   - Golgi cells（ゴルジ細胞）

2. **小脳核**（本HCDではROI外として扱う可能性）
   - 関与する可能性はあるが、VOR学習の主要な可塑性部位ではない

### ROI_Input: ROIに入力される情報

VOR学習を実現するために小脳に入力される必要がある情報:

1. **前庭感覚入力（Mossy fiber経由）**
   - 前庭神経核（Vestibular nuclei）から
   - 頭部運動の速度・加速度情報
   
2. **視覚運動情報（Mossy fiber経由）**
   - 橋核（Pontine nuclei）から
   - 視覚的な運動情報（optic flow）
   
3. **眼球運動情報（Mossy fiber経由）**
   - 前庭神経核から
   - Efference copyとしての運動指令情報

4. **誤差信号（Climbing fiber経由）**
   - 下オリーブ核（Inferior olivary nucleus）から
   - Retinal slip error（網膜像のずれ）を符号化
   - 学習に必須の教師信号（Najafi et al., 2024; Herzfeld et al., 2024）

### ROI_Output: ROIから出力される情報

VOR学習を実現するために小脳から出力される情報:

1. **調整された運動指令（Purkinje cell出力経由）**
   - 前庭神経核（Vestibular nuclei）へ
   - プルキンエ細胞による抑制性投射
   - VORゲインを調整するための信号

2. **外眼筋への運動指令の調整**
   - 前庭神経核を介して外転神経核（Abducens nucleus）などへ
   - 最終的に眼球運動筋を制御

### ROIの情報処理フロー（概要）

```
[Mossy fiber inputs] → [Granule cells] → [Parallel fibers] → [Purkinje cells]
                                                                    ↑
                                              [Climbing fibers] ────┘
                                              （誤差信号・教師信号）

[Purkinje cells] → [Vestibular nuclei] → [Eye muscles]
```

## ステップ1の結論

**ROI（小脳）はTLF（VOR学習）を実現するのに適切である**

根拠:
1. 豊富な神経科学的証拠により、小脳がVOR学習の主要な部位であることが確立されている
2. 可塑性のメカニズム（LTD/LTP）が実験的に実証されている
3. 入力（感覚情報・誤差信号）と出力（運動指令調整）が明確に定義できる
4. 神経回路の解剖学的接続が詳細に解明されている

次のステップでは、これらの入出力を実現する神経接続を網羅的に調査し、BIF（Brain Information Flow）を構築する。

## 主要参考文献

1. Broussard, D. M., & Titley, H. K. (2020). Cerebellar Roles in Frequency Competitive Motor Learning of the Vestibulo-ocular Reflex. *Neuroscience*, 450, 225-237. https://www.sciencedirect.com/science/article/abs/pii/S0306452020305807

2. Najafi, F., et al. (2024). Climbing fibers provide essential instructive signals for associative learning. *Nature Neuroscience*. https://www.nature.com/articles/s41593-024-01594-7

3. Herzfeld, D. J., et al. (2024). Rapid Motor Adaptation via Population-level Modulation of Cerebellar Error Signals. *bioRxiv*. https://www.biorxiv.org/content/10.1101/2024.01.03.574031v1

4. Ito, M. (2004). Different roles of cerebellar flocculus in acute and chronic vestibuloocular reflex motor learning. *Japanese Journal of Physiology*, 54(S1), S34_3.

5. Inoshita, T., & Hirano, T. (2017). Mechanisms underlying vestibulo-cerebellar motor learning in mice depend on movement direction. *The Journal of Physiology*, 596(15), 3301-3319.

6. Suvrathan, A., et al. (2016). Timing Rules for Synaptic Plasticity Matched to Behavioral Function. *Neuron*, 92(5), 959-967.

7. Matsuno, H., et al. (2023). Developmental timing-dependent organization of synaptic connections between mossy fibers and granule cells in the cerebellum. *Communications Biology*, 6, 517. https://www.nature.com/articles/s42003-023-04825-y
