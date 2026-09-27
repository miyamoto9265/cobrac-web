# ステップ8: HCD構造図（Mermaid形式）

## 演繹的推論のHCD構造図

以下のMermaid形式の図は、演繹的推論を実現する10個のUniform Circuitとそれらの間の接続を視覚化したものです。

```mermaid
graph TB
    %% ROI外の入力ノード
    VisualInput[VisualInput<br/>視覚情報<br/>ROI外]
    SemanticInput[SemanticInput<br/>意味情報<br/>ROI外]
    ThalamusMD[ThalamusMD<br/>視床MD核<br/>ROI外]
    ThalamusVA[ThalamusVA<br/>視床VA核<br/>ROI外]
    
    %% ROI外の出力ノード
    MotorOutput[MotorOutput<br/>運動出力<br/>ROI外]
    
    %% 頭頂葉クラスター
    L-SPL[L-SPL<br/>上頭頂小葉<br/>視空間統合]
    L-IPS[L-IPS<br/>頭頂間溝<br/>空間作業記憶]
    L-Precuneus[L-Precuneus<br/>楔前部<br/>視空間イメージ]
    L-AG[L-AG<br/>角回<br/>心的モデル]
    
    %% 前頭葉クラスター
    L-IFG[L-IFG<br/>下前頭回<br/>ルール選択]
    L-DLPFC[L-DLPFC<br/>背外側前頭前野<br/>作業記憶・制御]
    L-PMC[L-PMC<br/>前運動皮質<br/>運動準備]
    L-MeFG[L-MeFG<br/>内側前頭回<br/>認知制御統合]
    
    %% 基底核クラスター
    L-Caudate[L-Caudate<br/>尾状核<br/>認知制御ループ]
    L-Putamen[L-Putamen<br/>被殻<br/>決定戦略]
    
    %% 視覚入力経路
    VisualInput -->|空間情報| L-SPL
    VisualInput -->|空間情報| L-IPS
    VisualInput -->|イメージ| L-Precuneus
    
    %% 意味入力経路
    SemanticInput -->|前提の意味| L-IFG
    
    %% 頭頂葉内の接続
    L-SPL -->|統合された視空間情報| L-IPS
    L-Precuneus -->|主観的視空間イメージ| L-AG
    L-IPS -->|空間的関係と順序| L-AG
    
    %% 前頭-頭頂接続（前頭→頭頂）
    L-IFG -->|ルールと意味情報| L-AG
    L-DLPFC -->|制御信号| L-IPS
    L-DLPFC -->|制御信号| L-AG
    
    %% 前頭-頭頂接続（頭頂→前頭）
    L-AG -->|心的モデル情報| L-IFG
    L-AG -->|統合結果| L-DLPFC
    L-IPS -->|空間作業記憶| L-DLPFC
    
    %% 前頭葉内の接続
    L-IFG -->|ルール情報| L-DLPFC
    L-MeFG -->|認知制御信号| L-IFG
    L-MeFG -->|認知制御調整| L-DLPFC
    L-DLPFC -->|実行準備信号| L-PMC
    L-IFG -->|ルール処理結果| L-PMC
    L-PMC -->|運動状態フィードバック| L-IFG
    
    %% 前頭-線条体接続
    L-DLPFC -->|認知制御信号| L-Caudate
    L-IFG -->|ルール選択信号| L-Putamen
    
    %% 基底核-視床-前頭ループ
    L-Caudate -->|行動スキーマ選択| ThalamusMD
    L-Putamen -->|決定戦略実行| ThalamusVA
    ThalamusMD -->|認知制御フィードバック| L-DLPFC
    ThalamusVA -->|運動調整信号| L-PMC
    ThalamusVA -->|調整信号| L-MeFG
    
    %% 運動出力
    L-PMC -->|運動実行信号| MotorOutput
    
    %% スタイリング
    classDef roiOutside fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    classDef parietal fill:#ccffcc,stroke:#00cc00,stroke-width:2px
    classDef frontal fill:#ccccff,stroke:#0000ff,stroke-width:2px
    classDef subcortical fill:#ffffcc,stroke:#cccc00,stroke-width:2px
    
    class VisualInput,SemanticInput,ThalamusMD,ThalamusVA,MotorOutput roiOutside
    class L-SPL,L-IPS,L-Precuneus,L-AG parietal
    class L-IFG,L-DLPFC,L-PMC,L-MeFG frontal
    class L-Caudate,L-Putamen subcortical
```

