# 7_diagram.md - HCD構造図

## 基本情報
- **ROI**: 海馬（Hippocampus）
- **TLF**: 自己位置推定

---

## HCD図（Mermaid形式）

```mermaid
flowchart TD
    subgraph Legend[Color Legend]
        direction LR
        L1[ROI Input]:::inputStyle
        L2[ROI Internal]:::roiStyle
        L3[ROI Output]:::outputStyle
    end

    subgraph Input[ROI Input Sources]
        MEC[MEC: Medial Entorhinal Cortex]:::inputStyle
        LEC[LEC: Lateral Entorhinal Cortex]:::inputStyle
        ATN[ATN: Anterior Thalamic Nuclei]:::inputStyle
        MS[MS: Medial Septum]:::inputStyle
    end

    subgraph ROI[ROI: Hippocampus]
        DG[DG: Dentate Gyrus]:::roiStyle
        CA3[CA3: Hippocampal CA3]:::roiStyle
        CA1[CA1: Hippocampal CA1]:::roiStyle
        SUB[SUB: Subiculum]:::roiStyle
    end

    subgraph Output[ROI Output Targets]
        MB[MB: Mammillary Body]:::outputStyle
        ATN_out[ATN_out: Anterior Thalamus]:::outputStyle
        ACC[ACC: Cingulate Cortex]:::outputStyle
        NAc[NAc: Nucleus Accumbens]:::outputStyle
    end

    %% Input to DG
    MEC -->|Grid and Head Direction Signal| DG
    LEC -->|Context and Object Signal| DG
    MS -->|Theta Rhythm Modulation| DG

    %% Input to CA3
    MEC -->|Spatial Periodic Signal| CA3
    LEC -->|Context Signal| CA3
    MS -->|Theta Rhythm Modulation| CA3

    %% DG to CA3
    DG -->|Pattern Separated Sparse Code| CA3

    %% CA3 recurrent
    CA3 -->|Pattern Completion via Recurrent| CA3

    %% CA3 to CA1
    CA3 -->|Completed Spatial Pattern| CA1

    %% Direct input to CA1
    MEC -->|Grid Signal Direct Path| CA1
    LEC -->|Context Signal Direct Path| CA1
    ATN -->|Head Direction Feedback| CA1
    MS -->|Theta Rhythm Modulation| CA1

    %% CA1 to SUB
    CA1 -->|Place Cell Activity| SUB

    %% SUB to Output
    SUB -->|Place and Direction Info| MB
    SUB -->|Head Direction Update| ATN_out
    SUB -->|Route and Path Info| ACC
    SUB -->|Reward Location Info| NAc

    %% Styles
    classDef inputStyle fill:#90EE90,stroke:#228B22,stroke-width:2px,color:#000
    classDef roiStyle fill:#87CEEB,stroke:#4169E1,stroke-width:3px,color:#000
    classDef outputStyle fill:#FFB6C1,stroke:#DC143C,stroke-width:2px,color:#000
```

---

## 図の説明

### 色分け凡例

| 色 | 意味 | 対応要素 |
| -- | ---- | -------- |
| 緑（#90EE90） | ROI Input（入力源） | MEC, LEC, ATN, MS |
| 青（#87CEEB） | ROI Internal（海馬内UC） | DG, CA3, CA1, SUB |
| ピンク（#FFB6C1） | ROI Output（出力先） | MB, ATN_out, ACC, NAc |

### 主要情報フロー

1. **三シナプス回路**: MEC/LEC → DG → CA3 → CA1 → SUB
2. **直接経路**: MEC/LEC → CA1（temporoammonic pathway）
3. **再帰的処理**: CA3 → CA3（recurrent collaterals）
4. **出力分配**: SUB → MB, ATN_out, ACC, NAc

### エッジラベル（Output Semantics）

| 接続 | ラベル（Output Semantics） |
| ---- | -------------------------- |
| MEC → DG | Grid and Head Direction Signal |
| LEC → DG | Context and Object Signal |
| MS → DG/CA3/CA1 | Theta Rhythm Modulation |
| DG → CA3 | Pattern Separated Sparse Code |
| CA3 → CA3 | Pattern Completion via Recurrent |
| CA3 → CA1 | Completed Spatial Pattern |
| MEC → CA1 | Grid Signal Direct Path |
| ATN → CA1 | Head Direction Feedback |
| CA1 → SUB | Place Cell Activity |
| SUB → MB | Place and Direction Info |
| SUB → ATN_out | Head Direction Update |
| SUB → ACC | Route and Path Info |
| SUB → NAc | Reward Location Info |

---

## draw.io変換用ノート

Mermaid形式のダイアグラムをdraw.ioで開くには：

1. draw.ioを開く
2. 「Arrange」→「Insert」→「Advanced」→「Mermaid」を選択
3. 上記のMermaidコードを貼り付け
4. 必要に応じてレイアウトを調整

または、Mermaid Live Editor（https://mermaid.live/）でSVG/PNGにエクスポートし、draw.ioにインポートすることも可能。
