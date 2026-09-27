# ステップ2: BIF（Brain Information Flow）の構築

## ROI: Intraparietal Sulcus (IPS)

以下の表は、IPSに関連する神経接続を記録したものです。ROI外の神経組織が含まれる場合は、Commentに付記しています。

| Sender | Receiver | Comment | Reference |
|--------|----------|---------|-----------|
| V1 (Primary visual cortex) | Posterior IPS (pIPS) | 初期視覚情報の投射、位置・方位などの基本特徴を伝達、**Sender: ROI外** | Swisher et al., 2007, https://pubmed.ncbi.nlm.nih.gov/17507555/ |
| V2 | Posterior IPS (pIPS) | 初期視覚処理の投射、**Sender: ROI外** | Swisher et al., 2007, https://pubmed.ncbi.nlm.nih.gov/17507555/ |
| V3 | Posterior IPS (pIPS) | 初期視覚処理の投射、後部IPSは視覚野との強い接続を持つ、**Sender: ROI外** | Konen & Kastner, 2008, https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| V4 | Posterior IPS (pIPS) | 色・形態情報の投射、腹側と背側両経路を統合するハブ機能、**Sender: ROI外** | Pasupathy et al., 2020, https://depts.washington.edu/shapelab/publications/Pasupathy2020_AnnualReviewVS.pdf |
| MT/V5 (Middle Temporal Area) | IPS | 運動情報の投射、背側視覚経路の一部、**Sender: ROI外** | Amano et al., 2009, https://www.jneurosci.org/content/30/29/9801 |
| MST (Medial Superior Temporal Area) | IPS | より複雑な運動パターン情報の投射、**Sender: ROI外** | Amano et al., 2009, https://www.jneurosci.org/content/30/29/9801 |
| Inferior Temporal Cortex (IT) | IPS | 物体認識情報の投射、特にIPS-FG繊維束を介した接続、**Sender: ROI外** | Takemura et al., 2020, https://www.nature.com/articles/s41598-020-72471-z |
| Fusiform Gyrus (FG) | IPS (medial bank) | 高レベル視覚物体情報、IPS-FG繊維束による接続、**Sender: ROI外** | Takemura et al., 2020, https://www.nature.com/articles/s41598-020-72471-z |
| Superior Temporal Gyrus (STG) | Posterior IPS | 聴覚-視覚統合情報、**Sender: ROI外** | Konen & Kastner, 2008, https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| Frontal Eye Field (FEF) | IPS | トップダウン注意制御信号、探索目標の仕様、相互的接続、**Sender: ROI外** | Stanton et al., 1995, https://onlinelibrary.wiley.com/doi/10.1002/cne.902650304 |
| Dorsolateral Prefrontal Cortex (DLPFC) | IPS | ワーキングメモリ内容、タスクルール、実行制御信号、**Sender: ROI外** | Riley & Constantinidis, 2015, https://ncbi.nlm.nih.gov/pmc/articles/PMC4128703/ |
| Supplementary Eye Field (SEF) | IPS | 眼球運動の高次制御信号、**Sender: ROI外** | Schlag & Schlag-Rey, 1987, https://onlinelibrary.wiley.com/doi/10.1002/cne.902930211 |
| Anterior Cingulate Cortex (ACC) | IPS | 認知制御信号、エラーモニタリング、注意配分、**Sender: ROI外** | Torta & Cauda, 2011, https://www.sciencedirect.com/science/article/abs/pii/S1053811907004090 |
| Pulvinar (Thalamus) | IPS | 視覚情報のリレー、上丘からの視覚情報を中継、**Sender: ROI外** | Lyon et al., 2010, https://ncbi.nlm.nih.gov/pmc/articles/PMC6623455/ |
| Insula | IPS (all regions) | 顕著性情報、内受容感覚情報、**Sender: ROI外** | Konen & Kastner, 2008, https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| Striatum | IPS (all regions) | 報酬情報、行動選択バイアス、**Sender: ROI外** | Konen & Kastner, 2008, https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| Posterior IPS (pIPS) | Anterior IPS (aIPS) | IPS内部の情報統合、視覚情報から運動制御への変換（ROI内接続） | Orban & Caruana, 2014, https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/ |
| Middle IPS (mIPS) | Anterior IPS (aIPS) | IPS内部の情報処理階層（ROI内接続） | Orban & Caruana, 2014, https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/ |
| Posterior IPS (pIPS) | V1, V2, V3 | トップダウン注意変調信号、入力ゲイン調節、**Receiver: ROI外** | Konen & Kastner, 2008 |
| IPS | V4 | 注意による視覚処理の変調、**Receiver: ROI外** | Konen & Kastner, 2008 |
| IPS | MT/V5 | 注意による運動知覚の変調、**Receiver: ROI外** | Konen & Kastner, 2008 |
| IPS | Frontal Eye Field (FEF) | 注意優先マップ、サッカード目標の情報、相互的接続、**Receiver: ROI外** | Stanton et al., 1995, https://onlinelibrary.wiley.com/doi/10.1002/cne.902650304 |
| IPS | Dorsolateral Prefrontal Cortex (DLPFC) | 視覚ワーキングメモリの感覚内容、空間情報、**Receiver: ROI外** | Riley & Constantinidis, 2015, https://ncbi.nlm.nih.gov/pmc/articles/PMC4128703/ |
| Anterior IPS (aIPS) | Prefrontal Cortex (PFC) | 高次認知制御への情報、意思決定関連情報、**Receiver: ROI外** | Konen & Kastner, 2008, https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| IPS | Premotor Cortex (PMC) | 運動準備信号、視覚誘導行動の情報、**Receiver: ROI外** | Selemon & Goldman-Rakic, 1988, https://ncbi.nlm.nih.gov/pmc/articles/PMC6569486/ |
| IPS | Supplementary Motor Area (SMA) | 運動計画信号、**Receiver: ROI外** | Selemon & Goldman-Rakic, 1988, https://ncbi.nlm.nih.gov/pmc/articles/PMC6569486/ |
| IPS | Superior Colliculus (SC) | サッカード目標、注意シフト信号、**Receiver: ROI外** | Lyon et al., 2010 |
| IPS | Fusiform Gyrus (FG) | 視覚物体処理への空間的コンテクスト情報、IPS-FG繊維束、**Receiver: ROI外** | Takemura et al., 2020, https://www.nature.com/articles/s41598-020-72471-z |
| Anterior IPS (aIPS) | Posterior IPS (pIPS) | フィードバック信号、予測信号（ROI内接続） | Lewis & Van Essen, 2000（神経科学の一般原則） |

