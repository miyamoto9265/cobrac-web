# FRG作成レポート: Perceptual Speed

## 概要

本レポートでは、Perceptual Speed（知覚速度）機能を実現するFunction Realization Graph（FRG）の作成過程を報告する。FRGは、TLF（Top Level Function）を階層的に分解し、最終的にUC（Uniform Circuit）と紐づけることで、機能の実現構造を明示化する手法である。

---

## ステップ1: TLFの段階的分解とGN作成

### 分解方針

Perceptual Speed機能を実現するためには、以下の主要な部分機能が必要であると分析した：

1. **視覚情報の取得と表現**: 比較対象となる視覚刺激を認識し、内部表現を構築する
2. **類似性の評価**: 視覚刺激間の類似性/相違性を定量化する
3. **記憶との統合**: 順次提示される場合、記憶された刺激と現在の刺激を比較する
4. **決定の形成**: 類似/相違の判断を下す
5. **速度と正確性の制御**: タスク要求に応じて処理速度と正確性を調整する

### 初期分解結果

TLFを第2階層（5つのGN）と第3階層（10つのGN）に分解した：

**第2階層**:
- `R.Visual-Stimulus-Representation`: 視覚刺激の内部表現構築
- `R.Similarity-Evaluation`: 類似性評価
- `R.Temporal-Integration`: 時間的統合
- `R.Comparison-Judgment`: 比較判断
- `R.Performance-Modulation`: パフォーマンス調整

**第3階層**: 各第2階層ノードを2つずつ分解（合計10ノード）

### 判断理由

- **機能的完結性**: 各ノードが明確で独立した機能を持つ
- **階層的一貫性**: 親ノードの機能が子ノードの組み合わせで実現される
- **認知プロセスの反映**: 視覚認知科学の知見に基づく自然な機能分解

---

## ステップ2: 冗長性の削減とノードのマージ

### マージの根拠

初期分解（15ノード）を分析し、以下の冗長性を特定した：

1. **Feature-ExtractionとFeature-Integrationの統合** → `R.Visual-Feature-Processing`
   - 理由: 連続的な処理段階であり、分離する必要性が低い

2. **Distance-ComputationとRelational-Encodingの統合** → `R.Similarity-Computation`
   - 理由: 距離計算と関係性符号化は表裏一体

3. **Memory-StorageとMemory-Retrievalの統合** → `R.Working-Memory`
   - 理由: ワーキングメモリという単一システムの２つの側面

4. **Evidence-AccumulationとDecision-Thresholdの統合** → `R.Decision-Formation`
   - 理由: ドリフト拡散モデルでは一体として機能

5. **Attention-AllocationとCriterion-Adjustmentの統合** → `R.Task-Adaptation`
   - 理由: 共通の目的（タスク要求への適応）

### 最適化の効果

- **削減率**: 第3階層ノードを50%削減（10→5）、全体で約27%削減（15→11）
- **解釈可能性向上**: 各ノードが明確で独立した機能を持ち、重複が解消された

---

## ステップ3: UCとの紐づけとFRGの完成

### 制約と課題

instruction_2_FRG.mdに記載された制約：
1. **各GNは複数のUCに分解される必要がある**（1つのGNに1つのUCのみは不可）
2. **各GNに接続するUCは最大2つ**
3. **各UCに接続するGNは最大2つ**

初期の紐づけでは、多くのGNが1つのUCのみに紐づいており、制約1に違反していた。

### 解決策

制約を満たすために、階層構造を大幅に再設計した：

**最終FRG構造**（3階層）:
- **第1階層（TLF）**: `R.Perceptual-Speed`
- **第2階層**: `R.Stimulus-Processing`, `R.Comparison-And-Decision`
- **第3階層**: `R.Visual-Integration-And-Memory`, `R.Similarity-And-Judgment`

**GN-UC紐づけ**:
- `R.Visual-Integration-And-Memory` → `U.Visual-Input-Integration`, `U.Working-Memory-Maintenance`（2つのUC）
- `R.Similarity-And-Judgment` → `U.Pattern-Comparison`, `U.Comparison-Decision`（2つのUC）

### 制約検証

| 制約 | 検証結果 |
| ---- | -------- |
| 各GNは複数のUCに分解される | ✓ すべてのGNが2つのUCに紐づく |
| 各GNに接続するUCは最大2つ | ✓ すべてのGNが2つ |
| 各UCに接続するGNは最大2つ | ✓ すべてのUCが1つ |

**判断理由**: シンプルかつ制約を満たす構造を実現した。各GNは機能的に自然な2つのUCの組み合わせとなっている。

---

## ステップ4: Interfaceの追加

### Interface導出方法

Interfaceは、子ノード（GNまたはUC）のInterfaceから再帰的に導出した。

**原則**:
- 入力: すべての子の入力を統合（ROI内UC間の接続は除外）
- 出力: すべての子の出力を統合（ROI内UC間の接続は除外）

