# HCD図: 海馬における自己位置推定

## Mermaid形式のHCD図

以下の図は、海馬における自己位置推定のHypothetical Component Graphを表現しています。

### 完全版HCD図

```mermaid
graph TB
    %% 入力ノード（ROI外）
    MEC_IN["MEC_IN<br/>内側嗅内皮質<br/>(グリッド細胞情報)"]
    LEC_IN["LEC_IN<br/>外側嗅内皮質<br/>(環境特徴)"]
    MS_IN["MS_IN<br/>内側中隔核<br/>(シータリズム)"]
    
    %% 海馬内部ノード（ROI内）
    DG["DG<br/>歯状回<br/>パターン分離"]
    CA3["CA3<br/>CA3錐体細胞<br/>連想記憶"]
    CA1["CA1<br/>CA1錐体細胞<br/>自己位置推定"]
    SUB["SUB<br/>海馬台<br/>出力変換"]
    
    %% 出力先（ROI外）
    OUT_EC["出力: 嗅内皮質"]
    OUT_PFC["出力: 前頭前皮質"]
    OUT_OTHER["出力: 視床/線条体"]
    
    %% 入力からDGへの接続
    MEC_IN -->|周期的空間符号| DG
    LEC_IN -->|環境文脈| DG
    MS_IN -->|時間的調節| DG
    
    %% 入力からCA3への接続
    MEC_IN -->|直接投射| CA3
    LEC_IN -->|直接投射| CA3
    MS_IN -->|シータ調節| CA3
    
    %% DGからCA3への接続（苔状線維）
    DG -->|分離パターン| CA3
    
    %% CA3の反回性接続
    CA3 -->|パターン補完| CA3
    
    %% CA3からCA1への接続（シャファー側枝）
    CA3 -->|連想表現| CA1
    
    %% 入力からCA1への接続（側頭アンモン路）
    MEC_IN -->|感覚入力| CA1
    LEC_IN -->|文脈入力| CA1
    MS_IN -->|シータ調節| CA1
    
    %% CA1からSUBへの接続
    CA1 -->|位置推定| SUB
    
    %% SUBからの出力
    SUB --> OUT_EC
    SUB --> OUT_PFC
    SUB --> OUT_OTHER
    
    %% スタイル定義
    classDef inputNode fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef hippoNode fill:#fff9c4,stroke:#f57f17,stroke-width:3px
    classDef outputNode fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    
    class MEC_IN,LEC_IN,MS_IN inputNode
    class DG,CA3,CA1,SUB hippoNode
    class OUT_EC,OUT_PFC,OUT_OTHER outputNode
```

---

## 簡略版HCD図（主要経路のみ）

三シナプス経路を中心とした簡略版：

```mermaid
graph LR
    %% 入力
    INPUT["入力<br/>MEC/LEC<br/>(空間・環境情報)"]
    
    %% 海馬内部（三シナプス経路）
    DG["DG<br/>パターン分離"]
    CA3["CA3<br/>連想記憶"]
    CA1["CA1<br/>位置推定"]
    SUB["SUB<br/>出力変換"]
    
    %% 出力
    OUTPUT["出力<br/>(行動・記憶)"]
    
    %% 主要経路
    INPUT --> DG
    DG --> CA3
    CA3 --> CA1
    CA1 --> SUB
    SUB --> OUTPUT
    
    %% スタイル
    classDef hippo fill:#fff9c4,stroke:#f57f17,stroke-width:3px
    classDef io fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    
    class DG,CA3,CA1,SUB hippo
    class INPUT,OUTPUT io
```

---

## 並行経路を強調したHCD図

三つの並行経路を明示：

```mermaid
graph TB
    %% 入力
    EC_L2["嗅内皮質<br/>Layer II"]
    EC_L3["嗅内皮質<br/>Layer III"]
    MS["内側中隔核"]
    
    %% 海馬
    DG["DG"]
    CA3["CA3"]
    CA1["CA1"]
    
    %% 三シナプス経路（経路1）
    EC_L2 -->|経路1: 三シナプス| DG
    DG --> CA3
    
    %% 直接経路（経路2）
    EC_L2 -->|経路2: 直接| CA3
    
    %% CA3からCA1
    CA3 --> CA1
    
    %% 側頭アンモン路（経路3）
    EC_L3 -->|経路3: 側頭アンモン| CA1
    
    %% 調節
    MS -.->|シータ| DG
    MS -.->|シータ| CA3
    MS -.->|シータ| CA1
    
    %% CA3反回性
    CA3 -->|自己連想| CA3
    
    style EC_L2 fill:#b3e5fc
    style EC_L3 fill:#b3e5fc
    style MS fill:#c5cae9
    style DG fill:#fff9c4
    style CA3 fill:#fff9c4
    style CA1 fill:#fff59d
```

