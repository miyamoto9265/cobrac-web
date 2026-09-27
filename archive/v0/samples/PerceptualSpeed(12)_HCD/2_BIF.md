# Brain Information Flow (BIF) - Intraparietal Sulcus

本ファイルは、Perceptual Speed機能を実現するROI（頭頂間溝: Intraparietal Sulcus, IPS）における神経接続を網羅的に記録したものである。

## BIF表

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| V1 | IPS (posterior, IPS1) | 初期視覚特徴（基本的な視覚情報）の投射。後部IPSは初期視覚野からの入力を強く受ける | Lewis & Van Essen (2000). Corticocortical connections of visual, sensorimotor, and multimodal processing areas in the parietal lobe of the macaque monkey. https://pubmed.ncbi.nlm.nih.gov/11058227/ |
| V2 | IPS (posterior, IPS1-2) | 方位、輪郭、エッジなどの中次視覚特徴の投射 | Lewis & Van Essen (2000). https://pubmed.ncbi.nlm.nih.gov/11058227/ |
| V3 | IPS (posterior) | 視覚特徴の投射、後部IPSへの入力 | Ungerleider et al. (1983). MT connections. https://zenodo.org/records/1229147 |
| V3A | MT/MST | 背側視覚流における動き処理への投射 | Ungerleider et al. (1983). https://zenodo.org/records/1229147 |
| V4 | Fusiform Gyrus | 腹側視覚流における高次視覚処理への投射（ROI外） | Lewis & Van Essen (2000). https://pubmed.ncbi.nlm.nih.gov/11058227/ |
| MT (Middle Temporal Area) | MST | 動き情報の投射。階層的接続パターン（feedforward）を示す | Ungerleider et al. (1983). https://zenodo.org/records/1229147 |
| MT | VIP | 動き情報の投射。VIPは多感覚統合を担う | Ungerleider et al. (1983); Rolls et al. (2023). Multiple cortical visual streams. https://www.oxcns.org/papers/656%20Rolls%20et%20al%202023%20Multiple%20cortical%20visual%20streams.pdf |
| MST | LIP | 視覚動き情報の投射。LIPは空間的注意と眼球運動に関与 | Rolls et al. (2023). https://www.oxcns.org/papers/656%20Rolls%20et%20al%202023%20Multiple%20cortical%20visual%20streams.pdf |
| MST | VIP | 視覚動き情報の投射 | Ungerleider et al. (1983). https://zenodo.org/records/1229147 |
| MST | MIP | 視覚動き情報の投射。MIPは到達運動の視覚ガイドに関与 | Rolls et al. (2023). https://www.oxcns.org/papers/656%20Rolls%20et%20al%202023%20Multiple%20cortical%20visual%20streams.pdf |
| Fusiform Gyrus | IPS (posterior, IP1, IPS1) | 高次視覚表現（文字、数字、物体など）の投射。IPS-FG線維束による接続 | Kamali et al. (2020). Identification of a distinct association fiber tract "IPS-FG". https://www.nature.com/articles/s41598-020-72471-z |
| IPS (posterior, IP1, IPS1) | Fusiform Gyrus | トップダウン調整信号の投射。IPS-FG線維束を介した双方向接続 | Kamali et al. (2020). https://www.nature.com/articles/s41598-020-72471-z |
| Pulvinar (medial) | IPS (inferior posterior areas) | 視覚注意と文脈信号の調整。長距離分岐軸索による同時投射 | Arcaro et al. (2025). Projection Motifs and Wiring Logic of Medial Pulvinar. https://www.jneurosci.org/content/jneuro/45/15/e1837242025.full.pdf |
| Pulvinar (lateral) | IPS | 視覚特異的入力。側方視床枕は視覚入力を強調 | Frontera et al. (2024). Understanding subcortical projections to the lateral posterior thalamic nucleus. https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2024.1430636/full |
| Superior Colliculus | Pulvinar | 視覚-運動情報の中継。視床枕を介したIPS入力（間接的） | Frontera et al. (2024). https://www.frontiersin.org/journals/neuroanatomy/articles/10.3389/fnana.2024.1430636/full |
| LIP (ventral, LIPv) | FEF | 眼球運動制御への強力なフィードフォワード接続 | Harrewijn et al. (2025). Anatomical circuits for flexible spatial mapping. https://www.nature.com/articles/s42003-025-08596-6 |
| LIP (ventral, LIPv) | Superior Colliculus | 眼球運動制御への投射（ROI外） | Harrewijn et al. (2025). https://www.nature.com/articles/s42003-025-08596-6 |
| LIP (dorsal, LIPd) | FEF (feedback) | FEFからのフィードバック接続を受ける。認知制御に関与 | Harrewijn et al. (2025). https://www.nature.com/articles/s42003-025-08596-6 |
| FEF | LIP (dorsal, LIPd) | 注意と眼球運動制御のフィードバック信号 | Harrewijn et al. (2025). https://www.nature.com/articles/s42003-025-08596-6 |
| FEF | IPS (anterior, IPS3-4) | 前頭前野からの認知制御信号。前部IPSは前頭前野と強く接続 | Greenberg et al. (2012). Structural connectivity of visuotopic intraparietal sulcus. https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| IPS (anterior, IPS3-4) | Prefrontal Cortex (dlPFC) | 決定信号と比較結果の投射。前部IPSは前頭前野領域への接続確率が高い | Greenberg et al. (2012). https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| AIP (Anterior Intraparietal Area) | Premotor Cortex (F5) | 把持のための視覚運動変換。高度に選択的な接続 | Luppino et al. (1999). Largely segregated parietofrontal connections. https://link.springer.com/article/10.1007/s002210050833 |
| VIP (Ventral Intraparietal Area) | Premotor Cortex (F4) | 近傍空間の符号化と運動制御への投射 | Luppino et al. (1999). https://link.springer.com/article/10.1007/s002210050833 |
| Prefrontal Cortex (dlPFC) | IPS (hIP1, hIP2, hIP3) | トップダウン注意制御信号。異種の接続プロファイルを示す | Basti et al. (2022). Systems-level decoding reveals the cognitive and behavioral profile. https://www.frontiersin.org/articles/10.3389/fnimg.2022.1074674/full |
| Insula | IPS (all subregions) | タスク関連の制御信号。すべてのIPSサブ領域に類似の接続 | Greenberg et al. (2012). https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| Striatum | IPS (all subregions) | 皮質下からの調整信号 | Greenberg et al. (2012). https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| Thalamus | IPS (all subregions) | 視床からの中継信号 | Greenberg et al. (2012). https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| IPS (posterior) | Superior Temporal Gyrus | 視覚情報の投射。後部IPSは上側頭回と強く接続 | Greenberg et al. (2012). https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |

