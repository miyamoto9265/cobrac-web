# HCD構造図（Mermaid形式）

## 概要
外側膝状体（LGN）のHCDをmermaid形式で視覚化したものです。
UCをノード、Connectionを有向エッジとして表現しています。

## 凡例
- **長方形ノード**: ROI内のUC（Uniform Component）
- **角丸長方形ノード**: ROI外の入力・出力要素
- **実線矢印**: 興奮性接続
- **点線矢印**: 抑制性接続
- **太線矢印**: 主要な駆動入力・出力

---

## HCD構造図（draw.io対応版）

```mermaid
graph TB
    %% ROI外の入力源
    RGC_M["網膜M型RGC（動き・輝度情報）"]
    RGC_P["網膜P型RGC（形態・赤緑色情報）"]
    RGC_K["網膜K型RGC（青黄色情報）"]
    V1_L6["V1 Layer 6（皮質フィードバック）"]
    TRN["視床網様核（注意ゲーティング）"]
    SC["上丘（視覚運動統合）"]
    LC["青斑核（覚醒調節）"]
    PPT["脚橋被蓋核（注意調節）"]
    
    %% ROI内のUC
    LGN_M["LGN_M: Magnocellular層"]
    LGN_P["LGN_P: Parvocellular層"]
    LGN_K["LGN_K: Koniocellular層"]
    LGN_IN["LGN_IN: 介在ニューロン"]
    
    %% ROI外の出力先
    V1_4Ca["V1 Layer 4Cα（動き情報処理）"]
    V1_4Cb["V1 Layer 4Cβ（形態・色情報処理）"]
    V1_Blob["V1 Blob/Layer1（青黄色情報処理）"]
    
    %% 主要な駆動入力（網膜→LGN）
    RGC_M ==>|駆動入力| LGN_M
    RGC_P ==>|駆動入力| LGN_P
    RGC_K ==>|駆動入力| LGN_K
    
    %% 主要な出力（LGN→V1）
    LGN_M ==>|視覚情報中継| V1_4Ca
    LGN_P ==>|視覚情報中継| V1_4Cb
    LGN_K ==>|視覚情報中継| V1_Blob
    
    %% 皮質フィードバック（V1→LGN）
    V1_L6 -->|文脈的調節| LGN_M
    V1_L6 -->|文脈的調節| LGN_P
    V1_L6 -->|文脈的調節| LGN_K
    
    %% TRNによるゲーティング
    LGN_M -->|側枝投射| TRN
    LGN_P -->|側枝投射| TRN
    LGN_K -->|側枝投射| TRN
    TRN -.->|抑制性ゲーティング| LGN_M
    TRN -.->|抑制性ゲーティング| LGN_P
    TRN -.->|抑制性ゲーティング| LGN_K
    
    %% 脳幹からの神経修飾
    SC -->|視覚運動統合| LGN_M
    SC -->|視覚運動統合| LGN_P
    SC -->|視覚運動統合| LGN_K
    
    LC -->|覚醒レベル調節| LGN_M
    LC -->|覚醒レベル調節| LGN_P
    LC -->|覚醒レベル調節| LGN_K
    
    PPT -->|注意状態調節| LGN_M
    PPT -->|注意状態調節| LGN_P
    PPT -->|注意状態調節| LGN_K
    
    %% ROI内の局所回路（中継細胞⇄介在ニューロン）
    LGN_M -->|興奮性駆動| LGN_IN
    LGN_P -->|興奮性駆動| LGN_IN
    LGN_K -->|興奮性駆動| LGN_IN
    
    LGN_IN -.->|GABAergic側方抑制| LGN_M
    LGN_IN -.->|GABAergic側方抑制| LGN_P
    LGN_IN -.->|GABAergic側方抑制| LGN_K
    
    %% ノードのスタイル設定
    classDef roiNode fill:#4A90E2,stroke:#2E5C8A,stroke-width:3px,color:#fff
    classDef inputNode fill:#E8F4F8,stroke:#4A90E2,stroke-width:2px
    classDef outputNode fill:#F0E8F8,stroke:#8A4AE2,stroke-width:2px
    classDef modulatorNode fill:#FFF4E0,stroke:#E2A84A,stroke-width:2px
    
    class LGN_M,LGN_P,LGN_K,LGN_IN roiNode
    class RGC_M,RGC_P,RGC_K inputNode
    class V1_4Ca,V1_4Cb,V1_Blob outputNode
    class V1_L6,TRN,SC,LC,PPT modulatorNode
```

---

## 情報フローの説明

