# HCD Diagram: Associative Memory in Hippocampus

本ファイルでは、海馬における連合記憶のHCDをMermaid形式で図示します。

## Mermaid Diagram

```mermaid
graph TD
    %% Styling
    classDef inputNode fill:#E8F4F8,stroke:#2E86AB,stroke-width:2px
    classDef roiNode fill:#B8E6B8,stroke:#2D6A2D,stroke-width:2px
    classDef outputNode fill:#FFE5B4,stroke:#D2691E,stroke-width:2px
    classDef inhibNode fill:#FFB3B3,stroke:#8B0000,stroke-width:2px
    
    %% Input Nodes (noROI input)
    LEC-L2[LEC-L2: Object and context information]:::inputNode
    MEC-L2[MEC-L2: Spatial information and grid cells]:::inputNode
    LEC-L3[LEC-L3: Contextual information]:::inputNode
    MEC-L3[MEC-L3: Spatial and temporal control signals]:::inputNode
    
    %% ROI Nodes (Within hippocampus)
    DG[DG: Pattern-separated representation]:::roiNode
    CA3-Pyr[CA3-Pyr: Associated stimulus pairs]:::roiNode
    CA3-IN[CA3-IN: Engram-specific inhibition]:::inhibNode
    CA1-Pyr[CA1-Pyr: Stabilized memory representation]:::roiNode
    CA1-PV[CA1-PV: Perisomatic inhibition]:::inhibNode
    CA1-SST[CA1-SST: Distal dendritic inhibition]:::inhibNode
    
    %% Output Nodes (noROI output)
    EC-L5[EC-L5: Object memory encoding]:::outputNode
    EC-L2/3[EC-L2/3: Memory recall support]:::outputNode
    
    %% Connections from Input to DG
    LEC-L2 -->|Object/context| DG
    MEC-L2 -->|Spatial| DG
    
    %% Connections from Input to CA3-Pyr
    LEC-L2 -->|Object/context| CA3-Pyr
    MEC-L2 -->|Spatial| CA3-Pyr
    
    %% Connections from DG
    DG -->|Pattern-separated| CA3-Pyr
    DG -->|Feedforward| CA3-IN
    
    %% Recurrent connection in CA3-Pyr
    CA3-Pyr -->|Pattern completion| CA3-Pyr
    
    %% CA3-Pyr and CA3-IN interactions
    CA3-Pyr -->|Excitation| CA3-IN
    CA3-IN -->|Selective inhibition| CA3-Pyr
    
    %% Connections from CA3-Pyr to CA1
    CA3-Pyr -->|Schaffer collateral| CA1-Pyr
    CA3-Pyr -->|Feedforward excitation| CA1-PV
    CA3-Pyr -->|Feedforward excitation| CA1-SST
    
    %% Direct input from EC Layer 3 to CA1
    MEC-L3 -->|Temporoammonic| CA1-Pyr
    LEC-L3 -->|Temporoammonic| CA1-Pyr
    
    %% CA1 interneuron inhibition
    CA1-PV -->|Perisomatic inhibition| CA1-Pyr
    CA1-SST -->|Distal dendritic inhibition| CA1-Pyr
    
    %% Output connections from CA1
    CA1-Pyr -->|Disynaptic feedback| EC-L5
    CA1-Pyr -->|Monosynaptic feedback| EC-L2/3
```

## 凡例（Legend）

### ノードの色分け

- **青色（Input Nodes）**: ROI外の入力源（noROI input）
  - `LEC-L2`: 外側嗅内皮質Layer 2
  - `MEC-L2`: 内側嗅内皮質Layer 2
  - `LEC-L3`: 外側嗅内皮質Layer 3
  - `MEC-L3`: 内側嗅内皮質Layer 3

- **緑色（ROI Nodes - Excitatory）**: ROI内の興奮性ニューロン
  - `DG`: 歯状回
  - `CA3-Pyr`: CA3錐体細胞
  - `CA1-Pyr`: CA1錐体細胞

- **赤色（ROI Nodes - Inhibitory）**: ROI内の抑制性介在ニューロン
  - `CA3-IN`: CA3介在ニューロン
  - `CA1-PV`: CA1パルブアルブミン陽性介在ニューロン
  - `CA1-SST`: CA1ソマトスタチン陽性介在ニューロン

