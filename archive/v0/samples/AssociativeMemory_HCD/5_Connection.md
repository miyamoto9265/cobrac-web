# ステップ4-1: Connectionの定義

本ファイルでは、BIFで特定した神経接続を、定義したUC間の接続として記述します。

## Connection表

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
| ------------------------- | -------------------------- | ------- | --------- |
| `LEC-L2` | `DG` | Perforant path経由。物体情報・文脈情報の入力。Pattern separationの素材を提供。 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| `MEC-L2` | `DG` | Perforant path経由。空間情報・grid cell活動の入力。Pattern separationの素材を提供。 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| `LEC-L2` | `CA3-Pyr` | Perforant path経由。物体情報を直接CA3に提供。連合形成の一方の刺激を提供。 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| `MEC-L2` | `CA3-Pyr` | Perforant path経由。空間情報を伝達し、CA3の時間的精度を調整。連合形成の一方の刺激を提供。 | Tsutsui et al., 2024, https://www.nature.com/articles/s41467-024-54943-2 |
| `DG` | `CA3-Pyr` | Mossy fiber投射。Pattern separationされた表現をCA3に伝達し、時間的順序形成を支援。Proximal dendriteに投射。 | Tsutsui et al., 2024, https://www.nature.com/articles/s41467-024-54943-2 |
| `DG` | `CA3-IN` | Mossy fiber投射。DGの活動がCA3介在ニューロンを活性化し、フィードフォワード抑制を生成。 | 推測（DG→CA3接続の一般的特性） |
| `CA3-Pyr` | `CA3-Pyr` | Recurrent collateral接続。Heteroassociative memoryの中核。異なる刺激間の連合をHebbian学習により形成。Pattern completionを実現。スパースで高精度な結合。 | Diamantaki et al., 2024, https://www.cell.com/cell/fulltext/S0092-8674(24)01338-2 |
| `CA3-Pyr` | `CA3-IN` | CA3錐体細胞が介在ニューロンを活性化。選択的抑制のための興奮性入力。Heterosynaptic plasticityによりエングラム特異的な抑制パターンを形成。 | Sanchez-Aguilera et al., 2025, https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1013267 |
| `CA3-IN` | `CA3-Pyr` | 選択的抑制。競合するエングラムを抑制し、想起すべき連合記憶のパターン補完を安定化。 | Sanchez-Aguilera et al., 2025, https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1013267 |
| `CA3-Pyr` | `CA1-Pyr` | Schaffer collateral投射。CA3で形成された連合記憶をCA1に伝達。CA1での記憶安定化の素材を提供。 | Pena et al., 2026, https://www.nature.com/articles/s42003-026-09577-z |
| `CA3-Pyr` | `CA1-PV` | Schaffer collateral投射。Feedforward inhibitionを生成し、CA1錐体細胞のスパイクタイミングを制御。 | Druckmann et al., 2019, https://www.janelia.org/publication/schaffer-collateral-inputs-to-ca1-excitatory-and-inhibitory-neurons-follow-different |
| `CA3-Pyr` | `CA1-SST` | Schaffer collateral投射。CA1錐体細胞のdistal dendriteでのシナプス可塑性を調整。 | Druckmann et al., 2019, https://www.janelia.org/publication/schaffer-collateral-inputs-to-ca1-excitatory-and-inhibitory-neurons-follow-different |
| `MEC-L3` | `CA1-Pyr` | Temporoammonic pathway経由。CA1の時間的コーディングを制御する教師信号。学習と表現更新を駆動。 | Yamamoto et al., 2025, https://www.nature.com/articles/s41467-025-61453-2 |
| `LEC-L3` | `CA1-Pyr` | Temporoammonic pathway経由。文脈情報をCA1に直接伝達。 | Witter et al., 2017, https://pubmed.ncbi.nlm.nih.gov/17765711/ |
| `CA1-PV` | `CA1-Pyr` | Perisomatic抑制。CA1錐体細胞のスパイクタイミングを精密に制御し、ネットワーク振動（theta）を調整。iLTDによる可塑性。 | Udakis et al., 2020, https://www.nature.com/articles/s41467-020-18074-8 |
| `CA1-SST` | `CA1-Pyr` | Distal dendritic抑制。CA1錐体細胞のシナプス可塑性とカルシウムシグナリングを制御。iLTPによる可塑性。 | Udakis et al., 2020, https://www.nature.com/articles/s41467-020-18074-8 |
| `CA1-Pyr` | `EC-L5` | Disynaptic pathway経由のフィードバック。CA1からSubiculumを経由してEC Layer 5へ。物体記憶エンコーディングを媒介（homosynaptic potentiation）。 | Igarashi et al., 2025, https://www.nature.com/articles/s41593-025-01883-9 |
| `CA1-Pyr` | `EC-L2/3` | Monosynaptic pathway経由のフィードバック。CA1から直接EC Layer 2/3へ。記憶想起を支援（heterosynaptic plasticity）。Feedforward inhibitionを生成。 | Igarashi et al., 2025, https://www.nature.com/articles/s41593-025-01883-9 |

## 注記

### BIFからConnectionへのマッピング
各Connectionは、2_BIF.mdで特定した解剖学的接続を、定義したUC間の接続にマッピングしたものです。多くの場合、BIFとConnectionは1対1で対応しますが、以下の例外があります：

1. **複数のBIFが1つのConnectionに統合**: 
   - 例: LEC Layer IIとMEC Layer IIの両方がDGに投射するBIFは、それぞれ独立したConnectionとして記述

2. **推測に基づくConnection**: 
   - `DG` → `CA3-IN`: DGからCA3への投射は錐体細胞だけでなく介在ニューロンにも投射すると推測されるが、直接的な文献は見つからなかった

### 連合記憶における重要なConnection
TLF（連合記憶）の実現において特に重要な接続：
- **`CA3-Pyr` → `CA3-Pyr`（リカレント）**: 連合形成の中核メカニズム
- **`DG` → `CA3-Pyr`**: Pattern separationにより連合の干渉を防ぐ
- **`CA3-IN` ↔ `CA3-Pyr`**: 選択的抑制によりパターン補完の精度を向上
- **`CA3-Pyr` → `CA1-Pyr`**: 形成された連合の安定化と出力
- **`CA1-Pyr` → `EC-L5`/`EC-L2/3`**: 形成された連合記憶のフィードバック

### 情報フローの概要
1. **入力**: `LEC-L2`/`MEC-L2` → `DG`/`CA3-Pyr`
2. **Pattern separation**: `DG` → `CA3-Pyr`
3. **連合形成**: `CA3-Pyr` → `CA3-Pyr`（リカレント）
4. **選択的抑制**: `CA3-Pyr` ↔ `CA3-IN`
5. **安定化**: `CA3-Pyr` → `CA1-Pyr`
6. **出力制御**: `CA1-PV`/`CA1-SST` → `CA1-Pyr`
7. **フィードバック**: `CA1-Pyr` → `EC-L5`/`EC-L2/3`