### 1. 主情報経路（ボトムアップ）
```
網膜RGC → LGN各層 → V1各層
```
視覚情報の主要な流れ。3つの並列経路（M、P、K）で処理される。

### 2. フィードバック経路（トップダウン）
```
V1 Layer 6 → LGN各層
```
皮質からのフィードバックによる文脈的調節。

### 3. ゲーティング経路
```
LGN各層 → TRN → LGN各層
```
注意による選択的情報ゲーティング。TRNは抑制性。

### 4. 局所処理経路（ROI内）
```
LGN各層 → LGN_IN → LGN各層
```
介在ニューロンによる側方抑制とコントラスト増強。

### 5. 神経修飾経路
```
脳幹諸核（上丘、青斑核、脚橋被蓋核）→ LGN各層
```
覚醒、注意、視覚運動統合による調節。

---

## 簡略版（コアネットワークのみ - draw.io対応）

```mermaid
graph LR
    %% 入力
    Retina["網膜（視覚情報）"]
    
    %% ROI内のUC
    LGN_M["LGN_M: 動き"]
    LGN_P["LGN_P: 形態・色"]
    LGN_K["LGN_K: 青黄色"]
    LGN_IN["LGN_IN: 抑制"]
    
    %% 出力
    V1["一次視覚皮質 V1"]
    
    %% 接続
    Retina ==> LGN_M
    Retina ==> LGN_P
    Retina ==> LGN_K
    
    LGN_M --> LGN_IN
    LGN_P --> LGN_IN
    LGN_K --> LGN_IN
    
    LGN_IN -.-> LGN_M
    LGN_IN -.-> LGN_P
    LGN_IN -.-> LGN_K
    
    LGN_M ==> V1
    LGN_P ==> V1
    LGN_K ==> V1
    
    V1 --> LGN_M
    V1 --> LGN_P
    V1 --> LGN_K
    
    %% スタイル
    classDef roiNode fill:#4A90E2,stroke:#2E5C8A,stroke-width:3px,color:#fff
    class LGN_M,LGN_P,LGN_K,LGN_IN roiNode
```

---

## 層構造の可視化（draw.io対応版）

```mermaid
graph TD
    subgraph ROI外_入力
        A1["網膜M型RGC"]
        A2["網膜P型RGC"]
        A3["網膜K型RGC"]
        A4["V1フィードバック"]
        A5["TRN"]
        A6["脳幹"]
    end
    
    subgraph ROI_LGN
        direction TB
        B1["LGN_M: Magnocellular層"]
        B2["LGN_P: Parvocellular層"]
        B3["LGN_K: Koniocellular層"]
        B4["LGN_IN: 介在ニューロン"]
        
        B1 <--> B4
        B2 <--> B4
        B3 <--> B4
    end
    
    subgraph ROI外_出力
        C1["V1 Layer 4Cα"]
        C2["V1 Layer 4Cβ"]
        C3["V1 Blob/Layer1"]
    end
    
    A1 ==> B1
    A2 ==> B2
    A3 ==> B3
    A4 --> B1 & B2 & B3
    A5 -.-> B1 & B2 & B3
    A6 --> B1 & B2 & B3
    
    B1 ==> C1
    B2 ==> C2
    B3 ==> C3
    
    classDef roiStyle fill:#4A90E2,stroke:#2E5C8A,stroke-width:3px,color:#fff
    class B1,B2,B3,B4 roiStyle
```

---

## 図の解釈ガイド

### ノードの意味
- **青色の四角（ROI内UC）**: LGN内の情報処理単位。これらがHCDの主要コンポーネント
- **水色の四角（入力）**: ROI外からの入力源
- **紫色の四角（出力）**: ROI外への出力先
- **黄色の四角（調節）**: ROI外からの調節入力

### エッジの意味
- **太い実線矢印（==>）**: 主要な駆動入力・出力
- **細い実線矢印（-->）**: 興奮性の調節入力
- **点線矢印（-.->）**: 抑制性接続

### 情報処理の流れ
1. 網膜から3つの並列経路で情報が入力
2. LGN内で局所処理（介在ニューロンによる抑制）
3. 各種調節入力により情報伝達ゲインが調節
4. V1へ3つの並列経路で情報が出力
5. V1からフィードバックが返ってくる（双方向処理）

---

## 注意事項

本図は、HCDの構造を視覚的に理解するためのものです。実際の神経接続の空間的配置や、シナプス数の多寡は反映されていません。また、各接続の神経伝達物質の種類や、詳細な受容野構造なども省略されています。

より詳細な情報については、2_BIF.md、3_UC.md、4_Connection.md を参照してください。

