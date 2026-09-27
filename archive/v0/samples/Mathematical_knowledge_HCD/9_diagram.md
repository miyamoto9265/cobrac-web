# HCD構造図（Mermaid形式）

## Mathematical Knowledge HCD

以下は、本HCDの構造を示すMermaid形式の有向グラフです。UCをノード、Connectionをエッジとして表現しています。

```mermaid
graph TB
    %% ノードの定義
    V1[V1: Primary Visual Cortex]
    V2[V2: Secondary Visual Cortex]
    V3[V3: Visual Area V3]
    V4[V4: Visual Area V4]
    pIPS[pIPS: Posterior IPS]
    aIPS[aIPS: Anterior IPS]
    FG[FG-math: Fusiform Gyrus Math Area]
    ITG[ITG-math: Inferior Temporal Gyrus Math Area]
    AG[AG: Angular Gyrus]
    dlPFC[dlPFC: Dorsolateral Prefrontal Cortex]
    LIPFC[LIPFC: Lateral Inferior Prefrontal Cortex]
    Pulvinar[Pulvinar: Thalamus]
    ACC[ACC: Anterior Cingulate Cortex]
    Hippocampus[Hippocampus]
    Striatum[Striatum]
    Broca[Broca Area]
    Wernicke[Wernicke Area]
    PMC[PMC: Premotor Cortex]
    
    %% スタイルの定義
    classDef roiNode fill:#4A90E2,stroke:#2E5C8A,stroke-width:3px,color:#fff
    classDef inputNode fill:#F5A623,stroke:#C17D11,stroke-width:2px,color:#fff
    classDef outputNode fill:#7ED321,stroke:#5FA319,stroke-width:2px,color:#fff
    classDef ioNode fill:#BD10E0,stroke:#8B0AA8,stroke-width:2px,color:#fff
    
    %% ノードへのスタイル適用
    class pIPS,aIPS,FG,ITG roiNode
    class V1,V2,V3,V4,Pulvinar,Hippocampus,Broca,Wernicke inputNode
    class AG,LIPFC,PMC outputNode
    class dlPFC,ACC,Striatum ioNode
    
    %% 視覚入力経路
    V1 -->|Luminance contrast; edge orientation| V2
    V2 -->|Color; shape; texture| V3
    V2 -->|Color; shape; texture| V4
    V3 -->|Shape contours; motion| V4
    V4 -->|Object color; complex shape| FG
    V4 -->|Higher-order visual features| ITG
    V2 -->|Visual features| pIPS
    V3 -->|Shape and spatial info| pIPS
    V4 -->|Object features and position| pIPS
    
    %% ROI内の接続
    FG <-->|IPS-FG tract: Number form and quantity| pIPS
    FG <-->|Visual-semantic integration| ITG
    pIPS <-->|Visual to abstract quantity| aIPS
    
    %% ROI内からROI外への出力
    ITG -->|Mathematical concepts| AG
    aIPS -->|Abstract quantity| AG
    aIPS -->|Quantity to working memory| LIPFC
    ITG -->|Concepts to working memory| LIPFC
    aIPS -->|Motor planning for response| PMC
    ITG -->|Concept-based motor response| PMC
    
    %% ROI外からROI内へのフィードバック
    AG -->|Retrieved facts| aIPS
    AG -->|Retrieved facts| ITG
    
    %% トップダウン制御
    dlPFC -->|Top-down attention control| pIPS
    dlPFC -->|Working memory control| aIPS
    dlPFC -->|Attention control| FG
    dlPFC -->|Concept retrieval control| ITG
    
    %% 認知制御
    ACC -->|Cognitive control signal| pIPS
    ACC -->|Cognitive control signal| aIPS
    pIPS -->|Cognitive load feedback| ACC
    aIPS -->|Cognitive load feedback| ACC
    
    %% 視床入力
    Pulvinar -->|Visual attention modulation| pIPS
    pIPS -->|Parietal to thalamus| Pulvinar
    
    %% エピソード記憶と文脈
    Hippocampus -->|Episodic memory; context| pIPS
    Hippocampus -->|Mathematical facts context| aIPS
    
    %% 報酬と強化学習
    Striatum -->|Reward signal| pIPS
    Striatum -->|Reward signal| aIPS
    pIPS -->|Parietal to basal ganglia| Striatum
    aIPS -->|Parietal to basal ganglia| Striatum
    
    %% 言語入力
    Broca -->|Syntactic structure only| pIPS
    Broca -->|Syntactic structure only| aIPS
    Wernicke -->|Linguistic math concepts| ITG
    Wernicke -->|Linguistic math info| FG
```

## 凡例

### ノードの色分け

- **青色（ROI内）**: pIPS, aIPS, FG-math, ITG-math
  - 数学的知識の中核的な表象を担うROI内のUniform Circuit

- **オレンジ色（ROI外・入力）**: V1, V2, V3, V4, Pulvinar, Hippocampus, Broca, Wernicke
  - ROI外からの入力を提供するUniform Circuit

- **緑色（ROI外・出力）**: AG, LIPFC, PMC
  - ROI内の処理結果を受け取り、さらなる処理を行うUniform Circuit

- **紫色（ROI外・入出力）**: dlPFC, ACC, Striatum
  - ROI内と双方向に情報をやり取りするUniform Circuit

### 主要な接続経路

1. **視覚入力経路**: V1 → V2 → V3/V4 → FG-math, ITG-math, pIPS
2. **IPS-FG白質路**: pIPS ↔ FG-math（双方向の直接接続）
3. **腹側側頭皮質内統合**: FG-math ↔ ITG-math
4. **IPS内階層処理**: pIPS ↔ aIPS
5. **事実検索経路**: ITG-math → AG, aIPS → AG
6. **作業記憶転送**: aIPS → LIPFC, ITG-math → LIPFC
7. **トップダウン制御**: dlPFC → pIPS, aIPS, FG-math, ITG-math
8. **認知制御**: ACC ↔ pIPS, aIPS

## グラフの読み方

- **矢印の向き**: 情報の流れる方向を示します
- **双方向矢印（↔）**: 相互作用とフィードバックを示します
- **エッジのラベル**: 伝達される情報の内容や性質を簡潔に記述しています

## 重要な情報フローの例

### 例1: 視覚的数学情報の処理
```
V1 → V2 → V4 → FG-math → pIPS → aIPS → AG → LIPFC
```
視覚入力から抽象的知識の検索、そして作業記憶への転送までの完全な経路。

### 例2: 数字形態と数量の統合
```
V4 → FG-math ↔ pIPS ↔ aIPS
```
FG-mathとpIPSの双方向接続（IPS-FG白質路）により、数字の視覚的形態と数量表象が統合される。

### 例3: 概念的知識の検索
```
V4 → FG-math ↔ ITG-math → AG
```
視覚的数学情報から概念的意味へ、そして事実検索へ。

### 例4: トップダウン制御による情報選択
```
dlPFC → pIPS, aIPS, FG-math, ITG-math
ACC → pIPS, aIPS
```
前頭前野からの制御信号により、注意が選択的に配分され、関連情報が活性化される。
