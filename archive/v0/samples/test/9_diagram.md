# ステップ8-3: HCD構造図

## Mermaid図（Draw.ioへの変換用）

```mermaid
graph TB
    %% スタイル定義
    classDef roiInput fill:#FFE4B5,stroke:#FF8C00,stroke-width:2px
    classDef roiInternal fill:#E0F2F7,stroke:#0288D1,stroke-width:2px
    classDef roiOutput fill:#FFE0F0,stroke:#C2185B,stroke-width:2px
    
    %% ROI外(入力)ノード
    R1_R6["R1-R6 Outer photoreceptors"]:::roiInput
    R7_R8["R7-R8 Inner photoreceptors"]:::roiInput
    
    %% ROI内ノード - ラミナ
    L1["L1 Lamina monopolar cell L1"]:::roiInternal
    L2["L2 Lamina monopolar cell L2"]:::roiInternal
    L3["L3 Lamina monopolar cell L3"]:::roiInternal
    
    %% ROI内ノード - メデュラ運動検出群
    Mi1["Mi1 Medulla intrinsic neuron Mi1"]:::roiInternal
    Mi4["Mi4 Medulla intrinsic neuron Mi4"]:::roiInternal
    Mi9["Mi9 Medulla intrinsic neuron Mi9"]:::roiInternal
    Tm1["Tm1 Transmedullary neuron Tm1"]:::roiInternal
    Tm2["Tm2 Transmedullary neuron Tm2"]:::roiInternal
    Tm3["Tm3 Transmedullary neuron Tm3"]:::roiInternal
    Tm4["Tm4 Transmedullary neuron Tm4"]:::roiInternal
    
    %% ROI内ノード - メデュラ方位検出群
    Dm3["Dm3 Distal medulla amacrine cell 3"]:::roiInternal
    TmY["TmY Transmedullary Y neurons"]:::roiInternal
    
    %% ROI内ノード - メデュラ形態視覚
    Tm9["Tm9 Transmedullary neuron Tm9"]:::roiInternal
    
    %% ROI内ノード - 方向選択的細胞
    T4["T4 T4 direction-selective cells"]:::roiInternal
    T5["T5 T5 direction-selective cells"]:::roiInternal
    
    %% ROI内ノード - ロブラプレート
    HS["HS Horizontal System cells"]:::roiInternal
    VS["VS Vertical System cells"]:::roiInternal
    
    %% ROI内ノード - ロブラ
    LC4["LC4 Lobula columnar neuron LC4"]:::roiInternal
    LC6["LC6 Lobula columnar neuron LC6"]:::roiInternal
    LC10["LC10 Lobula columnar neuron LC10"]:::roiInternal
    LC11["LC11 Lobula columnar neuron LC11"]:::roiInternal
    
    %% ROI外(出力)ノード
    DNOVS1["DNOVS1 Descending neuron"]:::roiOutput
    OG["OG-downstream Optic glomeruli downstream"]:::roiOutput
    
    %% 接続 - 光受容体からラミナ
    R1_R6 -->|局所視野の時間的輝度変化を表現する広帯域光強度信号| L1
    R1_R6 -->|局所視野の時間的輝度変化を表現する広帯域光強度信号| L2
    R1_R6 -->|局所視野の時間的輝度変化を表現する広帯域光強度信号| L3
    R7_R8 -->|局所視野の色情報を表現する色選択的光強度信号| Tm9
    
    %% ラミナ内接続
    L1 <-->|電気的結合による相互作用| L2
    
    %% ラミナからメデュラ(ON経路)
    L1 -->|正のコントラスト変化を表現する時間的に濾波されたON信号| Mi1
    L1 -->|正のコントラスト変化を表現する時間的に濾波されたON信号| Tm3
    L1 -->|正のコントラスト変化を表現する時間的に濾波されたON信号| Mi4
    L1 -->|正のコントラスト変化を表現する時間的に濾波されたON信号| Mi9
    L1 -->|正のコントラスト変化を表現する時間的に濾波されたON信号| Dm3
    
    %% ラミナからメデュラ(OFF経路)
    L2 -->|負のコントラスト変化を表現する時間的に濾波されたOFF信号| Tm1
    L2 -->|負のコントラスト変化を表現する時間的に濾波されたOFF信号| Tm2
    L2 -->|負のコントラスト変化を表現する時間的に濾波されたOFF信号| Tm4
    
    %% メデュラからT4(ON運動検出)
    Mi1 -->|時間的に遅延した正コントラスト信号| T4
    Tm3 -->|時間的に非遅延の正コントラスト信号| T4
    Mi4 -->|正コントラストの追加的な時間フィルタ信号| T4
    Mi9 -->|正コントラストの追加的な時間フィルタ信号| T4
    
    %% メデュラからT5(OFF運動検出)
    Tm1 -->|時間的に遅延した負コントラスト信号| T5
    Tm2 -->|時間的に非遅延の負コントラスト信号| T5
    Tm4 -->|負コントラストの追加的な時間フィルタ信号| T5
    
    %% 方位検出経路
    Dm3 -->|交差方位抑制により鋭敏化された特定方位のエッジ信号| TmY
    Dm3 <-->|交差方位抑制| Dm3
    TmY <-->|同方位興奮| TmY
    TmY -->|局所的な輪郭方位を表現する方位選択的信号| LC6
    
    %% T4/T5からロブラプレート
    T4 -->|正コントラストエッジの方向選択的運動信号| HS
    T4 -->|正コントラストエッジの方向選択的運動信号| VS
    T5 -->|負コントラストエッジの方向選択的運動信号| HS
    T5 -->|負コントラストエッジの方向選択的運動信号| VS
    
    %% ロブラプレート内接続
    HS <-->|広視野統合のための電気的結合| HS
    VS <-->|広視野統合のための電気的結合| VS
    
    %% メデュラからロブラ(形態視覚)
    Tm9 -->|色情報と空間的コントラストパターンを統合した形態視覚特徴信号| LC4
    Tm9 -->|色情報と空間的コントラストパターンを統合した形態視覚特徴信号| LC6
    Tm9 -->|色情報と空間的コントラストパターンを統合した形態視覚特徴信号| LC10
    Tm9 -->|色情報と空間的コントラストパターンを統合した形態視覚特徴信号| LC11
    
    %% ROI外への出力
    HS -->|広視野の水平方向オプティックフロー| DNOVS1
    VS -->|広視野の垂直方向オプティックフロー| DNOVS1
    LC4 -->|局所視野内の小物体運動| OG
    LC6 -->|視野内で拡大する刺激の検出信号| OG
    LC10 -->|特定の視覚特徴パターン| OG
    LC11 -->|特定の視覚特徴パターン| OG
    
    %% 凡例
    subgraph Legend
        direction LR
        LegendInput["ROI外(入力)"]:::roiInput
        LegendInternal["ROI内"]:::roiInternal
        LegendOutput["ROI外(出力)"]:::roiOutput
    end
```

