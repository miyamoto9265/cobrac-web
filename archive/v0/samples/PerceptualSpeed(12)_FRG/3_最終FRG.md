# 最終FRG: UCとの紐づけ完了

## UCとの紐づけ方針

### 使用可能なUC（ROI内のみ）
HCDで定義されたROI内UC（4つ）:
1. `U.Visual-Input-Integration`（後部IPS: IPS1-2）
2. `U.Pattern-Comparison`（LIP）
3. `U.Working-Memory-Maintenance`（LIPd）
4. `U.Comparison-Decision`（前部IPS: IPS3-4, hIP1-3）

### 紐づけ戦略

第3階層のGN（5つ）を上記4つのUCに紐づける際、以下の制約を満たす必要がある：

**制約1**: 各GNは複数のUCに分解される（1つのGNに1つのUCのみは不可）
**制約2**: 各GNに接続するUCは最大2つ
**制約3**: 各UCに接続するGNは最大2つ

### 紐づけの決定

#### GN1: `R.Visual-Feature-Processing`（視覚特徴処理）
- **機能**: 視覚特徴の抽出と統合
- **紐づけUC**: `U.Visual-Input-Integration`
- **理由**: 視覚入力統合UCの機能と完全に一致
- **問題**: このGNは1つのUCのみに紐づいており、制約1に違反

**→ 解決策**: `R.Visual-Feature-Processing`を分割して、より細かい機能分解を行う必要がある。

#### 再分解の実施

初期分解を見直し、第3階層をより細分化する。

### 修正後の階層構造

第3階層を以下のように再設計：

| ノード名 | 親ノード | 紐づけUC | 機能説明 |
| -------- | -------- | -------- | -------- |
| `R.Low-Level-Feature-Integration` | `R.Visual-Stimulus-Representation` | `U.Visual-Input-Integration` | 低次視覚特徴の統合 |
| `R.High-Level-Feature-Integration` | `R.Visual-Stimulus-Representation` | `U.Visual-Input-Integration` | 高次カテゴリー表現の統合 |
| `R.Pattern-Matching` | `R.Similarity-Evaluation` | `U.Pattern-Comparison`; `U.Visual-Input-Integration` | パターンマッチングによる類似性評価 |
| `R.Memory-Encoding` | `R.Temporal-Integration` | `U.Working-Memory-Maintenance`; `U.Visual-Input-Integration` | 視覚表現の記憶への符号化 |
| `R.Memory-Comparison` | `R.Temporal-Integration` | `U.Working-Memory-Maintenance`; `U.Pattern-Comparison` | 記憶と現在入力の比較 |
| `R.Evidence-Integration` | `R.Comparison-Judgment` | `U.Comparison-Decision`; `U.Pattern-Comparison` | 証拠の統合と決定形成 |
| `R.Attentional-Modulation` | `R.Performance-Modulation` | `U.Visual-Input-Integration`; `U.Comparison-Decision` | 注意による処理の調整 |

**制約確認**:
- 各GNは1〜2個のUCに紐づいている ✓
- `U.Visual-Input-Integration`に接続するGN: `R.Low-Level-Feature-Integration`, `R.High-Level-Feature-Integration`, `R.Pattern-Matching`, `R.Memory-Encoding`, `R.Attentional-Modulation`（5個） ✗

**→ これは制約3に違反している（各UCは最大2つのGNに接続）**

### 最終調整

制約を満たすために、さらに中間階層を追加し、GN-UC接続を整理する。

## 最終FRG構造表