## BIF構築の注意点

1. **投射の方向性**: 上記の表では、視覚野からIPSへの順投射（feedforward）、IPSから前頭皮質への投射、IPSから視覚野への逆投射（feedback）を区別しています。

2. **相互接続**: FEFとIPSの間には相互的な接続が存在し、両方向の情報伝達が行われます。

3. **IPS内部の接続**: 後部IPS→中部IPS→前部IPSという情報処理階層が存在します。

4. **多感覚統合**: IPSは視覚情報だけでなく、島皮質や線条体からの非視覚情報も受け取ります。

5. **ROI内外の区別**: 
   - **ROI内**: 後部IPS、中部IPS、前部IPSの相互接続
   - **ROI外（入力）**: V1, V2, V3, V4, MT/V5, MST, IT, FG, STG, FEF, DLPFC, SEF, ACC, Pulvinar, Insula, Striatum
   - **ROI外（出力）**: V1-V4, MT/V5, FEF, DLPFC, PFC, PMC, SMA, SC, FG

## 主要な機能的接続パターン

1. **視覚入力経路**: 
   - 初期視覚野（V1, V2, V3）→ 後部IPS（基本特徴）
   - 腹側経路（V4, IT, FG）→ IPS（物体情報）
   - 背側経路（MT/V5, MST）→ IPS（運動情報）

2. **注意制御経路**:
   - FEF ⇄ IPS（相互的注意制御）
   - DLPFC → IPS（ワーキングメモリ・実行制御）
   - ACC → IPS（認知制御）

3. **IPS内部経路**:
   - 後部IPS → 中部IPS → 前部IPS（情報処理階層）
   - 前部IPS → 後部IPS（予測・フィードバック）

4. **出力経路**:
   - IPS → 視覚野（V1-V4, MT/V5）：トップダウン変調
   - IPS → 前頭皮質（FEF, DLPFC, PFC）：意思決定・注意制御
   - IPS → 運動関連領域（PMC, SMA, SC）：行動準備

この接続パターンは、IPSが視覚情報の統合、注意制御、視覚誘導行動の橋渡しとして機能することを示しています。