- **オレンジ色（Output Nodes）**: ROI外の出力先（noROI output）
  - `EC-L5`: 嗅内皮質Layer 5
  - `EC-L2/3`: 嗅内皮質Layer 2/3

### 主要な接続経路

#### 1. Perforant Path（貫通路）
- `LEC-L2` → `DG`/`CA3-Pyr`
- `MEC-L2` → `DG`/`CA3-Pyr`
- 嗅内皮質から海馬への主要な入力経路

#### 2. Mossy Fiber Path（苔状線維）
- `DG` → `CA3-Pyr`
- Pattern separationされた情報をCA3に伝達

#### 3. Recurrent Collateral（リカレント側枝）
- `CA3-Pyr` → `CA3-Pyr`
- 連合記憶形成とPattern completionの基盤

#### 4. Schaffer Collateral Path（シャッファー側枝）
- `CA3-Pyr` → `CA1-Pyr`/`CA1-PV`/`CA1-SST`
- CA3からCA1への主要な出力経路

#### 5. Temporoammonic Path（側頭アンモン路）
- `MEC-L3`/`LEC-L3` → `CA1-Pyr`
- 嗅内皮質からCA1への直接入力

#### 6. Feedback Pathways（フィードバック経路）
- `CA1-Pyr` → `EC-L5`（Disynaptic経路）
- `CA1-Pyr` → `EC-L2/3`（Monosynaptic経路）
- 海馬から嗅内皮質へのフィードバック

## 情報処理の流れ

### エンコーディング（記憶形成）フロー
1. **入力**: `LEC-L2`/`MEC-L2` → `DG`/`CA3-Pyr`
2. **Pattern Separation**: `DG` → `CA3-Pyr`
3. **連合形成**: `CA3-Pyr` ↔ `CA3-Pyr`（リカレント）
4. **選択的抑制**: `CA3-Pyr` ↔ `CA3-IN`
5. **安定化**: `CA3-Pyr` → `CA1-Pyr`（+ `MEC-L3`/`LEC-L3`からの直接入力）
6. **抑制制御**: `CA1-PV`/`CA1-SST` → `CA1-Pyr`
7. **フィードバック**: `CA1-Pyr` → `EC-L5`/`EC-L2/3`

### 想起（リトリーバル）フロー
1. **部分手がかり**: `LEC-L2`/`MEC-L2` → `CA3-Pyr`（部分的活性化）
2. **Pattern Completion**: `CA3-Pyr` → `CA3-Pyr`（リカレント経路で完全なパターンを再構成）
3. **選択的抑制**: `CA3-IN` → `CA3-Pyr`（競合するエングラムを抑制）
4. **出力**: `CA3-Pyr` → `CA1-Pyr` → `EC-L5`/`EC-L2/3`

## Draw.ioへの変換について

本Mermaid図は、以下の方法でDraw.ioに変換できます：

1. **オンラインツールを使用**: Mermaid Live Editorなどで図を生成し、SVG/PNGとしてエクスポート後、Draw.ioにインポート

2. **手動での再作成**: 本Mermaid図を参考に、Draw.ioで手動で図を作成

3. **Mermaid plugin for Draw.io**: Draw.ioのMermaidプラグインを使用して直接変換

## 図の解釈

### 主要な計算ユニット

1. **DG**: 入口のゲートキーパー。類似記憶の干渉を防ぐ
2. **CA3-Pyr**: 連合記憶の心臓部。リカレント回路による連合形成とPattern completion
3. **CA3-IN**: 想起の精度向上。競合するエングラムの選択的抑制
4. **CA1-Pyr**: 記憶の安定化装置。短期記憶を長期記憶へ変換
5. **CA1-PV/SST**: 精密な抑制制御。スパイクタイミングとシナプス可塑性の調整

### 双方向性

図から明らかなように、海馬と嗅内皮質の間には双方向の情報フローがあります：
- **順方向**: 感覚・皮質情報を海馬に入力
- **逆方向**: 海馬で処理された記憶を皮質にフィードバック

この双方向性が、記憶のエンコーディング、固定化、想起の全プロセスを支えています。
