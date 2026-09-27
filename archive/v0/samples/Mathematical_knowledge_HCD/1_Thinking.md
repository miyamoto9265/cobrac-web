# ステップ1: ROIとTLFの妥当性検証

## TLF（Top Level Function）
**Mathematical knowledge: Range of general knowledge about mathematics, not the performance of mathematical operations or the solving of math problem**

数学的知識の範囲は、数学的操作の実行や数学問題の解決ではなく、数学に関する一般的な知識の保持と検索を指す。これは意味記憶の一種であり、「正弦関数は周期的である」や「素数は1と自身のみで割り切れる」といった数学的事実の表象を含む。

## ROIの決定

### 調査結果の要約

文献調査により、数学的知識の表象には以下の脳領域が関与することが明らかになった：

1. **両側頭頂間溝（Bilateral Intraparietal Sulcus, IPS）**
   - 数処理、計算、代数的操作など、あらゆる数学的処理で一貫して活性化される（Amalric & Dehaene, 2016, 2018）
   - 数学的知識の中核的なハブとして機能
   - 数量表現や数的推論に関与

2. **下側頭回（Inferior Temporal Gyrus, ITG）/ 腹側側頭皮質（Ventral Temporal Cortex, VTC）**
   - 数学的内容に対して、領域や難易度に関わらず応答（Amalric & Dehaene, 2019）
   - 数学的処理の選好が数字の視覚的認識よりも優先される（Grotheer et al., 2018）
   - 数学的概念の意味的表象を保持

3. **角回（Angular Gyrus, AG）**
   - 特に左角回は算術的事実の検索を媒介する（Grabner et al., 2009）
   - 数学的記憶の想起に重要な役割
   - 意味記憶システムの一部として機能

4. **前頭前野（Prefrontal Cortex, PFC）**
   - 特に外側下前頭前野（Lateral Inferior Prefrontal Cortex, LIPFC）が宣言的数学的事実の検索に関与
   - 作業記憶と認知制御を介して数学的知識の検索と操作を支援

### 重要な発見：言語からの独立性

Amalric & Dehaeneらの研究により、数学的知識は言語野や古典的な意味記憶領域（側頭葉の言語関連領域）から解剖学的・機能的に分離されていることが示された。数学的反省は言語関連領域をスキップし、両側の頭頂間溝と腹側側頭領域を再利用する。

### ROIの選定

上記の調査結果に基づき、数学的知識（Mathematical knowledge）のTLFを実現するROIとして、以下を選定する：

**ROI: 両側頭頂間溝（Bilateral Intraparietal Sulcus, IPS）および下側頭回/腹側側頭皮質（Inferior Temporal Gyrus / Ventral Temporal Cortex）**

この選定の理由：
- IPSは数学的処理の中核的なハブであり、数量表現と数学的推論を担う
- ITG/VTCは数学的概念の意味的表象を保持し、数学的内容に特異的に応答する
- この2つの領域は解剖学的に「IPS-FG」白質路で接続されており（Takemura et al., 2020）、機能的にも統合されている
- 角回や前頭前野も重要だが、これらはIPSやITG/VTCからの入力を受けて事実検索や作業記憶を支援する下流/補助的な役割を果たすため、ROI外の入出力組織として扱う

## ROIの入出力情報

### ROI_Input（ROIに入力される情報）

1. **視覚的数学情報**
   - 後頭葉視覚野から：数字、数式、幾何学的図形などの視覚的表象
   - 視覚単語形態領域（VWFA）から：数学的記号や文字の視覚的処理

2. **言語的数学情報**
   - 左半球言語野（Broca野、Wernicke野）から：数学的ステートメントの構文解析（ただし数学的内容そのものではなく、言語構造のみ）

3. **作業記憶情報**
   - 外側前頭前野（Lateral Prefrontal Cortex）から：検索のための制御信号、作業記憶内容
   - 前帯状皮質/補足運動野（ACC/SMA）から：タスク制御信号

4. **意味記憶検索信号**
   - 角回（Angular Gyrus）から：事実検索のための制御信号（フィードバック接続）

5. **聴覚的数学情報**
   - 聴覚野から：口頭で提示された数や数学的概念

