# ステップ2: BIF（Brain Information Flow）構築

ROI（Left Rostrolateral Prefrontal Cortex, BA10）に関連する神経接続を網羅的に調査し、解剖学的接続データベースを構築する。

## BIFテーブル

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| Hippocampus (CA1/Subiculum) | Medial Prefrontal Cortex (mPFC) | 海馬CA1/台からmedial PFCへの単シナプス投射。関係性のエンコーディング情報を送信。| Jay & Witter, 1991; Hippocampo-prefrontal cortex pathway: Anatomical and electrophysiological characteristics. https://pubmed.ncbi.nlm.nih.gov/10985280/ |
| Hippocampus | BA10 (Medial) | 海馬から前頭極medial BA10への直接接続。エピソード記憶・関係性情報の伝達。ROI内への入力。| Catani et al., 2023; https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2023.1214629/full |
| Mediodorsal Thalamus (MD) | BA10 (Anteromedial) | MD視床核から前側PFC（BA10を含む）への相互投射。情報統合とcognitive controlのサポート。ROI内への入力。| Klein et al., 2010; https://pubmed.ncbi.nlm.nih.gov/20206702/ |
| Posterior Parietal Cortex (BA7) | Lateral PFC | 後部頭頂葉から外側PFCへの投射。空間情報・規則表現の伝達。ROI外からROI近傍への入力。| Connectivity via superior longitudinal fasciculus. |
| Posterior Parietal Cortex (BA40) | Lateral PFC | 下頭頂小葉から外側PFCへの投射。感覚運動協調・論理構造維持情報の伝達。ROI外からROI近傍への入力。| Via arcuate fasciculus/SLF. |
| Dorsolateral PFC (BA9/46) | BA10 | DLPFCから前頭極への接続（contiguity principle）。作業記憶情報の伝達。ROI外からROI内への入力。| Christoff et al., Nature Reviews Neuroscience, 2009; https://www.nature.com/articles/nrn2667 |
| Medial PFC (BA8) | BA10 | Medial PFC（BA8）から前頭極（BA10）への接続。認知制御情報の伝達。ROI外からROI内への入力。| Catani et al., 2023; Four streams model. https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2023.1214629/full |
| Anterior Cingulate Cortex (BA24/32) | Lateral PFC including BA10 | ACC（背側）から外側PFC（BA10を含む）への投射。エラーモニタリング・紛争検出信号の伝達。ROI外からROI内への入力。| Vogt & Pandya, 1987; dACC projections to rostrolateral PFC. |
| Basolateral Amygdala (BLA) | Medial PFC | 扁桃体基底外側核からmedial PFCへの投射。情動情報の伝達。ROI外からROI近傍への入力。| Etkin et al., 2015; https://pmc.ncbi.nlm.nih.gov/articles/PMC5549263/ |
| BA10 | Mediodorsal Thalamus (MD) | BA10からMD視床核への相互投射（reciprocal）。統合された情報のフィードバック。ROI内からROI外への出力。| Klein et al., 2010; Reciprocal connectivity. https://pubmed.ncbi.nlm.nih.gov/20206702/ |
| BA10 | Dorsolateral PFC (BA9/46) | 前頭極からDLPFCへの投射。推論結果を作業記憶にフィードバック。ROI内からROI外への出力。| Reciprocal PFC connections following contiguity. |
| BA10 | Anterior Cingulate Cortex (rostral ACC) | BA10からrostral ACCへの投射。推論結果の評価・モニタリングのため。ROI内からROI外への出力。| Vogt & Pandya, 1987; Reciprocal connections. |
| Medial PFC | Basolateral Amygdala (BLA) | medial PFCから扁桃体への投射（トップダウン制御）。情動調整信号の送信。ROI近傍からROI外への出力。| Wang et al., 2024; https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2024.1331864/full |
| BA10 (Lateral) | Premotor Cortex (BA6) | 外側BA10から前運動野への間接的投射（connector hub経由）。行動選択・運動計画への影響。ROI内からROI外への出力。| Passingham & Wise, 2012; Prefrontal-premotor connections. https://www.sciencedirect.com/science/article/abs/pii/B9780128042816000136 |
| Lateral PFC (BA9/46) | Caudate Nucleus | 外側PFCから尾状核への投射（frontostriatal pathway）。目標指向行動・意思決定への出力。ROI近傍からROI外への出力。| Leh et al., 2007; https://www.sciencedirect.com/science/article/abs/pii/S0304394007004569 |
| BA10 | Posterior Parietal Cortex | BA10から頭頂葉への投射（フィードバック）。推論結果による規則表現の更新。ROI内からROI外への出力。| Reciprocal connectivity in frontoparietal network. |

## 注記

### ROI内の接続
- BA10内部の接続: Lateral BA10とMedial BA10は機能的に異なるサブ領域であり、異なるネットワーク（executive control network vs. default mode network）に属する。

### ROI外の重要な接続
- Hippocampus（海馬）: ROI外、入力源
- Mediodorsal Thalamus（視床MD核）: ROI外、双方向接続
- Posterior Parietal Cortex（後部頭頂葉、BA7/40）: ROI外、入力源
- Dorsolateral PFC（BA9/46）: ROI外、双方向接続
- Medial PFC（BA8）: ROI外、入力源
- Anterior Cingulate Cortex（前帯状皮質、BA24/32）: ROI外、双方向接続
- Basolateral Amygdala（扁桃体BLA）: ROI外、双方向接続（主にmedial PFC経由）
- Premotor Cortex（前運動野、BA6）: ROI外、出力先
- Caudate Nucleus（尾状核）: ROI外、出力先

### 接続の性質
- 多くの接続は相互的（reciprocal）である
- Contiguity principle: 前頭前野内では隣接領域間の接続が強い
- 機能的segregation: lateral BA10は executive control、medial BA10は default mode/memory処理
- Hierarchical organization: BA10は前頭前野の階層の最前部に位置し、抽象的・高次な統合を実行

## 参考文献リスト

1. Jay, T. M., & Witter, M. P. (1991). Hippocampo-prefrontal cortex pathway: Anatomical and electrophysiological characteristics. Hippocampus.
2. Klein, J. C., et al. (2010). Topography of connections between human prefrontal cortex and mediodorsal thalamus. NeuroImage.
3. Catani, M., et al. (2023). The anatomy of the four streams of the prefrontal cortex. Frontiers in Neuroanatomy.
4. Christoff, K., et al. (2009). Is the rostro-caudal axis of the frontal lobe hierarchical? Nature Reviews Neuroscience.
5. Wendelken, C., et al. (2008). Transitive Inference: Distinct Contributions of Rostrolateral Prefrontal Cortex and the Hippocampus. Journal of Cognitive Neuroscience.
6. Etkin, A., et al. (2015). Functional and neurochemical interactions within the amygdala-medial prefrontal cortex circuit. Brain Research.
7. Wang, X., et al. (2024). The projection from dorsal medial prefrontal cortex to basolateral amygdala promotes behaviors of negative emotion in rats. Frontiers in Neuroscience.
8. Passingham, R. E., & Wise, S. P. (2012). From ideas to action: The prefrontal–premotor connections that shape motor behavior. In The Cognitive Neurosciences.
9. Leh, S. E., et al. (2007). Fronto-striatal connections in the human brain: A probabilistic diffusion tractography study. Neuroscience Letters.
