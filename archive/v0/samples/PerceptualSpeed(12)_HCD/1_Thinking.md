# Perceptual Speed HCD: ステップ1 思考過程と分析ログ

## TLF（Top Level Function）
**Perceptual Speed**: 文字、数字、物体、図柄、パターンの集合間の類似性と相違点を迅速かつ正確に比較する能力。比較される対象は同時に提示される場合もあれば、一つずつ順番に提示される場合もある。この能力には、提示された物体と記憶された物体を比較することも含まれる。

## ROI（Region of Interest）の決定

### 文献調査結果

#### 1. Perceptual Speedに関与する主要な脳領域
Liu et al. (2025)による最新のfMRI研究により、以下の分散ネットワークが特定されている：
- **腹側側頭後頭皮質（Ventral Temporal-Occipital Cortex）**: カテゴリー特異的な視覚表現
- **頭頂間溝（Intraparietal Sulcus, IPS）**: 数字・文字の認識と比較処理
- **中前頭回（Middle Frontal Gyrus）**: 高次認知制御
- **島皮質（Insula）**: タスク処理への関与

参考文献: Liu et al. (2025). Brain-wide Decoding of Numbers and Letters: Converging Evidence from Multivariate fMRI Analysis and Probabilistic Meta-Analysis. Stanford Med.

#### 2. 視覚処理速度に関する神経基盤
- **外線条視覚皮質（V2/BA18）**: 方位、輪郭、エッジ、色の検出などの早期視覚処理
- **前頭前皮質（Prefrontal Cortex）**: 視覚刺激に関する予測と期待を伴う高次知覚段階
- **視覚処理経路**: 低次感覚領域と高次皮質領域間のフィードフォワード・フィードバック接続

参考文献: DROracle AI (2024). What is perceptual speed? https://www.droracle.ai/articles/283598/what-is-perceptual-speed

#### 3. 視覚比較処理の時間的側面
- **後頭頂皮質の役割**: 視覚パターンの関係性符号化（relational coding）
- **N1成分（80-140ms）**: 視覚弁別処理に関連する頭頂後頭成分
- **側頭葉頂頂皮質**: パターン類似性の時間的非対称性を用いた迅速な認識決定

参考文献: 
- Nature Communications (2025). Temporal asymmetry of neural pattern similarity predicts recognition memory decisions.
- eNeuro (2025). The Speed of Visual Discrimination Differs between Foveola and Perifovea.

#### 4. 背側流と腹側流の統合
- **頭頂間溝（IPS）**: 腹側視覚流への調整入力を提供
- **紡錘状回（Fusiform Gyrus）**: 操作可能物体の視覚処理（IPSからの入力を受ける）
- **弓状束（Arcuate Fasciculus）**: 頭頂-側頭間の白質接続

参考文献: Sciety Labs (2025). Visual processing of manipulable objects in the ventral stream is modulated by inputs from parietal action systems.

### ROIの選定

上記の文献調査に基づき、Perceptual Speedの中核的な神経基盤として、以下の領域を**ROI**とします：

**ROI: 頭頂間溝（Intraparietal Sulcus, IPS）**

#### 選定理由
1. **視覚比較処理の中核**: IPSは数字、文字、パターンの認識と比較処理に直接関与している（Liu et al., 2025）
2. **関係性符号化**: 視覚パターン間の類似性比較を支える関係性符号化を実行（Nature Communications, 2025）
3. **視覚-記憶統合**: 提示された刺激と記憶された刺激の比較に関与
4. **機能的細分化**: hIP1, hIP2, hIP3など、異種の接続プロファイルを持つ機能的サブ領域を含む
5. **背側-腹側統合**: 腹側視覚流への調整入力を提供し、視覚情報処理を統合

### ROIの入出力情報の整理

#### ROI_Input（IPSへの入力）
1. **初期視覚特徴**: V1/V2からの基本的な視覚特徴（方位、エッジ、色）
2. **高次視覚表現**: 腹側側頭後頭皮質（VTC）からのカテゴリー特異的表現（文字、数字、物体）
3. **空間情報**: 後頭頂皮質からの空間的配置情報
4. **記憶情報**: 前頭前皮質/側頭葉からの記憶表現（比較対象となる記憶された刺激）
5. **注意制御信号**: 前頭前皮質からのトップダウン注意信号

#### ROI_Output（IPSからの出力）
1. **比較結果**: 刺激間の類似性/相違性の判定結果
2. **決定信号**: 前頭前皮質への比較完了および決定信号
3. **視覚調整信号**: 腹側視覚流（紡錘状回など）への調整信号
4. **運動準備信号**: 前運動野への反応準備信号（必要な場合）

### TLF実現の妥当性評価

頭頂間溝（IPS）は、Perceptual Speedを実現するために以下の理由で適切である：

1. **比較計算の実行**: IPSは視覚刺激間の関係性を符号化し、類似性比較を直接実行する神経基盤を持つ
2. **時間的効率性**: IPSのニューロン集団は迅速な比較処理を支える動的な再構成能力を持つ
3. **マルチモーダル統合**: IPSは視覚情報と記憶情報を統合し、現在の刺激と記憶された刺激の比較を可能にする
4. **分散ネットワークの中核**: IPSは視覚入力系（V1/V2, VTC）と決定出力系（PFC）を結ぶ中核ノードとして機能

### 次のステップへ

ROI（IPS）の妥当性が確認されたため、次のステップ2（BIF構築）に進む。IPS内部および周辺領域との神経接続を網羅的に調査する。
