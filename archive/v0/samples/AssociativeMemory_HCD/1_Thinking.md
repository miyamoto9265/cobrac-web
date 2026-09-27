# ステップ1: ROIとTLFの妥当性検証

## TLF（トップレベル機能）
**Associative memory（連合記憶）**: 以前には無関係であった2つの刺激の間にリンクを形成する能力。その後、一方の刺激が提示されると、もう一方の刺激の想起が活性化される。

## ROIの決定

### 調査結果
連合記憶に関する最新の神経科学的知見（2025-2026）を調査した結果、以下の脳領域が連合記憶の中核的役割を果たすことが判明した：

1. **海馬（Hippocampus）**: 連合記憶における最も重要な中心的領域
   - CA1, CA3, 歯状回（DG）の各サブ領域が異なる役割を担う
   - Pattern separation（DG）とpattern completion（CA3）による記憶形成
   - CA1での記憶の安定化と検索

2. **嗅内皮質（Entorhinal Cortex, EC）**: 海馬への主要な入力経路
   - 外側嗅内皮質（LEC）と内側嗅内皮質（MEC）が異なる情報を提供
   - Grid cellベースの空間的スキャフォールディング

3. **嗅周皮質（Perirhinal Cortex, PRC）**: 物体特徴と連合の処理
   - 海馬への腹内側ゲートウェイ
   - 物体認識と特徴間の連合

### ROIの選定理由
本HCDでは、**海馬（Hippocampus）**をROIとして選定する。

**理由**:
- 連合記憶の中核的計算機構（heteroassociative memory）が海馬内で実装される
- CA3のリカレント回路が連合記憶のコアメカニズムを担う
- 海馬は連合記憶において、単なる中継点ではなく、計算の中心である
- 最新の研究（Chandra-Sharma et al., 2025, Nature）により、海馬が高容量の連合記憶を空間的スキャフォールドに基づいて実装するVector-HaSHモデルが提唱されている

### ROIの神経組織構造
海馬は以下のサブ領域から構成される：
- **歯状回（Dentate Gyrus, DG）**: Pattern separationと時間的順序形成
- **CA3**: リカレント回路による連合記憶形成、シーケンス生成
- **CA1**: 記憶の安定化、検索、出力形成

### ROI_Input（ROIへの主要入力情報）

1. **嗅内皮質（EC）からの入力**
   - 内側嗅内皮質（MEC）: 空間情報、grid cell活動、時間的精度の提供
   - 外側嗅内皮質（LEC）: 物体情報、文脈情報
   
2. **嗅周皮質（PRC）からの入力**
   - 物体の特徴情報
   - 既存の物体間連合

3. **海馬内のリカレント入力**
   - CA3リカレント接続: パターン補完、連合想起

### ROI_Output（ROIからの主要出力情報）

1. **嗅内皮質へのフィードバック**
   - CA1 → EC layer 5（disynaptic pathway）
   - CA1 → EC（monosynaptic pathway）
   - 形成された連合記憶の表現

2. **皮質下構造への出力**
   - CA1 → Subiculum → 他の皮質領域
   - 想起された連合情報

### TLFとROIの整合性

**妥当性**: 海馬は連合記憶のTLFを実現するのに極めて適切なROIである。

**神経科学的根拠**:
- Chandra-Sharma et al. (2025) "Episodic and associative memory from spatial scaffolds in the hippocampus" Nature. 
  - 海馬がgrid cellベースのスキャフォールドを用いて高容量の連合記憶を実装することを示した
  - Vector-HaSHモデルにより、CA3のリカレント結合が連合記憶の中核であることが理論的・実験的に検証された

- Wang et al. (2025) "Formation of an expanding memory representation in the hippocampus" Nature Neuroscience.
  - CA1での記憶形成には、安定したplace cellの進行的形成が関与
  - 行動時間スケールのシナプス可塑性（BTSP）による記憶の安定化

- Yamamoto et al. (2025) "Direct entorhinal control of CA1 temporal coding" Nature Communications.
  - ECからCA1への直接入力が時間的コーディングを制御
  - 学習と表現の更新を駆動

- Igarashi et al. (2025) "Hippocampus shapes entorhinal cortical output through a direct feedback circuit" Nature Neuroscience.
  - 海馬からECへの2つの並行フィードバック経路の発見

### 情報処理の概要

連合記憶における海馬の情報処理は以下のように進行すると考えられる：

1. **入力段階**: ECとPRCから物体情報、空間情報、文脈情報がDGとCA3に入力される
2. **Pattern separation**: DGが入力パターンを分離し、類似した入力を区別可能にする
3. **連合形成**: CA3のリカレント回路が異なる刺激間の連合を形成（Hebbian learning）
4. **安定化と統合**: CA1が連合記憶を安定化し、ECへフィードバック
5. **想起**: 一方の刺激の提示により、CA3のpattern completionを通じて連合した刺激が想起される

この情報処理フローは、TLFである「以前には無関係であった2つの刺激間のリンク形成」を実現する。

### 次のステップ
ステップ2では、ROI（海馬）内の神経接続を網羅的に調査し、BIFを構築する。特に以下の接続に注目する：
- EC → DG/CA3/CA1
- DG → CA3
- CA3 → CA3（リカレント）
- CA3 → CA1
- CA1 → EC
- PRC → EC → 海馬のルート