## 図の説明

### ノードの色分け
- **オレンジ色**: ROI外の入力源（光受容体 R1-R6, R7-R8）
- **青色**: ROI内の神経回路（ラミナ、メデュラ、ロブラプレート、ロブラ）
- **ピンク色**: ROI外の出力先（DNOVS1、OG-downstream）

### 主要な情報フロー経路

#### 経路1: ON運動検出 → 広視野運動統合 → 運動制御
```
R1-R6 → L1 → Mi1(遅延)/Tm3(非遅延) → T4 → HS/VS → DNOVS1
```

#### 経路2: OFF運動検出 → 広視野運動統合 → 運動制御
```
R1-R6 → L2 → Tm1(遅延)/Tm2(非遅延) → T5 → HS/VS → DNOVS1
```

#### 経路3: 方位検出 → 形態視覚 → 行動制御
```
R1-R6 → L1 → Dm3 ⇄ Dm3 → TmY ⇄ TmY → LC6 → OG-downstream
```

#### 経路4: 色情報 → 物体検出 → 行動制御
```
R7-R8 → Tm9 → LC4/LC6/LC10/LC11 → OG-downstream
```

### 相互結合
- **L1 ⇄ L2**: ラミナでのON/OFF経路間の電気的結合
- **Dm3 ⇄ Dm3**: 交差方位抑制による方位選択性の鋭敏化
- **TmY ⇄ TmY**: 同方位興奮による輪郭統合の強化
- **HS ⇄ HS, VS ⇄ VS**: ロブラプレートでの広視野統合

## 技術的注釈

### Mermaid形式の制約
- エッジラベルには改行( )や中黒(・)を含めていません
- 各接続にはOutput Semanticsを簡潔に記載しています
- 自己接続（Dm3→Dm3, TmY→TmY, HS→HS, VS→VS）はMermaid上で表現が難しいため、双方向矢印で近似しています

### Draw.io変換時の推奨事項
1. レイアウトは階層的配置（縦方向）を推奨
2. ノードは機能グループごとにクラスタリング
3. エッジラベルのフォントサイズは小さめに設定
4. 長いエッジラベルは適切に折り返す
5. 凡例を図の右上または右下に配置

## UC数とConnection数の統計
- **総UC数**: 25個
  - ROI外(入力): 2個（R1-R6, R7-R8）
  - ROI内: 21個（L1, L2, L3, Mi1, Mi4, Mi9, Tm1, Tm2, Tm3, Tm4, Tm9, TmY, Dm3, T4, T5, HS, VS, LC4, LC6, LC10, LC11）
  - ROI外(出力): 2個（DNOVS1, OG-downstream）
- **Connection数**: 約40個の主要接続（相互接続を含む）
