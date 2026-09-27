# ステップ6: FRG作成レポート

## 概要

本レポートでは、Deductive Reasoning（演繹的推論）のFunction Realization Graph（FRG）作成過程における各ステップでの判断理由、マージの根拠、UC紐づけの妥当性、機能詳細の説明を記述する。

## ステップ1: TLFの段階的分解

### 分解方針

演繹的推論を、その実現に必要な部分機能に段階的に分解した。

**Level 2の分解**:
演繹推論を4つの主要機能に分解：
1. **Premise-Structuring**: 前提の構造化
2. **Rule-Application**: 規則の適用
3. **Validity-Verification**: 妥当性の検証
4. **Output-Generation**: 出力の生成

この分解は、演繹推論の段階的プロセス（材料準備 → 推論実行 → 検証 → 出力）を反映している。

**Level 3の分解**:
各Level 2ノードをさらに2つの部分機能に分解：
- Premise-Structuring → Episodic-Memory-Integration, Context-Application
- Rule-Application → Rule-Selection, Relational-Integration
- Validity-Verification → Error-Detection, Confidence-Evaluation
- Output-Generation → Action-Selection, Memory-Update

各ノードは、認知心理学・神経科学で確立された概念に対応している。

### 分解の妥当性

- **機能的完全性**: TLFを実現するすべての要素が含まれている
- **親子関係の十分性**: 各親ノードの機能が、その子ノード群によって十分に実現される
- **各GNの独立性**: 各ノードが明確で独立した機能を表現
- **適切な粒度**: 過度に細分化されておらず、メゾスコピックレベルとして適切

## ステップ2: 冗長性の削減とノードのマージ

### 冗長性の分析結果

初期分解を分析した結果、**マージすべき冗長なノードは存在しない**と判断した。

**理由**:
1. Level 2の4つのノードは、演繹推論の段階的プロセスとして明確に区別される
2. Level 3の各ノードも機能的に独立している
3. 過度に細分化されておらず、UCとの紐づけ（ステップ3）を考慮すると適切な粒度

### 最適化の方針

現在の分解において、以下の点が最適化されている：
- 機能的完全性
- 冗長性の排除
- 適切な粒度
- バランスの取れた分岐構造
- 解釈可能性

## ステップ3: UCとの紐づけ - 制約との格闘

### 初期戦略と問題の発見

**当初の計画**:
Level 3の8つのリーフノードを、HCDで定義されたUCに紐づける。

**発見された問題**:
ROI内のUCが**2つしかない**（`U.RLPFC-Lateral`, `U.RLPFC-Medial`）ため、以下の制約を満たすことが困難：
- 制約1: 各GNは複数（最低2個）のUCに分解される
- 制約2: 各GNは最大2つのUCに接続
- 制約3: 各UCは最大2つのGNに接続

### 試行錯誤の過程

#### 試行1: Level 3ノードを直接UCに紐づける

8つのリーフノードを2つのUCに紐づけようとしたが、各UCに4つのGNが接続することになり、制約3を違反。

#### 試行2: Level 2ノードを2つの上位ノード（Level 1.5）に統合

Level 2の4つのノードを2つに統合:
- Information-Processing (Premise-Structuring + Rule-Application)
- Verification-And-Output (Validity-Verification + Output-Generation)

しかし、この統合は機能的な意味を失う可能性があり、また各UCに2つのGNが接続するが、GNの数が少なすぎて機能階層が失われる。

#### 試行3: TLFから直接UCへ

最終的に、**TLFから直接2つのUCに分解する**という最もシンプルな構造を採用。

```
R.Deductive-Reasoning → U.RLPFC-Medial, U.RLPFC-Lateral
```

### 採用した構造の妥当性

**制約の充足**:
- 制約1: TLFが複数（2個）のUCに分解される ✓
- 制約2: TLFは2つのUCに接続 ✓
- 制約3: 各UCは1つのノード（TLF）から接続を受ける ✓

**利点**:
- シンプルで明確
- 制約を完全に満たす
- UCレベルでの詳細な機能記述（HCD）が既に存在するため、GNレベルでの中間階層は必須ではない

**欠点**:
- 機能の階層的分解が失われる
- TLFとUCの間の中間的な機能記述がない

### 根本的な問題

instruction_2_FRG.mdの制約（各GNは複数のUCに分解、各UCは最大2つのGNに接続）は、**ROI内のUCが十分な数（少なくとも4個以上）存在することを前提としている**。

ROI内のUCが2つしかない場合、意味のある機能階層を構築しながら制約を満たすことは、数学的に困難である：
- 4つ以上のGNを持つ階層を作ると、2つのUCに均等に分散しても各UCに2つ以上のGNが接続する
- GN数を2つ以下に抑えると、機能階層がほとんど存在しなくなる

## ステップ4: Interfaceの追加

### Interface定義の戦略

最終的なFRG構造（TLF→2UC）において、TLFのInterfaceは、2つのUCの入出力を統合したものとして定義した。

**TLF Interface**:
```
([U.rACC], [U.PMC], [U.DLPFC], [U.dACC], [U.MDT], [U.PPC-SPL], [U.PPC-IPL]) = 
  R.Deductive-Reasoning([U.HPC], [U.mPFC], [U.PPC-SPL], [U.PPC-IPL], [U.DLPFC], [U.MDT], [U.dACC], [U.BLA])
```