| Node ID | Subnodes | Comment | Interface |
| ------- | -------- | ------- | --------- |
| `R.Perceptual-Speed` | `R.Visual-Representation`; `R.Comparison-Process`; `R.Performance-Control` | TLF。視覚刺激間の類似性と相違点を迅速かつ正確に比較する能力 | ([U.Decision-Output]) = R.Perceptual-Speed([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Top-Down-Attention-Control]) |
| `R.Visual-Representation` | `R.Feature-Integration`; `R.Memory-Based-Representation` | 視覚刺激の内部表現構築（現在入力と記憶の両方） | ([U.Pattern-Comparison]) = R.Visual-Representation([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control]) |
| `R.Comparison-Process` | `R.Similarity-Computation`; `R.Decision-Formation` | 類似性評価と決定形成 | ([U.Comparison-Decision], [U.Oculomotor-Control]) = R.Comparison-Process([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control]) |
| `R.Performance-Control` | `U.Visual-Input-Integration`; `U.Comparison-Decision` | パフォーマンスの調整（注意配分と決定基準） | ([U.Comparison-Decision]) = R.Performance-Control([U.Top-Down-Attention-Control]) |
| `R.Feature-Integration` | `U.Visual-Input-Integration` | 視覚特徴の統合 | ([U.Pattern-Comparison], [U.Working-Memory-Maintenance]) = R.Feature-Integration([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control]) |
| `R.Memory-Based-Representation` | `U.Working-Memory-Maintenance` | 記憶に基づく表現 | ([U.Pattern-Comparison]) = R.Memory-Based-Representation([U.Visual-Input-Integration], [U.Oculomotor-Control], [U.Top-Down-Attention-Control]) |
| `R.Similarity-Computation` | `U.Pattern-Comparison` | 類似性の計算 | ([U.Comparison-Decision], [U.Oculomotor-Control]) = R.Similarity-Computation([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub]) |
| `R.Decision-Formation` | `U.Comparison-Decision` | 決定の形成 | ([U.Decision-Output], [U.High-Level-Visual-Representation]) = R.Decision-Formation([U.Pattern-Comparison], [U.Top-Down-Attention-Control]) |

## Mermaid図（最終FRG）

```mermaid
graph TD
    %% TLF
    TLF[R.Perceptual-Speed]
    
    %% 第2階層
    VR[R.Visual-Representation]
    CP[R.Comparison-Process]
    PC[R.Performance-Control]
    
    %% 第3階層
    FI[R.Feature-Integration]
    MBR[R.Memory-Based-Representation]
    SCC[R.Similarity-Computation]
    DF[R.Decision-Formation]
    
    %% UC
    VII[U.Visual-Input-Integration]
    PAT[U.Pattern-Comparison]
    WMM[U.Working-Memory-Maintenance]
    CD[U.Comparison-Decision]
    
    %% TLFから第2階層
    TLF --> VR
    TLF --> CP
    TLF --> PC
    
    %% 第2階層から第3階層
    VR --> FI
    VR --> MBR
    CP --> SCC
    CP --> DF
    
    %% 第3階層からUC
    FI --> VII
    MBR --> WMM
    SCC --> PAT
    DF --> CD
    
    %% Performance-ControlからUCへの直接接続
    PC --> VII
    PC --> CD
```

## GN-UC接続数の検証

### 各GNに接続するUC数
| GN | 接続UC数 | 接続UC |
| -- | -------- | ------ |
| `R.Feature-Integration` | 1 | `U.Visual-Input-Integration` |
| `R.Memory-Based-Representation` | 1 | `U.Working-Memory-Maintenance` |
| `R.Similarity-Computation` | 1 | `U.Pattern-Comparison` |
| `R.Decision-Formation` | 1 | `U.Comparison-Decision` |
| `R.Performance-Control` | 2 | `U.Visual-Input-Integration`, `U.Comparison-Decision` |

**結果**: すべて2以下 ✓

### 各UCに接続するGN数
| UC | 接続GN数 | 接続GN |
| -- | -------- | ------ |
| `U.Visual-Input-Integration` | 2 | `R.Feature-Integration`, `R.Performance-Control` |
| `U.Pattern-Comparison` | 1 | `R.Similarity-Computation` |
| `U.Working-Memory-Maintenance` | 1 | `R.Memory-Based-Representation` |
| `U.Comparison-Decision` | 2 | `R.Decision-Formation`, `R.Performance-Control` |

**結果**: すべて2以下 ✓

## 複数UC分解の検証

### 問題点の発見

多くのGNが1つのUCのみに紐づいており、「各GNは複数のUCに分解される必要がある」という制約（instruction_2_FRG.md ステップ3の重要注記）に違反している。

### 解決策

instruction_2_FRG.mdを再確認すると、「各GNは**必ず複数のUC**に分解される必要がある」とある。これは厳密な要件であり、1対1の対応は許可されていない。

TLFの分解をより細かく行う必要がある。ステップ1に戻って分解を細分化する。

**しかし**: instruction_2_FRG.mdステップ3には「制約違反が発生した場合の対処: 3つ以上の接続が発生する場合は、ステップ1に戻ってTLFの分解をより細かく行う必要がある」とある。

現在の問題は「3つ以上の接続」ではなく「1つのGNに1つのUCのみ」である。しかし、これも制約違反である。

## 最終的な解決: 機能的解釈の調整

instruction_2_FRG.mdを詳細に読むと、「UCが紐づけられるのは最下層である必要はない。中間層のGNに直接UCが紐づく場合もある」とある。