### ROI_Output（ROIから出力される情報）

1. **数学的意味情報**
   - 角回（Angular Gyrus）へ：検索された数学的事実、数学的概念の意味的表象
   - 前頭前野へ：数学的知識の内容、推論の基礎となる情報

2. **数量情報**
   - 前頭頂皮質（Frontal-Parietal Network）へ：数量の大小関係、数的関係性

3. **作業記憶への投射**
   - 外側前頭前野へ：検索された数学的知識を作業記憶に保持するための信号

4. **運動制御への投射**
   - 運動前野/一次運動野へ：数学的応答の準備（例：答えを発話するための運動計画）

## TLFとROIの妥当性の結論

指定されたTLF「Mathematical knowledge: Range of general knowledge about mathematics」は、数学的操作の実行ではなく、数学的事実や概念の表象と検索に焦点を当てている。

選定したROI（両側IPS + ITG/VTC）は、以下の理由から妥当である：

1. **神経科学的証拠の強さ**: 複数の高品質な研究（Amalric & Dehaene, 2016, 2018, 2019; Grotheer et al., 2018など）が、これらの領域が数学的知識の表象に特異的に関与することを示している

2. **言語からの独立性**: 数学的知識は言語とは独立したシステムであり、IPSとITG/VTCはこの独立したネットワークの中核を成す

3. **機能的適合性**: IPSは数量的側面、ITG/VTCは概念的・意味的側面を担い、両者が統合されることで数学的知識が実現される

4. **解剖学的接続**: IPS-FG白質路により、これら2つの領域は直接的に接続されており、機能的統合が可能

5. **操作との分離**: 計算実行や問題解決には前頭前野のより広範なネットワークが必要だが、知識そのものの表象はIPSとITG/VTCで十分に説明可能

したがって、ROIとして「両側頭頂間溝（Bilateral IPS）および下側頭回/腹側側頭皮質（ITG/VTC）」を採用することは神経科学的に妥当であり、TLFの実現に適している。

## 参考文献

1. Amalric, M., & Dehaene, S. (2016). Origins of the brain networks for advanced mathematics in expert mathematicians. Proceedings of the National Academy of Sciences, 113(18), 4909-4917.

2. Amalric, M., & Dehaene, S. (2018). Cortical circuits for mathematical knowledge: evidence for a major subdivision within the brain's semantic networks. Philosophical Transactions of the Royal Society B, 373(1740), 20160515.

3. Amalric, M., & Dehaene, S. (2019). A distinct cortical network for mathematical knowledge in the human brain. NeuroImage, 189, 19-31.

4. Grabner, R. H., Ansari, D., Koschutnig, K., Reishofer, G., Ebner, F., & Neuper, C. (2009). To retrieve or to calculate? Left angular gyrus mediates the retrieval of arithmetic facts during problem solving. Neuropsychologia, 47(2), 604-608.

5. Grotheer, M., Herrmann, K. H., & Kovács, G. (2016). Neuroimaging evidence of a bilateral representation for visually presented numbers. Journal of Neuroscience, 36(1), 88-97.

6. Grotheer, M., Ambrus, G. G., & Kovács, G. (2016). Causal evidence of the involvement of the number form area in the visual detection of numbers and letters. NeuroImage, 132, 314-319.

7. Grotheer, M., Zhen, Z., Lerma-Usabiaga, G., & Grill-Spector, K. (2018). Separate lanes for adding and reading in the white matter highways of the human brain. bioRxiv, 427435.

8. Lee, K. M. (2000). Cortical areas differentially involved in multiplication and subtraction: a functional magnetic resonance imaging study and correlation with a case of selective acalculia. Annals of neurology, 48(4), 657-661.

9. Takemura, H., Kruper, J., Miyata, T., & Rokem, A. (2020). Identification of a distinct association fiber tract "IPS-FG" to connect the intraparietal sulcus areas and fusiform gyrus by white matter dissection and tractography. Scientific Reports, 10(1), 15402.

10. Menon, V. (2016). Memory and cognitive control circuits in mathematical cognition and learning. Progress in brain research, 227, 159-186.
