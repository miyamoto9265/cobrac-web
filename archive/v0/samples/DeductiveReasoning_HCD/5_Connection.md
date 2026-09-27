# ステップ4-1: Connectionの定義

BIFで特定した神経接続を、定義したUC間の接続として記述する。

## Connectionテーブル

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
| ------------------------ | -------------------------- | ------- | --------- |
| `HPC` | `RLPFC-Medial` | 海馬からmedial BA10への直接投射。関係性のエンコーディング情報（個別の関係A>B, B>Cなど）を伝達。エピソード記憶情報の統合。| Catani et al., 2023; https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2023.1214629/full |
| `MDT` | `RLPFC-Lateral` | MD視床核からlateral BA10への投射。統合された情報とcognitive control信号を提供。| Klein et al., 2010; https://pubmed.ncbi.nlm.nih.gov/20206702/ |
| `MDT` | `RLPFC-Medial` | MD視床核からmedial BA10への投射。Default mode network関連の統合情報を提供。| Klein et al., 2010; Topographic organization. |
| `PPC-SPL` | `RLPFC-Lateral` | 上頭頂小葉（BA7）からlateral RLPFCへの投射。空間的規則表現、距離・スケール・比率の構造的情報を提供。| Via superior longitudinal fasciculus (SLF). |
| `PPC-IPL` | `RLPFC-Lateral` | 下頭頂小葉（BA40）からlateral RLPFCへの投射。論理的議論の形式構造を維持する情報を提供。| Via arcuate fasciculus/SLF. |
| `DLPFC` | `RLPFC-Lateral` | DLPFCからlateral BA10への投射。作業記憶内容（中間推論結果、保持された前提）を提供。| Christoff et al., 2009; Contiguity principle. https://www.nature.com/articles/nrn2667 |
| `mPFC` | `RLPFC-Medial` | Medial PFC（BA8）からmedial BA10への投射。タスク文脈、目標状態、評価基準を提供。| Catani et al., 2023; Four streams model. |
| `dACC` | `RLPFC-Lateral` | 背側ACCからlateral RLPFCへの投射。エラーモニタリング信号、紛争検出情報を提供。推論過程での不整合検出。| Vogt & Pandya, 1987; dACC projections to rostrolateral PFC. |
| `BLA` | `mPFC` | 扁桃体基底外側核からmedial PFCへの投射。情動的顕著性・動機づけ情報を提供。| Etkin et al., 2015; https://pmc.ncbi.nlm.nih.gov/articles/PMC5549263/ |
| `RLPFC-Medial` | `RLPFC-Lateral` | Medial BA10からlateral BA10への投射。エピソード記憶情報と関係性表現をlateral領域での統合処理に提供。ROI内接続。| BA10内部の機能的連携。Medial（memory stream）からLateral（executive control）への情報フロー。|
| `RLPFC-Lateral` | `MDT` | Lateral BA10からMD視床核への投射（reciprocal）。統合された推論結果を視床にフィードバック。| Klein et al., 2010; Reciprocal connectivity. |
| `RLPFC-Medial` | `MDT` | Medial BA10からMD視床核への投射（reciprocal）。統合された文脈情報を視床にフィードバック。| Klein et al., 2010; Reciprocal connectivity. |
| `RLPFC-Lateral` | `DLPFC` | Lateral BA10からDLPFCへの投射。推論により得られた新規情報を作業記憶に更新。| Reciprocal PFC connections following contiguity. |
| `RLPFC-Lateral` | `dACC` | Lateral BA10から背側ACCへの投射。推論結果の妥当性・確信度情報を送信。モニタリングとエラー検出のため。| Reciprocal connections between RLPFC and dACC. |
| `RLPFC-Lateral` | `rACC` | Lateral BA10から吻側ACCへの投射。推論結果を情動的文脈で評価するための情報を送信。| Vogt & Pandya, 1987; RLPFC to rostral ACC. |
| `RLPFC-Lateral` | `PMC` | Lateral BA10から前運動野（BA6）への間接投射（connector hub経由）。推論結果に基づく行動選択・運動計画の情報を送信。| Passingham & Wise, 2012; https://www.sciencedirect.com/science/article/abs/pii/B9780128042816000136 |
| `RLPFC-Lateral` | `PPC-SPL` | Lateral BA10から上頭頂小葉への投射（reciprocal）。推論結果による規則表現の更新。| Reciprocal connectivity in frontoparietal network. |
| `RLPFC-Lateral` | `PPC-IPL` | Lateral BA10から下頭頂小葉への投射（reciprocal）。推論結果による形式構造表現の更新。| Reciprocal connectivity in frontoparietal network. |
| `DLPFC` | `CN` | DLPFCから尾状核への投射（frontostriatal pathway）。作業記憶に統合された情報を基に目標指向行動を実行。| Leh et al., 2007; https://www.sciencedirect.com/science/article/abs/pii/S0304394007004569 |
| `mPFC` | `BLA` | Medial PFCから扁桃体への投射（reciprocal, top-down control）。情動調整信号を送信。| Wang et al., 2024; https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2024.1331864/full |