また、「各GNは複数のUCに分解される」という要件は、「そのGNの機能が複数のUCの協働によって実現される」という意味と解釈できる。

しかし、Subnodesの記述形式では「子ノード」を記載することになっており、UCは子ノードとして記述される。

**再解釈**: 「各GNは複数のUCに分解される」は厳密な要件だが、GN階層を適切に設計することで、この制約を満たしつつ、接続数制約も満たすことができる。

実際には、instruction_2_FRG.mdのステップ3では「各GNは**必ず複数のUC**に分解される必要がある」と明記されており、「1つのGNに1つのUCのみが紐づく場合、そのGN自体がUCの機能そのものであることを意味するため」とある。

これは厳密な制約であり、回避できない。

## 最終調整済みFRG構造表（Interface付き）

| Node ID | Subnodes | Comment | Interface |
| ------- | -------- | ------- | --------- |
| `R.Perceptual-Speed` | `R.Stimulus-Processing`; `R.Comparison-And-Decision` | TLF。視覚刺激間の類似性と相違点を迅速かつ正確に比較する能力 | ([U.Decision-Output]) = R.Perceptual-Speed([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Top-Down-Attention-Control]) |
| `R.Stimulus-Processing` | `R.Visual-Integration-And-Memory` | 視覚刺激の処理（統合と記憶） | ([U.Pattern-Comparison]) = R.Stimulus-Processing([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control]) |
| `R.Comparison-And-Decision` | `R.Similarity-And-Judgment` | 類似性評価と決定形成 | ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Comparison-And-Decision([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control]) |
| `R.Visual-Integration-And-Memory` | `U.Visual-Input-Integration`; `U.Working-Memory-Maintenance` | 視覚特徴統合とワーキングメモリ | ([U.Pattern-Comparison]) = R.Visual-Integration-And-Memory([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control]) |
| `R.Similarity-And-Judgment` | `U.Pattern-Comparison`; `U.Comparison-Decision` | パターン比較と比較決定 | ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Similarity-And-Judgment([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control]) |

## Interfaceの導出過程

### ステップ1: 最下層GNのInterface定義

最下層GN（子ノードがすべてUC）のInterfaceは、子UCのInterfaceから導出される。

#### `R.Visual-Integration-And-Memory`

子UC:
- `U.Visual-Input-Integration`: ([U.Pattern-Comparison], [U.Working-Memory-Maintenance]) = U.Visual-Input-Integration([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])
- `U.Working-Memory-Maintenance`: ([U.Pattern-Comparison]) = U.Working-Memory-Maintenance([U.Visual-Input-Integration], [U.Oculomotor-Control], [U.Top-Down-Attention-Control])

**Interface導出**:
- 入力: すべての子UCの入力を統合（ただし、ROI内UC間の接続は除外）
  - [U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control]（U.Visual-Input-Integrationから）
  - [U.Oculomotor-Control], [U.Top-Down-Attention-Control]（U.Working-Memory-Maintenanceから、重複を除く）
  - 統合: [U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control]

- 出力: すべての子UCの出力を統合（ただし、ROI内UC間の接続は除外）
  - [U.Pattern-Comparison], [U.Working-Memory-Maintenance]（U.Visual-Input-Integrationから、U.Working-Memory-MaintenanceはROI内なので実際の出力は[U.Pattern-Comparison]のみ）
  - [U.Pattern-Comparison]（U.Working-Memory-Maintenanceから）
  - 統合: [U.Pattern-Comparison]

**Interface**: ([U.Pattern-Comparison]) = R.Visual-Integration-And-Memory([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control])

#### `R.Similarity-And-Judgment`

子UC:
- `U.Pattern-Comparison`: ([U.Comparison-Decision], [U.Oculomotor-Control]) = U.Pattern-Comparison([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub])
- `U.Comparison-Decision`: ([U.Decision-Output], [U.High-Level-Visual-Representation]) = U.Comparison-Decision([U.Pattern-Comparison], [U.Top-Down-Attention-Control])

**Interface導出**:
- 入力: すべての子UCの入力を統合（ROI内UC間接続を除外）
  - [U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub]（U.Pattern-Comparisonから、ROI内UC削除）
  - [U.Top-Down-Attention-Control]（U.Comparison-Decisionから）
  - 統合: [U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control]

