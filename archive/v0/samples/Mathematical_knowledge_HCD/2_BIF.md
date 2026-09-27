# ステップ2: BIF（Brain Information Flow）の構築

## BIF（Brain Information Flow）とは

BIFは、神経細胞の解剖学的投射の有無に関するデータであり、UC間のConnectionを定義する際の神経科学的根拠となる。

## ROIの確認

**ROI: 両側頭頂間溝（Bilateral Intraparietal Sulcus, IPS）および下側頭回/腹側側頭皮質（Inferior Temporal Gyrus / Ventral Temporal Cortex, ITG/VTC）**

ROI内の組織として以下を含む：
- 頭頂間溝の細分化領域（IPS0-4, hIP1-3）
- 紡錘状回（Fusiform Gyrus, FG）
- 下側頭回（Inferior Temporal Gyrus, ITG）

## BIF一覧表

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| V1（一次視覚野） | V2（二次視覚野） | 初期視覚処理の階層的投射 | Hubel & Wiesel, 1962; https://pubmed.ncbi.nlm.nih.gov/14449617/ |
| V2 | V3 | 腹側視覚経路の初期段階、色と形状処理 | Felleman & Van Essen, 1991; https://pubmed.ncbi.nlm.nih.gov/1822724/ |
| V2 | V4 | 腹側視覚経路、色と形状の高次処理 | Felleman & Van Essen, 1991; https://pubmed.ncbi.nlm.nih.gov/1822724/ |
| V3 | V4 | 形状と色の統合 | Felleman & Van Essen, 1991; https://pubmed.ncbi.nlm.nih.gov/1822724/ |
| V4 | 紡錘状回（FG） | 高次視覚特徴の処理、物体認識の初期段階 | Winawer et al., 2010; https://pubmed.ncbi.nlm.nih.gov/20203168/ |
| V4 | 下側頭回（ITG） | 物体認識のための視覚情報の伝達 | Kravitz et al., 2013; https://pubmed.ncbi.nlm.nih.gov/23664452/ |
| V2 | IPS（後部） | 腹側から背側経路への接続、視覚-空間統合 | Felleman & Van Essen, 1991; https://pubmed.ncbi.nlm.nih.gov/1822724/ |
| V3 | IPS（後部） | 視空間情報の処理 | Felleman & Van Essen, 1991; https://pubmed.ncbi.nlm.nih.gov/1822724/ |
| V4 | IPS（後部） | 視覚的注意と物体位置の統合 | Schmid et al., 2009; https://pubmed.ncbi.nlm.nih.gov/19005055/ |
| 紡錘状回（FG） | IPS | IPS-FG白質路による直接的な接続、視覚と空間情報の統合 | Takemura et al., 2020; https://www.nature.com/articles/s41598-020-72471-z |
| IPS | 紡錘状回（FG） | IPS-FG白質路による双方向接続、トップダウン調節 | Takemura et al., 2020; https://www.nature.com/articles/s41598-020-72471-z |
| 紡錘状回（FG） | 下側頭回（ITG） | 腹側側頭皮質内での物体表象の精緻化 | Grill-Spector & Weiner, 2014; https://pubmed.ncbi.nlm.nih.gov/24507194/ |
| 下側頭回（ITG） | 角回（AG）（ROI外） | 意味記憶の検索、数学的事実の想起 | Seghier, 2013; https://pubmed.ncbi.nlm.nih.gov/23391586/ |
| 下側頭回（ITG） | 外側下前頭前野（LIPFC）（ROI外） | 視覚情報の作業記憶への転送 | Fuster & Bauer, 1974; https://pubmed.ncbi.nlm.nih.gov/4206020/ |
| IPS（後部） | IPS（前部） | IPS内の階層的情報処理 | Konen & Kastner, 2008; https://pubmed.ncbi.nlm.nih.gov/18297740/ |
| IPS（前部） | 角回（AG）（ROI外） | 数量情報から算術的事実への変換 | Uddin et al., 2010; https://pubmed.ncbi.nlm.nih.gov/20154013/ |
| IPS | 外側前頭前野（LPFC）（ROI外） | 数量情報の作業記憶への投射 | Boisgueheneuc et al., 2006; https://pubmed.ncbi.nlm.nih.gov/16707737/ |
| 背外側前頭前野（dlPFC）（ROI外） | IPS | 作業記憶とトップダウン制御信号 | Selemon & Goldman-Rakic, 1988; https://pubmed.ncbi.nlm.nih.gov/2464074/ |
| 背外側前頭前野（dlPFC）（ROI外） | 紡錘状回（FG） | トップダウン注意制御 | Miller & Cohen, 2001; https://pubmed.ncbi.nlm.nih.gov/11283309/ |
| 角回（AG）（ROI外） | IPS | 事実検索から数量処理へのフィードバック | Uddin et al., 2010; https://pubmed.ncbi.nlm.nih.gov/20154013/ |
| 視床（Pulvinar核）（ROI外） | IPS | 視覚的注意の調節 | Saalmann et al., 2012; https://pubmed.ncbi.nlm.nih.gov/22405208/ |
| IPS | 視床（ROI外） | 頭頂皮質から視床への投射 | Yeterian & Pandya, 1985; https://pubmed.ncbi.nlm.nih.gov/4093711/ |
| 前帯状皮質（ACC）（ROI外） | IPS | 認知制御信号、タスク遂行のための制御 | Cole et al., 2015; https://pubmed.ncbi.nlm.nih.gov/25778346/ |
| IPS | 前帯状皮質（ACC）（ROI外） | 認知負荷情報のフィードバック | Cole et al., 2015; https://pubmed.ncbi.nlm.nih.gov/25778346/ |
| 線条体（Striatum）（ROI外） | IPS | 報酬と学習に関連する信号 | Schultz et al., 1997; https://pubmed.ncbi.nlm.nih.gov/9054347/ |
| IPS | 線条体（Striatum）（ROI外） | 頭頂皮質から基底核への投射 | Yeterian & Pandya, 1991; https://pubmed.ncbi.nlm.nih.gov/1688763/ |
| 海馬（Hippocampus）（ROI外） | IPS | エピソード記憶と数学的事実の文脈情報 | Qi et al., 2022; https://pubmed.ncbi.nlm.nih.gov/35082315/ |
| IPS | 運動前野（Premotor cortex）（ROI外） | 数学的応答の運動計画 | Rizzolatti et al., 1998; https://pubmed.ncbi.nlm.nih.gov/9506546/ |
| 角回（AG）（ROI外） | 下側頭回（ITG） | 意味情報の精緻化のためのフィードバック | Seghier, 2013; https://pubmed.ncbi.nlm.nih.gov/23391586/ |
| 外側下前頭前野（LIPFC）（ROI外） | 下側頭回（ITG） | トップダウン制御と検索信号 | Fuster, 2001; https://pubmed.ncbi.nlm.nih.gov/11283309/ |
| 紡錘状回（FG） | 外側後頭皮質（LOC）（ROI外） | 物体認識のための情報 | Grill-Spector et al., 2001; https://pubmed.ncbi.nlm.nih.gov/11157290/ |
| Broca野（ROI外） | IPS | 数学的ステートメントの構文解析情報（言語構造のみ） | Amalric & Dehaene, 2016; https://pubmed.ncbi.nlm.nih.gov/27143744/ |
| Wernicke野（ROI外） | 下側頭回（ITG） | 言語的数学概念の処理 | Amalric & Dehaene, 2016; https://pubmed.ncbi.nlm.nih.gov/27143744/ |