---

## 凡例

### ノードの色分け

- **赤色（ROI外）**: ROI外の入力・出力ノード
  - `VisualInput`: 後頭皮質からの視覚情報
  - `SemanticInput`: 側頭葉からの意味情報
  - `ThalamusMD`: 視床内側背側核
  - `ThalamusVA`: 視床腹側前核
  - `MotorOutput`: 一次運動野への運動出力

- **緑色（頭頂葉）**: ROI内の頭頂葉クラスター
  - `L-SPL`: 左上頭頂小葉
  - `L-IPS`: 左頭頂間溝
  - `L-Precuneus`: 左楔前部
  - `L-AG`: 左角回

- **青色（前頭葉）**: ROI内の前頭葉クラスター
  - `L-IFG`: 左下前頭回
  - `L-DLPFC`: 左背外側前頭前野
  - `L-PMC`: 左前運動皮質
  - `L-MeFG`: 左内側前頭回

- **黄色（基底核）**: ROI内の皮質下クラスター
  - `L-Caudate`: 左尾状核
  - `L-Putamen`: 左被殻

### 接続の意味

各矢印は、送信元UCから受信先UCへの情報の流れを表す。矢印のラベルは、伝達される情報の内容を簡潔に示している。

### 主要な情報フロー

1. **視覚→空間処理→心的モデル経路（緑色ノード群）**
   - 視覚情報が頭頂葉で空間的に処理され、心的モデルとして表現される

2. **意味→ルール選択→作業記憶経路（青色ノード群）**
   - 意味情報が前頭葉でルールとして処理され、作業記憶に保持される

3. **前頭-線条体-視床ループ（青→黄→赤→青）**
   - 認知制御と運動準備の動的調整ループ

4. **前頭-頭頂双方向ネットワーク（青↔緑）**
   - ルール処理と心的モデルの相互作用

---

## 補足情報

### Output Semanticsの対応

各UCの出力には、以下のOutput Semanticsが対応している（詳細は3_UC.mdを参照）：

- `L-IFG` → 適用可能なルールの表現と選択された論理的操作の種類
- `L-DLPFC` → 作業記憶に保持された前提情報と実行制御状態
- `L-PMC` → 選択された応答の運動プログラムと実行準備状態
- `L-MeFG` → 全体的な認知制御信号とタスク設定状態
- `L-AG` → 前提間の意味的関係を統合した心的モデル表現
- `L-IPS` → 要素間の空間的関係と順序の表現
- `L-SPL` → 統合された視空間情報と空間的注意の焦点
- `L-Precuneus` → 主観的視点からの視空間イメージ表現
- `L-Caudate` → 選択された認知的行動スキーマとルール適用の強度
- `L-Putamen` → 選択された決定戦略と応答準備の強度

### 計算機能の階層

1. **入力層**: VisualInput, SemanticInput → 外部情報の受信
2. **初期処理層**: L-SPL, L-Precuneus → 感覚情報の統合
3. **表現層**: L-IPS, L-AG, L-IFG → 空間・意味・ルールの表現
4. **制御層**: L-DLPFC, L-MeFG → 作業記憶と実行制御
5. **選択層**: L-Caudate, L-Putamen → ルールと戦略の選択
6. **出力層**: L-PMC → MotorOutput → 応答の生成

この階層構造により、演繹的推論の段階的な情報処理が実現される。

---

## 注意事項

- 本図はMermaid形式で記述されており、Mermaidに対応したMarkdownビューアーで可視化できます
- draw.ioへの変換を希望する場合は、Mermaid Live Editorなどで変換可能です
- 実際の神経接続はより複雑であり、本図は主要な接続のみを示しています
- UC間の接続の詳細（文献的根拠など）は4_Connection.mdを参照してください
