# HCD構造図（Mermaid形式）

以下のMermaidコードをdraw.ioなどのツールでレンダリングしてください。

```mermaid
graph TB
    %% ROI外UCの定義（入力）
    V1[V1<br/>Primary Visual Cortex<br/>基本視覚特徴]
    V2[V2<br/>Visual Area 2<br/>輪郭・テクスチャ]
    V3[V3<br/>Visual Area 3<br/>大域的運動]
    V4[V4<br/>Visual Area 4<br/>色・形態統合]
    MT[MT<br/>Middle Temporal Area<br/>視覚運動]
    IT[IT<br/>Inferior Temporal Cortex<br/>物体認識]
    Pulvinar[Pulvinar<br/>視床枕<br/>視覚リレー]
    FEF[FEF<br/>Frontal Eye Field<br/>注意制御]
    DLPFC[DLPFC<br/>Dorsolateral PFC<br/>ワーキングメモリ]

    %% ROI内UCの定義
    pIPS[pIPS<br/>Posterior IPS<br/>優先度マップ構築]
    mIPS[mIPS<br/>Middle IPS<br/>選択的注意]
    aIPS[aIPS<br/>Anterior IPS<br/>判断・確信度]

    %% ROI外UCの定義（出力）
    SC[SC<br/>Superior Colliculus<br/>サッカード実行]
    PMC[PMC<br/>Premotor Cortex<br/>運動準備]

    %% 視覚野からpIPSへの接続
    V1 -->|網膜位置対応的特徴マップ| pIPS
    V2 -->|複雑視覚特徴| pIPS
    V3 -->|大域的運動パターン| pIPS
    V4 -->|色・形態表現| pIPS
    MT -->|視覚運動情報| pIPS
    IT -->|物体同一性| pIPS
    Pulvinar -->|皮質下視覚経路| pIPS

    %% 前頭皮質からIPSへの接続
    FEF -->|注意制御信号| pIPS
    FEF -->|注意配分制御| mIPS
    FEF -->|探索終了制御| aIPS
    DLPFC -->|探索目標テンプレート| pIPS
    DLPFC -->|ワーキングメモリ| mIPS
    DLPFC -->|意思決定基準| aIPS

    %% IPS内部の順投射
    pIPS -->|空間的優先度マップ| mIPS
    mIPS -->|選択されたターゲット候補| aIPS

    %% IPS内部のフィードバック
    aIPS -->|探索調整フィードバック| mIPS
    aIPS -->|探索調整フィードバック| pIPS
    mIPS -->|注意状態フィードバック| pIPS

    %% pIPSから視覚野へのフィードバック
    pIPS -->|注意変調信号| V1
    pIPS -->|注意変調信号| V2
    pIPS -->|注意変調信号| V3
    pIPS -->|注意変調信号| V4
    pIPS -->|注意変調信号| MT

    %% IPSから前頭皮質へのフィードバック
    pIPS -->|初期優先度情報| FEF
    mIPS -->|注意優先マップ| FEF
    aIPS -->|検出信号・確信度| FEF
    aIPS -->|判断結果| DLPFC

    %% aIPSから運動系への出力
    aIPS -->|サッカード目標| SC
    aIPS -->|運動準備信号| PMC

    %% スタイル定義
    classDef roiNode fill:#4CAF50,stroke:#2E7D32,stroke-width:3px,color:#FFFFFF
    classDef inputNode fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#FFFFFF
    classDef outputNode fill:#FF9800,stroke:#E65100,stroke-width:2px,color:#FFFFFF
    classDef bothNode fill:#9C27B0,stroke:#6A1B9A,stroke-width:2px,color:#FFFFFF

    %% スタイル適用
    class pIPS,mIPS,aIPS roiNode
    class V1,V2,V3,V4,MT,IT,Pulvinar inputNode
    class SC,PMC outputNode
    class FEF,DLPFC bothNode
```

## 凡例

### ノードの色分け

- **緑色（濃い線）**: ROI内のUniform Circuit（pIPS, mIPS, aIPS）
- **青色**: ROI外の入力UC（視覚野、前頭皮質、皮質下構造）
- **オレンジ色**: ROI外の出力UC（運動系）
- **紫色**: ROI外の入出力両方を担うUC（FEF, DLPFC）

### 接続の意味

- **矢印**: 情報の流れの方向
- **ラベル**: 各接続で伝達される情報の内容（Output Semantics）

### 情報フローの主要経路

#### 順投射経路（視覚入力→判断→運動出力）
1. 視覚野（V1, V2, V3, V4, MT）→ pIPS → mIPS → aIPS → 運動系（SC, PMC）

#### フィードバック経路（探索の調整）
2. aIPS → mIPS → pIPS（IPS内部フィードバック）
3. pIPS/mIPS/aIPS → FEF/DLPFC（認知制御フィードバック）
4. pIPS → V1-MT（視覚処理の変調）

### Output Semanticsの要約

| UC | Output Semantics（出力情報の意味） |
|----|----------------------------------|
| pIPS | 視野全体の空間的優先度マップ（どこが重要か） |
| mIPS | 注意選択されたターゲット候補の重み付け（どれが候補か） |
| aIPS | ターゲット検出の判断と確信度（見つかったか、どれくらい確信できるか） |
| V1 | 基本視覚特徴（方位、空間周波数、色、輝度） |
| V2 | 複雑視覚特徴（輪郭、テクスチャ） |
| V3 | 大域的運動パターン |
| V4 | 色と形態の統合表現 |
| MT | 視覚運動の方向と速度 |
| IT | 物体カテゴリと同一性 |
| FEF | 注意制御信号、サッカード指令 |
| DLPFC | 探索目標テンプレート、タスクルール、意思決定基準 |
| Pulvinar | 皮質下視覚情報リレー |

## HCD構造の特徴

### 1. 階層的情報処理
pIPS → mIPS → aIPSという3段階の順投射により、視覚特徴統合→選択→判断という階層的処理が実現されています。

### 2. 多重フィードバックループ
単純な一方向処理ではなく、複数のフィードバックループにより、探索が動的に調整されます。

### 3. トップダウンとボトムアップの統合
視覚野からのbottom-up情報と、FEF/DLPFCからのtop-down制御が、IPS各段階で統合されます。

### 4. 並列入力と収束
複数の視覚野（V1-MT）が並列にpIPSに投射し、それらの情報が収束・統合されます。

### 5. 発散出力
aIPSからの出力は、認知制御（FEF, DLPFC）、視覚処理（pIPS, mIPS経由でV1-MT）、運動系（SC, PMC）へと発散します。

この構造により、知覚速度という認知能力が、視覚、注意、意思決定、運動を統合したシステムとして実現されています。