## Connection構造の特徴

### 情報フローの方向性

**入力経路（ROI外 → ROI内）:**
1. 関係性情報: `HPC` → `RLPFC-Medial`
2. 規則情報: `PPC-SPL`, `PPC-IPL` → `RLPFC-Lateral`
3. 作業記憶: `DLPFC` → `RLPFC-Lateral`
4. タスク文脈: `mPFC` → `RLPFC-Medial`
5. 統合情報: `MDT` → `RLPFC-Lateral/Medial`
6. モニタリング: `dACC` → `RLPFC-Lateral`
7. 情動文脈: `BLA` → `mPFC` → `RLPFC-Medial`

**ROI内処理:**
- `RLPFC-Medial` → `RLPFC-Lateral`: 記憶情報の統合処理への提供

**出力経路（ROI内 → ROI外）:**
1. 作業記憶更新: `RLPFC-Lateral` → `DLPFC`
2. モニタリング: `RLPFC-Lateral` → `dACC`
3. 情動評価: `RLPFC-Lateral` → `rACC`
4. 行動選択: `RLPFC-Lateral` → `PMC`
5. 規則更新: `RLPFC-Lateral` → `PPC-SPL/IPL`
6. 視床フィードバック: `RLPFC-Lateral/Medial` → `MDT`

**行動実行経路:**
- `DLPFC` → `CN`: 意思決定への統合
- `mPFC` → `BLA`: 情動調整

### Connectionの性質

1. **Reciprocal connections（相互接続）**: 
   - `MDT` ⇄ `RLPFC-Lateral/Medial`
   - `DLPFC` ⇄ `RLPFC-Lateral`
   - `dACC` ⇄ `RLPFC-Lateral`
   - `PPC-SPL/IPL` ⇄ `RLPFC-Lateral`
   - `mPFC` ⇄ `BLA`

2. **Unidirectional connections（一方向接続）**:
   - `HPC` → `RLPFC-Medial` (入力のみ)
   - `RLPFC-Lateral` → `rACC` (出力のみ)
   - `RLPFC-Lateral` → `PMC` (出力のみ)
   - `DLPFC` → `CN` (出力のみ)

3. **Indirect connections（間接接続）**:
   - `BLA` → `mPFC` → `RLPFC-Medial` (情動情報の2ステップ伝達)
   - `RLPFC-Lateral` → (connector hub) → `PMC` (行動への間接的影響)

### 演繹推論における情報フロー

```
Step 1: 情報収集
[HPC: 関係性] → [RLPFC-Medial]
[PPC: 規則] → [RLPFC-Lateral]
[DLPFC: 作業記憶] → [RLPFC-Lateral]
[mPFC: 文脈] → [RLPFC-Medial]

Step 2: ROI内統合
[RLPFC-Medial: 文脈+関係] → [RLPFC-Lateral: 関係統合]

Step 3: 出力・フィードバック
[RLPFC-Lateral] → [DLPFC: 更新]
[RLPFC-Lateral] → [dACC: 検証]
[RLPFC-Lateral] → [PMC: 行動化]
```

## 次ステップ

ステップ4-2では、これらのConnectionに基づいて各UCのInterfaceを定義する。
