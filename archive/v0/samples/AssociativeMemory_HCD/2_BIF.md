# ステップ2: BIF（Brain Information Flow）

本ファイルでは、ROI（海馬）内および海馬に関連する神経接続を網羅的に記録します。

## BIF表

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| Lateral Entorhinal Cortex (LEC) Layer II | Dentate Gyrus (DG) | Perforant path経由、物体・文脈情報を伝達 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| Medial Entorhinal Cortex (MEC) Layer II | Dentate Gyrus (DG) | Perforant path経由、空間情報・grid cell活動を伝達 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| Lateral Entorhinal Cortex (LEC) Layer II | CA3 | Perforant path経由、物体情報を直接伝達 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| Medial Entorhinal Cortex (MEC) Layer II | CA3 | Perforant path経由、空間情報を伝達し時間的精度を調整 | Tsutsui et al., 2024, https://www.nature.com/articles/s41467-024-54943-2 |
| Medial Entorhinal Cortex (MEC) Layer III | CA1 | Temporoammonic pathway (TA-CA1)経由、時間的コーディングを制御 | Yamamoto et al., 2025, https://www.nature.com/articles/s41467-025-61453-2 |
| Lateral Entorhinal Cortex (LEC) Layer III | CA1 | Temporoammonic pathway経由、文脈情報を伝達 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| Dentate Gyrus (DG) Granule Cells | CA3 Pyramidal Cells | Mossy fiber投射、時間的順序形成とパターン分離を支援。proximal dendriteに投射 | Tsutsui et al., 2024, https://www.nature.com/articles/s41467-024-54943-2; Gonzalez et al., 2025, https://www.biorxiv.org/content/10.1101/2025.02.14.638208v1.full |
| CA3 Pyramidal Cells | CA3 Pyramidal Cells | リカレント collateral接続、連合記憶のパターン補完と記憶形成を実現。スパースで高精度な結合 | Diamantaki et al., 2024, https://www.cell.com/cell/fulltext/S0092-8674(24)01338-2; Harnett et al., 2025, https://www.jneurosci.org/content/45/36/e0102252025.full.pdf |
| CA3 Pyramidal Cells | CA1 Pyramidal Cells | Schaffer collateral投射、記憶の安定化と空間学習に関与 | Pena et al., 2026, https://www.nature.com/articles/s42003-026-09577-z |
| CA3 Pyramidal Cells | CA1 Interneurons (PV+) | Schaffer collateral投射、フィードフォワード抑制を実現 | Druckmann et al., 2019, https://www.janelia.org/publication/schaffer-collateral-inputs-to-ca1-excitatory-and-inhibitory-neurons-follow-different |
| CA3 Pyramidal Cells | CA1 Interneurons (SST+) | Schaffer collateral投射、樹状突起の抑制制御 | Druckmann et al., 2019, https://www.janelia.org/publication/schaffer-collateral-inputs-to-ca1-excitatory-and-inhibitory-neurons-follow-different |
| CA1 Pyramidal Cells | Entorhinal Cortex (EC) Layer 5 | Disynaptic pathway経由、物体記憶エンコーディングを媒介 | Igarashi et al., 2025, https://www.nature.com/articles/s41593-025-01883-9 |
| CA1 Pyramidal Cells | Entorhinal Cortex (EC) Layer 2/3 | Monosynaptic pathway経由、記憶想起を支援しフィードフォワード抑制を生成 | Igarashi et al., 2025, https://www.nature.com/articles/s41593-025-01883-9 |
| CA1 Interneurons (PV+) | CA1 Pyramidal Cells | Perisomatic抑制、スパイクタイミング制御とネットワーク振動調整 | Udakis et al., 2020, https://www.nature.com/articles/s41467-020-18074-8 |
| CA1 Interneurons (SST+) | CA1 Pyramidal Cells | Distal dendritic抑制、シナプス可塑性とカルシウムシグナリング制御 | Udakis et al., 2020, https://www.nature.com/articles/s41467-020-18074-8 |
| CA3 Interneurons | CA3 Pyramidal Cells | 選択的抑制、競合するエングラムの抑制によりパターン補完を安定化 | Sanchez-Aguilera et al., 2025, https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1013267 |
| Perirhinal Cortex (PRC) | Lateral Entorhinal Cortex (LEC) | ROI外→ROI外。物体特徴情報と特徴間連合を伝達 | Suzuki & Amaral, 1994; 伝統的経路 |
| Perirhinal Cortex (PRC) | CA1 Interneurons | ROI外→ROI。選択的な介在ニューロン標的、物体認識の文脈制御 | Morrissey et al., 2017, https://pmc.ncbi.nlm.nih.gov/articles/PMC6617490/ |
| Endopiriform Cortex | CA1 (ventral) | ROI外→ROI。新奇性検出と既知刺激の抑制を調整 | Hao et al., 2025, https://elifesciences.org/articles/99642 |
| Basolateral Amygdala (BLA) | CA3 | ROI外→ROI。社会行動の調整 | Zhang et al., 2025, https://pmc.ncbi.nlm.nih.gov/articles/PMC12435738/ |

## 注記

### ROI外の組織
以下の組織はROI（海馬）外に位置します：
- **Lateral Entorhinal Cortex (LEC)**: 海馬への主要な入力源（物体・文脈情報）
- **Medial Entorhinal Cortex (MEC)**: 海馬への主要な入力源（空間情報）
- **Perirhinal Cortex (PRC)**: 物体特徴と連合の処理
- **Endopiriform Cortex**: 新奇性検出
- **Basolateral Amygdala (BLA)**: 情動と社会行動

### 海馬内の主要接続パターン
1. **入力段階**: EC → DG/CA3/CA1（Perforant path, Temporoammonic pathway）
2. **海馬内処理**: DG → CA3（Mossy fiber）、CA3 → CA3（Recurrent collateral）、CA3 → CA1（Schaffer collateral）
3. **フィードバック**: CA1 → EC（Disynaptic/Monosynaptic pathway）
4. **抑制制御**: Interneurons（PV+, SST+）による精密な抑制制御

### 連合記憶における重要な接続
特に連合記憶（TLF）の実現において重要な接続は以下の通り：
- **CA3リカレント接続**: 異なる刺激間の連合を形成するHebbian学習の基盤
- **DG → CA3（Mossy fiber）**: パターン分離により類似刺激を区別
- **CA3 → CA1（Schaffer collateral）**: 形成された連合の安定化と出力
- **CA3 Interneurons → CA3**: 選択的抑制によるパターン補完の精度向上
