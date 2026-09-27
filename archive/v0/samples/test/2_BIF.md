# ステップ2: BIF（Brain Information Flow）

## ROI内の神経接続データベース

以下の表は、ショウジョウバエ視葉（ROI）における解剖学的神経接続を示す。ROI外の組織が関与する場合はCommentに明記している。

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| R1-R6 photoreceptors | L1 lamina neurons | 光受容体R1-R6からラミナL1細胞への興奮性シナプス接続。ON経路の開始点。[ROI外→ROI内] | Joesch et al., 2010, Nature, https://www.nature.com/articles/nature09545 |
| R1-R6 photoreceptors | L2 lamina neurons | 光受容体R1-R6からラミナL2細胞への興奮性シナプス接続。OFF経路の開始点。[ROI外→ROI内] | Joesch et al., 2010, Nature, https://www.nature.com/articles/nature09545 |
| R1-R6 photoreceptors | L3 lamina neurons | 光受容体R1-R6からラミナL3細胞への接続。ラミナカートリッジ内で受容。[ROI外→ROI内] | Shinomiya et al., 2019, Neural Development, https://link.springer.com/article/10.1186/s13064-018-0106-9 |
| R7-R8 photoreceptors | Medulla neurons | 光受容体R7-R8はラミナを通過し、メデュラに直接投射。色情報処理に関与。[ROI外→ROI内] | Shinomiya et al., 2019, Neural Development, https://link.springer.com/article/10.1186/s13064-018-0106-9 |
| L1 lamina neurons | Mi1 medulla neurons | L1からMi1への興奮性接続。ON運動検出経路の重要な中継。 | Takemura et al., 2013, Nature, https://www.nature.com/articles/nature12450 |
| L1 lamina neurons | Tm3 medulla neurons | L1からTm3への興奮性接続。ON運動検出の非遅延経路を形成。 | Takemura et al., 2013, Nature, https://www.nature.com/articles/nature12450 |
| L2 lamina neurons | Tm1 medulla neurons | L2からTm1への接続。OFF運動検出の遅延経路を形成。 | Behnia et al., 2014, Nature, https://www.nature.com/articles/nature13427 |
| L2 lamina neurons | Tm2 medulla neurons | L2からTm2への接続。OFF運動検出の非遅延経路を形成。 | Behnia et al., 2014, Nature, https://www.nature.com/articles/nature13427 |
| L2 lamina neurons | Tm4 medulla neurons | L2からTm4への接続。OFF経路の追加的な中継。 | Takemura et al., 2013, Nature, https://www.nature.com/articles/nature12450 |
| L1 lamina neurons | Mi4 medulla neurons | L1からMi4への接続。ON経路の追加的な中継。 | Takemura et al., 2017, eLife, https://pubmed.ncbi.nlm.nih.gov/28432786/ |
| L1 lamina neurons | Mi9 medulla neurons | L1からMi9への接続。ON経路の追加的な中継。 | Takemura et al., 2017, eLife, https://pubmed.ncbi.nlm.nih.gov/28432786/ |
| Mi1 medulla neurons | T4 cells | Mi1からT4細胞への興奮性接続。ON運動の方向選択性を生成する重要な入力。遅延応答を提供。 | Takemura et al., 2017, eLife, https://pubmed.ncbi.nlm.nih.gov/28432786/ |
| Tm3 medulla neurons | T4 cells | Tm3からT4細胞への興奮性接続。ON運動の方向選択性を生成。非遅延応答を提供。 | Behnia et al., 2014, Nature, https://www.nature.com/articles/nature13427 |
| Mi4 medulla neurons | T4 cells | Mi4からT4細胞への接続。ON運動検出回路への追加入力。 | Takemura et al., 2017, eLife, https://pubmed.ncbi.nlm.nih.gov/28432786/ |
| Mi9 medulla neurons | T4 cells | Mi9からT4細胞への接続。ON運動検出回路への追加入力。 | Takemura et al., 2017, eLife, https://pubmed.ncbi.nlm.nih.gov/28432786/ |
| Tm1 medulla neurons | T5 cells | Tm1からT5細胞への接続。OFF運動の方向選択性を生成。遅延応答を提供。 | Behnia et al., 2014, Nature, https://www.nature.com/articles/nature13427 |
| Tm2 medulla neurons | T5 cells | Tm2からT5細胞への接続。OFF運動の方向選択性を生成。非遅延応答を提供。 | Behnia et al., 2014, Nature, https://www.nature.com/articles/nature13427 |
| Tm4 medulla neurons | T5 cells | Tm4からT5細胞への接続。OFF運動検出回路への追加入力。 | Behnia et al., 2014, Nature, https://www.nature.com/articles/nature13427 |
| T4 cells (layer 1) | HS cells (Horizontal System) | T4細胞のサブタイプからHS細胞への方向選択的入力。水平方向運動を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| T4 cells (layer 2) | VS cells (Vertical System) | T4細胞のサブタイプからVS細胞への方向選択的入力。垂直方向運動を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| T4 cells (layer 3) | HS cells | T4細胞のサブタイプからHS細胞への方向選択的入力。反対方向の水平運動を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| T4 cells (layer 4) | VS cells | T4細胞のサブタイプからVS細胞への方向選択的入力。反対方向の垂直運動を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| T5 cells (layer 1) | HS cells | T5細胞のサブタイプからHS細胞への方向選択的入力。OFF運動の水平方向を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| T5 cells (layer 2) | VS cells | T5細胞のサブタイプからVS細胞への方向選択的入力。OFF運動の垂直方向を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| T5 cells (layer 3) | HS cells | T5細胞のサブタイプからHS細胞への方向選択的入力。反対方向のOFF運動（水平）を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| T5 cells (layer 4) | VS cells | T5細胞のサブタイプからVS細胞への方向選択的入力。反対方向のOFF運動（垂直）を検出。 | Schnell et al., 2012, Journal of Experimental Biology, https://link.springer.com/article/10.1007/s00359-012-0716-3 |
| HS cells | DNOVS1 (descending neuron) | HS細胞から下行ニューロンDNOVS1への電気的結合と化学シナプス。水平運動情報を運動制御系へ伝達。[ROI内→ROI外] | Suver et al., 2016, J Neurosci, https://www.jneurosci.org/content/27/8/1992 |
| VS cells | DNOVS1 (descending neuron) | VS細胞から下行ニューロンDNOVS1への電気的結合。垂直運動情報を運動制御系へ伝達。[ROI内→ROI外] | Suver et al., 2016, J Neurosci, https://www.jneurosci.org/content/27/8/1992 |
| L1 lamina neurons | Dm3 medulla amacrine cells | L1からDm3アマクリン細胞への接続。方位選択的処理に関与。 | Ramos-Traslosheros et al., 2024, Nature, https://www.nature.com/articles/s41586-024-07953-5 |
| Dm3 medulla amacrine cells | TmY neurons | Dm3からTmY細胞への接続。方位情報処理の中継。相互方位抑制を実装。 | Ramos-Traslosheros et al., 2024, Nature, https://www.nature.com/articles/s41586-024-07953-5 |
| TmY neurons | Lobula neurons | TmYからロブラへの投射。形態視覚情報の伝達。 | Ramos-Traslosheros et al., 2024, Nature, https://www.nature.com/articles/s41586-024-07953-5 |
| Medulla Tm9 neurons | LC neurons (Lobula Columnar) | Tm9からロブラ円柱細胞への投射。物体検出情報を伝達。 | Wu et al., 2016, eLife, https://pmc.ncbi.nlm.nih.gov/articles/PMC5293491/ |
| LC6 neurons | Optic glomeruli (central brain) | LC6細胞からオプティックグロメルリへの投射。ルーミング情報を中枢へ伝達。[ROI内→ROI外] | Wu et al., 2016, eLife, https://pmc.ncbi.nlm.nih.gov/articles/PMC5293491/ |
| LC4 neurons | Central brain | LC4細胞から中枢脳への投射。小物体運動情報を中枢へ伝達。[ROI内→ROI外] | Wu et al., 2016, eLife, https://pmc.ncbi.nlm.nih.gov/articles/PMC5293491/ |
| LC10 neurons | Optic glomeruli (central brain) | LC10細胞からオプティックグロメルリへの投射。視覚特徴情報を中枢へ伝達。[ROI内→ROI外] | Wu et al., 2016, eLife, https://pmc.ncbi.nlm.nih.gov/articles/PMC5293491/ |
| LC11 neurons | Optic glomeruli (central brain) | LC11細胞からオプティックグロメルリへの投射。視覚特徴情報を中枢へ伝達。[ROI内→ROI外] | Wu et al., 2016, eLife, https://pmc.ncbi.nlm.nih.gov/articles/PMC5293491/ |
| L1 lamina neurons | L2 lamina neurons | L1とL2間の電気的結合。ON/OFF経路間の情報交換を可能にする。 | Joesch et al., 2010, Nature, https://www.nature.com/articles/nature09545 |
| Dm3 medulla amacrine cells | Dm3 medulla amacrine cells | 異なる方位選択性を持つDm3細胞間の抑制性接続。交差方位抑制を実装。 | Ramos-Traslosheros et al., 2024, Nature, https://www.nature.com/articles/s41586-024-07953-5 |
| TmY neurons | TmY neurons | 同じ方位選択性を持つTmY細胞間の興奮性接続。同方位興奮を実装。 | Ramos-Traslosheros et al., 2024, Nature, https://www.nature.com/articles/s41586-024-07953-5 |
| HS cells | HS cells | HS細胞間の電気的結合。広視野運動統合を促進。 | Haag & Borst, 2004, J Neurosci (推定) |
| VS cells | VS cells | VS細胞間の電気的結合。広視野運動統合を促進。 | Haag & Borst, 2004, J Neurosci (推定) |