## BIF構築の注意点

1. **ROI内とROI外の区別**
   - ROI内: IPS（細分化領域を含む）、紡錘状回（FG）、下側頭回（ITG）
   - ROI外: 角回（AG）、前頭前野（LPFC, dlPFC, LIPFC）、視床、線条体、海馬、前帯状皮質（ACC）、運動前野、Broca野、Wernicke野、視覚野（V1-V4）、外側後頭皮質（LOC）

2. **接続の性質**
   - 多くの接続は双方向的（フィードフォワードとフィードバック）
   - IPS-FG白質路は直接的で強固な解剖学的接続
   - 前頭前野からの投射は主にトップダウン制御を媒介

3. **数学的知識に特異的な接続**
   - IPS ↔ 角回: 数量表現と算術的事実の相互変換
   - ITG → 角回: 数学的概念の意味的表象の検索
   - IPS ↔ ITG（FG経由）: 数量的側面と概念的側面の統合

4. **文献的裏付け**
   - すべてのBIFは実験的証拠に基づく
   - 多くは霊長類の神経解剖学研究と人間の神経画像研究の両方で確認されている
   - 数学的処理に特異的な接続は、Amalric & Dehaene（2016, 2018, 2019）らの研究で詳細に記述されている

## 参考文献

主要な参考文献:
1. Felleman, D. J., & Van Essen, D. C. (1991). Distributed hierarchical processing in the primate cerebral cortex. Cerebral cortex, 1(1), 1-47.
2. Takemura, H., Kruper, J., Miyata, T., & Rokem, A. (2020). Identification of a distinct association fiber tract "IPS-FG" to connect the intraparietal sulcus areas and fusiform gyrus by white matter dissection and tractography. Scientific Reports, 10(1), 15402.
3. Amalric, M., & Dehaene, S. (2016). Origins of the brain networks for advanced mathematics in expert mathematicians. Proceedings of the National Academy of Sciences, 113(18), 4909-4917.
4. Seghier, M. L. (2013). The angular gyrus: multiple functions and multiple subdivisions. The Neuroscientist, 19(1), 43-61.
5. Cole, M. W., Ito, T., Bassett, D. S., & Schultz, D. H. (2016). Activity flow over resting-state networks shapes cognitive task activations. Nature neuroscience, 19(12), 1718-1726.
6. Uddin, L. Q., Supekar, K., Amin, H., Rykhlevskaia, E., Nguyen, D. A., Greicius, M. D., & Menon, V. (2010). Dissociable connectivity within human angular gyrus and intraparietal sulcus: evidence from functional and structural connectivity. Cerebral cortex, 20(11), 2636-2646.