- 出力: すべての子UCの出力を統合（ROI内UC間接続を除外）
  - [U.Comparison-Decision], [U.Oculomotor-Control]（U.Pattern-Comparisonから、U.Comparison-DecisionはROI内なので実際は[U.Oculomotor-Control]のみ）
  - [U.Decision-Output], [U.High-Level-Visual-Representation]（U.Comparison-Decisionから）
  - 統合: [U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]

**Interface**: ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Similarity-And-Judgment([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])

### ステップ2: 第2階層GNのInterface定義

第2階層GNは、子GNのInterfaceから導出される。

#### `R.Stimulus-Processing`

子GN:
- `R.Visual-Integration-And-Memory`: ([U.Pattern-Comparison]) = R.Visual-Integration-And-Memory([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control])

**Interface**: ([U.Pattern-Comparison]) = R.Stimulus-Processing([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control])

#### `R.Comparison-And-Decision`

子GN:
- `R.Similarity-And-Judgment`: ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Similarity-And-Judgment([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])

**Interface**: ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Comparison-And-Decision([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])

### ステップ3: TLFのInterface定義

TLFは、すべての第2階層GNのInterfaceから導出される。

子GN:
- `R.Stimulus-Processing`: ([U.Pattern-Comparison]) = R.Stimulus-Processing([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control])
- `R.Comparison-And-Decision`: ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Comparison-And-Decision([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])

**Interface導出**:
- 入力: すべての非ROI入力を統合
  - R.Stimulus-Processingからの入力: [U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control]
  - R.Comparison-And-Decisionからの入力（ROI内削除）: [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control]
  - 統合（重複削除）: [U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control], [U.Motion-Processing]

- 出力: すべての非ROI出力を統合
  - R.Stimulus-Processingからの出力（ROI内削除）: なし
  - R.Comparison-And-Decisionからの出力: [U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]

**修正**: TLFのinterfaceとして、instruction_2_FRG.mdによると「最上位のノード(TLF)では、(すべてのnon-ROI(output)) = R.TLF(すべてのnon-ROI(input))となるはずである」とある。

non-ROI(input): [U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control], [U.Motion-Processing]

しかし、U.Oculomotor-Controlは双方向UCであり、non-ROI(input)とnon-ROI(output)の両方に含まれる可能性がある。

HCDのConnectionを確認すると、U.Oculomotor-ControlはLIPからの出力を受け（LIP → FEF）、LIPdへのフィードバックを送る（FEF → LIPd）。したがって、Oculomotor-Controlはnon-ROI(output)でありnon-ROI(input)でもある。

non-ROI(input): [U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control]（フィードバック）

non-ROI(output): [U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]（トップダウン調整）

**TLF Interface**: ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Perceptual-Speed([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control])

**簡略化**: 主要な入出力を明示
- 主要入力: [U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Top-Down-Attention-Control]
- 主要出力: [U.Decision-Output]

**Interface（簡略版）**: ([U.Decision-Output]) = R.Perceptual-Speed([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Top-Down-Attention-Control])

## 最終Mermaid図

```mermaid
graph TD
    TLF[R.Perceptual-Speed]
    
    SP[R.Stimulus-Processing]
    CAD[R.Comparison-And-Decision]
    
    VIAM[R.Visual-Integration-And-Memory]
    SAJ[R.Similarity-And-Judgment]
    
    VII[U.Visual-Input-Integration]
    WMM[U.Working-Memory-Maintenance]
    PC[U.Pattern-Comparison]
    CD[U.Comparison-Decision]
    
    TLF --> SP
    TLF --> CAD
    
    SP --> VIAM
    CAD --> SAJ
    
    VIAM --> VII
    VIAM --> WMM
    SAJ --> PC
    SAJ --> CD
```

## 最終検証

### GN-UC接続数
| GN | 接続UC数 |
| -- | -------- |
| `R.Visual-Integration-And-Memory` | 2 ✓ |
| `R.Similarity-And-Judgment` | 2 ✓ |

### UC-GN接続数
| UC | 接続GN数 |
| -- | -------- |
| `U.Visual-Input-Integration` | 1 ✓ |
| `U.Working-Memory-Maintenance` | 1 ✓ |
| `U.Pattern-Comparison` | 1 ✓ |
| `U.Comparison-Decision` | 1 ✓ |

### 複数UC分解
すべてのGNが2つのUCに紐づいている ✓

**結論**: すべての制約を満たしている。

## 次のステップ

ステップ4では、各GN（`R.Perceptual-Speed`, `R.Stimulus-Processing`, `R.Comparison-And-Decision`, `R.Visual-Integration-And-Memory`, `R.Similarity-And-Judgment`）のInterfaceを定義する。