## 接続の分類

### ROI内の接続（IPS内部）
- LIP (ventral) → FEF への投射（ただしFEFはROI外）
- LIP (dorsal) ← FEF からのフィードバック（ただしFEFはROI外）
- IPS内のサブ領域間の接続は、本調査では詳細な文献が不足しているため、後続のUC定義で適宜補完

### ROI外からの入力
- V1, V2, V3 → IPS: 初期視覚特徴
- MT, MST → VIP, LIP, MIP: 動き情報
- Fusiform Gyrus → IPS: 高次視覚表現（文字、数字、物体）
- Pulvinar → IPS: 視覚注意と文脈信号
- FEF → LIP: 注意と眼球運動制御
- Prefrontal Cortex → IPS: トップダウン注意制御
- Insula, Striatum, Thalamus → IPS: タスク制御と調整信号

### ROI外への出力
- IPS → Fusiform Gyrus: トップダウン調整信号
- LIP → FEF: 眼球運動制御
- LIP → Superior Colliculus: 眼球運動制御
- IPS → Prefrontal Cortex: 決定信号と比較結果
- AIP → Premotor Cortex (F5): 把持運動制御
- VIP → Premotor Cortex (F4): 近傍空間運動制御
- IPS → Superior Temporal Gyrus: 視覚情報

## 注記
- IPSは多数のサブ領域（hIP1, hIP2, hIP3, LIP, AIP, VIP, MIP, IPS1-4など）を含む複雑な構造である
- 各サブ領域は異なる機能プロファイルと接続パターンを持つ
- Perceptual Speed機能には特に、後部IPS（視覚入力）、LIP（比較処理）、前部IPS（決定出力）が重要と考えられる
- 次のステップでは、これらの解剖学的接続に基づいてUniform Circuit（UC）を定義する