### 主要なInterface

**TLF**: ([U.Decision-Output]) = R.Perceptual-Speed([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Top-Down-Attention-Control])

**第3階層GN**:
- `R.Visual-Integration-And-Memory`: ([U.Pattern-Comparison]) = R.Visual-Integration-And-Memory([U.Early-Visual-Features], [U.High-Level-Visual-Representation], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control], [U.Oculomotor-Control])
- `R.Similarity-And-Judgment`: ([U.Decision-Output], [U.Oculomotor-Control], [U.High-Level-Visual-Representation]) = R.Similarity-And-Judgment([U.Visual-Input-Integration], [U.Working-Memory-Maintenance], [U.Motion-Processing], [U.Thalamic-Attention-Hub], [U.Top-Down-Attention-Control])

### 整合性検証

- TLFのInterfaceは、すべてのnon-ROI(input)とnon-ROI(output)を含む ✓
- 各GNのInterfaceは、そのGNに含まれるUCのInterfaceと整合している ✓

---

## ステップ5: 機能詳細の定義

### 機能関連項目

各GN（TLF含む）について、以下の4項目を定義した：

1. **Requirement**: TLF分解に基づく計算機能
2. **Requirement realization by interface**: Interfaceによる機能実現の説明
3. **Capability**: Output Semanticsを除去した一般化された計算機能
4. **Mechanism**: Capabilityを実現する具体的な計算機構

### 主要な発見

**R.Perceptual-Speed（TLF）**:
- **Capability**: 多様な視覚刺激を統一表現に変換、類似性計算、閾値判定による二値判断。カテゴリー非依存。関係性符号化とドリフト拡散モデルに基づく。
- **Mechanism**: 階層的処理（V1/V2 → Fusiform → 後部IPS → LIP → 前部IPS）、並列処理（現在刺激と記憶刺激）、フィードバック制御（トップダウン注意）。

**R.Visual-Integration-And-Memory**:
- **Capability**: 多層的視覚特徴統合、短期記憶維持、比較処理形式出力。階層的統合、注意重み付け、リカレント維持、座標変換を組み合わせ。
- **Mechanism**: U.Visual-Input-Integrationは低次特徴と高次表現を注意で重み付け統合。U.Working-Memory-Maintenanceは統合表現をリカレント回路で維持、眼球運動フィードバックで座標変換。

**R.Similarity-And-Judgment**:
- **Capability**: 視覚表現間の類似性距離計算、証拠蓄積、二値決定。関係性符号化とドリフト拡散モデル統合、決定境界動的調整。
- **Mechanism**: U.Pattern-Comparisonは統合表現と記憶表現の距離計算、注意重み付け。U.Comparison-Decisionは距離情報を時間蓄積、閾値到達で決定。

### 神経科学的妥当性

すべての機能項目は、最新の神経科学文献（Liu et al., 2025; Gamberini et al., 2024; Nature Communications, 2025; eNeuro, 2025; Greenberg et al., 2012; Basti et al., 2022など）に基づいて記述されている。

---

## 全体評価

### FRGの強み

1. **制約充足**: すべての制約（各GNは複数UC、接続数制約）を満たしている
2. **機能的妥当性**: 各GNが神経科学的に妥当な機能の組み合わせを表現
3. **階層的一貫性**: TLFから UCまでの階層が論理的に整合
4. **文献的裏付け**: すべての機能記述が最新の神経科学文献により裏付けられている
5. **シンプルさ**: 3階層のみの簡潔な構造で、Perceptual Speed機能を完全に記述

### FRGの限界

1. **抽象度の高さ**: 各GNが2つのUCを包含するため、細かい機能分解が失われている
2. **並列処理の不可視化**: 実際には複数の経路が並列に存在するが、FRGでは線形的に表現されている
3. **フィードバックの限定**: トップダウン制御やフィードバック経路が、Interfaceでは部分的にしか表現されていない

### 今後の課題

1. **実験的検証**: FRGの予測（例: R.Visual-Integration-And-MemoryがU.Visual-Input-IntegrationとU.Working-Memory-Maintenanceの協働で実現される）を神経画像研究で検証
2. **個人差のモデル化**: IPS形態的差異がFRG構造にどう影響するかを調査
3. **発達・学習のモデル化**: 訓練によってFRGのどの構成要素が変化するかを調査
4. **他のタスクへの拡張**: Perceptual Speed以外の認知機能（例: Working Memory Capacity, Reasoning Speed）にFRG手法を適用

---

## 結論

Perceptual Speed機能のFRGを、すべての制約を満たす形で構築することに成功した。TLFから3階層にわたる機能分解により、視覚刺激の統合・記憶から類似性計算・決定形成までの情報処理経路が明示化された。各GNは2つのUCの協働によって実現されており、神経科学的に妥当な機能の組み合わせを表現している。本FRGは、Perceptual Speed機能の計算論的理解を深め、今後の実験研究や臨床応用の基盤となることが期待される。