---

## 機能的視点のHCD図

各UCの計算機能を強調：

```mermaid
graph TB
    subgraph INPUT ["入力情報"]
        MEC["グリッド細胞<br/>(どこに移動?)"]
        LEC["環境特徴<br/>(何がある?)"]
        MS["行動状態<br/>(今は何中?)"]
    end
    
    subgraph PROCESSING ["海馬の情報処理"]
        DG["パターン分離<br/>類似環境を区別"]
        CA3["連想記憶<br/>部分→全体復元"]
        CA1["位置推定<br/>予測と感覚の統合"]
    end
    
    subgraph OUTPUT ["出力"]
        SUB["行動制御<br/>記憶更新"]
    end
    
    MEC --> DG
    LEC --> DG
    MS --> DG
    
    MEC --> CA3
    LEC --> CA3
    MS --> CA3
    
    DG --> CA3
    CA3 --> CA3
    
    CA3 --> CA1
    MEC --> CA1
    LEC --> CA1
    MS --> CA1
    
    CA1 --> SUB
    
    style DG fill:#ffccbc
    style CA3 fill:#ffe0b2
    style CA1 fill:#fff9c4
    style SUB fill:#c5e1a5
```

---

## 時間的ダイナミクスを含むHCD図

記憶の符号化と想起のモード：

```mermaid
stateDiagram-v2
    [*] --> Exploration: 新規環境
    [*] --> Recall: 既知環境
    
    state Exploration {
        [*] --> DG_encode
        DG_encode --> CA3_encode: 分離パターン
        CA3_encode --> CA1_encode: 新規連想
        CA1_encode --> [*]: 記憶形成
        
        state "DG: 高活性" as DG_encode
        state "CA3: 学習モード" as CA3_encode
        state "CA1: LTP" as CA1_encode
    }
    
    state Recall {
        [*] --> DG_recall
        DG_recall --> CA3_recall: 手がかり
        CA3_recall --> CA1_recall: パターン補完
        CA1_recall --> [*]: 位置推定
        
        state "DG: 低活性" as DG_recall
        state "CA3: 想起モード" as CA3_recall
        state "CA1: 統合" as CA1_recall
    }
    
    Exploration --> Recall: 環境学習完了
    Recall --> Exploration: 環境変化検出
```

---

## 使用方法

### Draw.ioへの変換

上記のMermaid形式の図は、以下の方法でDraw.ioで使用できます：

1. **オンラインツール使用**:
   - https://mermaid.live/ でMermaidコードを入力
   - SVGまたはPNG形式でエクスポート
   - Draw.ioにインポート

2. **Draw.io直接使用**:
   - Draw.ioは一部Mermaidをサポート
   - または手動で上記の構造を再現

3. **推奨される図の使用**:
   - **発表用**: 簡略版または機能的視点図
   - **詳細説明用**: 完全版HCD図
   - **メカニズム説明用**: 並行経路強調図
   - **動的プロセス説明用**: 時間的ダイナミクス図

---

## 図の解釈ガイド

### ノードの色分け
- **青系（水色）**: 入力（ROI外からの情報源）
- **黄色系**: 海馬内部のUC（ROI内の情報処理）
- **紫系**: 出力（ROI外への情報配信）

### エッジ（矢印）の意味
- **実線矢印**: 興奮性の神経投射
- **点線矢印**: 調節性の入力（抑制を含む）
- **自己ループ**: 反回性接続（CA3 → CA3）

### 情報の流れ
1. **順方向**: 入力 → DG → CA3 → CA1 → SUB → 出力
2. **並行経路**: 複数の経路が同時に情報を伝達
3. **フィードバック**: CA3の自己連想、SUBから嗅内皮質へ（図には省略）

---

## 注記

1. 本図は、自己位置推定に関連する主要な接続を示しています
2. 介在ニューロンによる抑制性制御は簡略化されています
3. 各UCの内部構造（層構造など）は省略されています
4. 実際の神経投射は、図示されたものよりも複雑です

---

作成日: 2024年
形式: Mermaid Diagram Markdown