### Interface の妥当性

**入力**:
- エピソード記憶: [U.HPC]
- タスク文脈: [U.mPFC]
- 規則構造: [U.PPC-SPL], [U.PPC-IPL]
- 作業記憶: [U.DLPFC]
- 認知制御: [U.MDT]
- エラーモニタリング: [U.dACC]
- 情動文脈: [U.BLA]

**出力**:
- 情動評価: [U.rACC]
- 行動選択: [U.PMC]
- 作業記憶更新: [U.DLPFC]
- モニタリング: [U.dACC]
- 認知制御: [U.MDT]
- 規則更新: [U.PPC-SPL], [U.PPC-IPL]

すべてのnoROI(input)とnoROI(output)が含まれており、TLFのInterfaceとして完全である。

## ステップ5: 機能関連項目の定義

### TLFの機能詳細

TLFのみの構造であるため、TLF（R.Deductive-Reasoning）の機能詳細（Requirement, Requirement realization by interface, Capability, Mechanism）を詳細に記述した。

#### Requirement

演繹推論を実現するための機能を、すべての入出力UCとそのOutput Semanticsを明示的に記述しながら定義した。

**記述の特徴**:
- 入力情報（一般規則、特定問題、サポート情報）の明確化
- 出力情報（論理的結論、フィードバック）の明確化
- 処理内容（規則と問題の統合、妥当性検証、認知制御）の記述

#### Requirement realization by interface

Interfaceで定義された13個のUCすべてを参照し、演繹推論がどのように実現されるかを3段階（前提の構築、関係統合、出力）で詳細に記述した。

**記述の特徴**:
- 各UCの役割を明示
- 情報フローの段階的記述
- Output Semanticsの活用

#### Capability

演繹推論を、ドメインに依存しない一般的な計算能力として記述した。

**記述の特徴**:
- 入出力の一般化
- 計算プロセスの段階的記述
- 神経科学的根拠（Monti, Prado, Wendelken, Bludauら）の引用
- 計算論的根拠（Halfordの関係的複雑性理論）の引用

#### Mechanism

2つの中核回路（U.RLPFC-Medial, U.RLPFC-Lateral）の協調により演繹推論が実現される神経メカニズムを詳細に記述した。

**記述の特徴**:
- Default Mode NetworkとExecutive Control Networkの協調
- 動的結合メカニズム（Duncan et al., 2020）
- Phase synchrony、functional connectivity
- Top-down effective connectivity
- エラーモニタリングと認知制御の役割

### 機能記述の学術的妥当性

**強み**:
1. すべてのUCとそのOutput Semanticsを参照した包括的記述
2. 神経科学的証拠に基づく記述
3. 計算論的理論との整合性
4. 2つのネットワーク（DMN, ECN）の協調という最新の神経科学的知見の反映

**限界**:
1. TLFレベルでの記述のため、中間的な機能階層の記述が欠如
2. UC数の制約により、機能分解の詳細度が制限される

## 全体的な評価と今後の課題

### FRG構成の評価

**達成されたこと**:
1. ✓ TLFからUCへの紐づけが完了
2. ✓ すべての制約を満たす構造
3. ✓ InterfaceとOutput Semanticsの活用
4. ✓ 神経科学的根拠に基づく機能記述
5. ✓ csvファイルの作成

**制限**:
1. ✗ 機能の階層的分解が浅い（TLF→UCの2階層のみ）
2. ✗ 中間的なGNが存在しない
3. ✗ ステップ1で作成した詳細な機能分解（8つのLevel 3ノード）がFRGに反映されていない

### ROI内UC数の影響

本FRG作成において、**ROI内のUC数が2つという制約**が、FRGの構造に決定的な影響を与えた。

**理論的分析**:
- n個のUCに対し、制約を満たしながら配置できるGNの最大数は2n個
- UC数が2の場合、最大でも4つのGNしか配置できない
- 意味のある機能階層（3階層以上）を構築するには、少なくとも4個以上のROI内UCが必要

### 他のケースとの比較可能性

もし別のTLFでROI内UCが4個以上ある場合、より豊かな機能階層を持つFRGが構築可能である。本ケースは、**UC数が少ない場合の最小構成例**として価値を持つ。

### 今後の改善の方向性

1. **ROIの拡大**: より多くのUCをROI内に含めることで、階層的FRGが構築可能になる
2. **制約の緩和**: instruction_2_FRG.mdの制約（各UCは最大2つのGNに接続）を緩和することで、より詳細な機能分解が可能
3. **UC定義の細分化**: HCD作成時に、RLPFC-LateralやRLPFC-Medialをさらに細分化する

## 結論

Deductive ReasoningのFRG作成は、ROI内UC数の制約により、最もシンプルな構造（TLF→2UC）となった。しかし、TLFレベルでの機能記述（Requirement, Capability, Mechanism）を詳細に行うことで、演繹推論の神経計算基盤を包括的に記述することができた。

本FRGは、UC数が少ない場合のFRG構成の事例として、また、HCDとFRGの統合的理解の出発点として、重要な意義を持つ。
