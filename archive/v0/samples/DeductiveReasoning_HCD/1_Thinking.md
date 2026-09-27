# ステップ1: ROIとTLFの妥当性検証

## TLF
**Deductive Reasoning: The ability to apply general rules to specific problems to produce answers that make sense.**

演繹的推論とは、一般的な規則や原理を特定の問題に適用し、論理的に妥当な結論を導き出す能力である。

## ROIの決定

### 調査結果

ユーザーからROIの指定がなかったため、文献調査に基づいてDeductive Reasoningを実現する脳領域を特定した。

#### 主要な知見

1. **演繹的推論は分散ネットワークで実現される**
   - 単一の脳領域ではなく、複数の領域が協調して機能する
   - 左半球優位のネットワークが形成される

2. **前頭前野の役割**
   - Rostrolateral Prefrontal Cortex (RLPFC, BA10): 関係統合(relational integration)の中核
   - 左RLPFC（特にBA10p）: 演繹的推論の実行における中核領域
   - Medial Prefrontal Cortex (BA8): 演繹的操作のサポート
   - 複数の関係性を統合して論理的結論を導く

3. **頭頂葉の役割**
   - Left Parietal Cortex (BA7, 40): 論理的議論の形式構造の維持
   - 規則の表現と操作をサポート

4. **海馬との相互作用**
   - 海馬: 関係性のエンコーディング（個別の関係の表現）
   - RLPFC: 関係性の統合（複数の関係を組み合わせる）
   - 機能的結合により協調動作

### ROIの選択

文献調査の結果、**左前頭前野吻側部（Left Rostrolateral Prefrontal Cortex, RLPFC, BA10）**を主要なROIとして選択する。

**選択理由:**
1. 演繹的推論における「関係統合」という中核的計算機能を実行
2. 一般的規則を特定の問題に適用するプロセスに直接関与
3. 言語非依存的な演繹的操作を実行
4. 神経画像研究で一貫して活動が報告されている

**参考文献:**
- Monti et al. (2007). Functional neuroanatomy of deductive inference: A language-independent distributed network. NeuroImage.
- Wendelken et al. (2008). Transitive Inference: Distinct Contributions of Rostrolateral Prefrontal Cortex and the Hippocampus. Journal of Cognitive Neuroscience.
- Christoff et al. (2001). Rostrolateral prefrontal cortex involvement in relational integration during reasoning. NeuroImage.

## ROI_InputとROI_Outputの特定

### ROI_Input（RLPFCへの入力情報）

Deductive Reasoningを実現するためにRLPFCに入力される必要がある情報：

1. **一般的規則・原理の表現（Rules）**
   - 起点: Medial Prefrontal Cortex (mPFC), Posterior Parietal Cortex (PPC)
   - 内容: 適用すべき論理規則、前提条件の構造的表現

2. **個別の関係性情報（Relational Representations）**
   - 起点: Hippocampus
   - 内容: 問題に含まれる個別の関係性のエンコーディング

3. **作業記憶情報（Working Memory Contents）**
   - 起点: Dorsolateral Prefrontal Cortex (DLPFC)
   - 内容: 推論過程で保持される中間情報

4. **問題文脈情報（Task Context）**
   - 起点: Ventromedial Prefrontal Cortex (vmPFC), Anterior Cingulate Cortex (ACC)
   - 内容: 目標状態、タスク要求、評価基準

### ROI_Output（RLPFCからの出力情報）

TLFを実現するためにRLPFCから出力されることが期待される情報：

1. **統合された推論結果（Integrated Inference）**
   - 送信先: Premotor cortex, Motor cortex（行動決定系）
   - 内容: 論理的に妥当な結論、適用された規則と特定問題の統合結果

2. **推論プロセスのモニタリング信号**
   - 送信先: Anterior Cingulate Cortex (ACC)
   - 内容: 推論の妥当性、確信度、エラー検出

3. **更新された作業記憶**
   - 送信先: DLPFC
   - 内容: 推論により得られた新規情報、次ステップに必要な情報

## ROIの妥当性評価

### 適切性
**適切である** - 以下の理由により、Left RLPFCはDeductive Reasoningの実現に最適なROIである：

1. **機能的適合性**: 関係統合という演繹推論の中核的計算を実行
2. **実証的裏付け**: 複数のメタアナリシスで一貫した活動が確認されている
3. **計算的妥当性**: 一般規則の特定問題への適用というTLFの定義に直接対応
4. **ネットワーク中心性**: 入力領域（海馬、頭頂葉）と出力領域（運動前野）の結節点

### 想定される情報処理フロー

```
[Input: Rules] → RLPFC ← [Input: Relations from Hippocampus]
       ↓
   Relational Integration
   (規則と特定問題の統合)
       ↓
[Output: Logical Conclusion] → Motor System
```

## 次ステップ

ステップ2では、RLPFC内およびRLPFCへの/からの神経接続を文献調査により網羅的に特定し、BIF（Brain Information Flow）データベースを構築する。