## 注釈

### ROI境界の定義
- **[ROI外→ROI内]**: 入力元がROI外（光受容体、網膜）
- **[ROI内→ROI外]**: 出力先がROI外（下行ニューロン、中心複合体、オプティックグロメルリ等）

### 主要な接続パターン

#### 1. ON/OFF経路の分離（ラミナ）
- R1-R6 → L1（ON経路）
- R1-R6 → L2（OFF経路）
- L1-L2間の電気的結合により経路間の情報交換が可能

#### 2. 運動検出回路（メデュラ）
- ON経路: L1 → Mi1 → T4（遅延）、L1 → Tm3 → T4（非遅延）
- OFF経路: L2 → Tm1 → T5（遅延）、L2 → Tm2 → T5（非遅延）
- Hassenstein-Reichardt相関器モデルの神経実装

#### 3. 方向選択性の層構造（ロブラプレート）
- T4/T5細胞は4つのサブタイプに分かれ、それぞれロブラプレートの異なる層に投射
- 各層は特定の運動方向（前後、上下）に対応
- LPTCはこれらの層から入力を統合

#### 4. 形態視覚経路（ロブラ）
- メデュラ（Tm9, TmY等） → ロブラ（LC細胞） → 中心複合体
- 物体検出、ルーミング検出、方位検出等の特徴抽出

### データソース
本BIFは以下の主要な研究成果に基づく：
1. Takemura et al. (2013, 2017) - メデュラコネクトーム
2. Joesch et al. (2010) - ON/OFF経路
3. Behnia et al. (2014) - 運動検出の処理特性
4. Wu et al. (2016) - ロブラ投射ニューロン
5. Ramos-Traslosheros et al. (2024) - 方位検出回路
6. FlyWire (2024) - 全脳コネクトーム

### 制約事項
- 本BIFは主要な接続経路を記載しているが、視葉には約70,000個のニューロンと50万以上のシナプス接続が存在するため、すべての接続を網羅していない
- メゾスコピックレベルでの機能的接続に焦点を当て、HCD構築に必要な主要経路を優先的に記載
- 細胞タイプ内のサブタイプ（例：T4a, T4b, T4c, T4d）の詳細は次ステップ（UC定義）で扱う
