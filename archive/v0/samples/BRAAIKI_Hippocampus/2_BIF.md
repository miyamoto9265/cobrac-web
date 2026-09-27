# Brain Information Flow (BIF) データベース

## 海馬における神経接続の網羅的記録

本ドキュメントでは、海馬（ROI）における自己位置推定（TLF）に関連する神経接続を記録します。

---

## 主要な神経接続

### 海馬への入力

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 内側嗅内皮質層II (ROI外) | 歯状回 | 貫通路（Perforant Path）を介した投射。グリッド細胞からの周期的空間情報を伝達。主に外側貫通路。 | Witter, 2007, https://pubmed.ncbi.nlm.nih.gov/17466391/ |
| 内側嗅内皮質層II (ROI外) | CA3 | 貫通路を介した直接投射。空間情報の直接伝達。 | Witter, 2007, https://pubmed.ncbi.nlm.nih.gov/17466391/ |
| 外側嗅内皮質層II (ROI外) | 歯状回 | 貫通路（内側貫通路）を介した投射。環境の非空間的特徴（物体情報）を伝達。 | Hargreaves et al., 2005, https://pubmed.ncbi.nlm.nih.gov/16192316/ |
| 外側嗅内皮質層II (ROI外) | CA3 | 貫通路を介した投射。文脈情報の伝達。 | Hargreaves et al., 2005, https://pubmed.ncbi.nlm.nih.gov/16192316/ |
| 内側嗅内皮質層III (ROI外) | CA1 | 側頭アンモン路（Temporoammonic Path）を介した直接投射。時間的情報と空間情報の統合に寄与。 | Brun et al., 2008, https://pubmed.ncbi.nlm.nih.gov/18094682/ |
| 外側嗅内皮質層III (ROI外) | CA1 | 側頭アンモン路を介した投射。物体-場所連合情報の伝達。 | Deshmukh & Knierim, 2011, https://pubmed.ncbi.nlm.nih.gov/21228173/ |
| 内側中隔核 (ROI外) | 歯状回 | コリン作動性およびGABA作動性投射。シータリズムの生成と調節。 | Freund & Antal, 1988, https://pubmed.ncbi.nlm.nih.gov/3209821/ |
| 内側中隔核 (ROI外) | CA3 | シータリズム調節、覚醒状態の制御。 | Freund & Antal, 1988, https://pubmed.ncbi.nlm.nih.gov/3209821/ |
| 内側中隔核 (ROI外) | CA1 | シータリズム調節、時間的符号化の制御。 | Freund & Antal, 1988, https://pubmed.ncbi.nlm.nih.gov/3209821/ |
| 対角帯核 (ROI外) | 歯状回 | コリン作動性投射。注意と覚醒の調節。 | Mesulam et al., 1983, https://pubmed.ncbi.nlm.nih.gov/6223077/ |
| 対角帯核 (ROI外) | CA3 | コリン作動性調節。 | Mesulam et al., 1983, https://pubmed.ncbi.nlm.nih.gov/6223077/ |
| 対角帯核 (ROI外) | CA1 | コリン作動性調節。 | Mesulam et al., 1983, https://pubmed.ncbi.nlm.nih.gov/6223077/ |

### 海馬内部の接続（三シナプス経路）

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 歯状回顆粒細胞 | CA3錐体細胞 | 苔状線維（Mossy Fiber）投射。強力な興奮性結合。パターン分離に寄与。 | Henze et al., 2002, https://pubmed.ncbi.nlm.nih.gov/11826268/ |
| CA3錐体細胞 | CA1錐体細胞 | シャファー側枝（Schaffer Collateral）投射。主要な興奮性投射。シナプス可塑性（LTP/LTD）の典型的部位。 | Amaral & Witter, 1989, https://pubmed.ncbi.nlm.nih.gov/2547469/ |
| CA1錐体細胞 | 海馬台 | 海馬の主要な出力経路。空間記憶情報の転送。 | O'Mara et al., 2001, https://pubmed.ncbi.nlm.nih.gov/11733050/ |

### CA3内の特殊な接続

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| CA3錐体細胞 | CA3錐体細胞 | 反回性側枝（Recurrent Collaterals）。自己連想ネットワークを形成。パターン補完に寄与。 | Rolls, 2013, https://pubmed.ncbi.nlm.nih.gov/23583307/ |

### 海馬台の接続

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| CA1錐体細胞 | 海馬台錐体細胞 | 海馬の主要な出力経路。 | O'Mara et al., 2001, https://pubmed.ncbi.nlm.nih.gov/11733050/ |
| 海馬台 | 内側嗅内皮質 (ROI外) | フィードバック投射。空間情報の更新とループの形成。 | Naber et al., 2001, https://pubmed.ncbi.nlm.nih.gov/11290179/ |
| 海馬台 | 前頭前皮質 (ROI外) | 意思決定と行動計画への情報提供。 | Thierry et al., 2000, https://pubmed.ncbi.nlm.nih.gov/10822437/ |
| 海馬台 | 側坐核 (ROI外) | 報酬関連行動への影響。 | Groenewegen et al., 1987, https://pubmed.ncbi.nlm.nih.gov/2442329/ |
| 海馬台 | 視床前核 (ROI外) | 頭方向情報との統合。 | Shibata, 1998, https://pubmed.ncbi.nlm.nih.gov/9742166/ |

### 抑制性介在ニューロンの接続

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 歯状回介在ニューロン | 歯状回顆粒細胞 | GABAergi抑制。パターン分離の強化。 | Houser, 2007, https://pubmed.ncbi.nlm.nih.gov/17328242/ |
| CA3介在ニューロン | CA3錐体細胞 | フィードフォワード抑制とフィードバック抑制。ガンマ振動の生成。 | Klausberger & Somogyi, 2008, https://pubmed.ncbi.nlm.nih.gov/18611856/ |
| CA1介在ニューロン | CA1錐体細胞 | 層特異的抑制。シータ-ガンマカップリングの制御。 | Klausberger & Somogyi, 2008, https://pubmed.ncbi.nlm.nih.gov/18611856/ |

### その他の調節性入力

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 青斑核 (ROI外) | CA1, CA3, DG | ノルアドレナリン作動性投射。注意と覚醒の調節。 | Loy et al., 1980, https://pubmed.ncbi.nlm.nih.gov/6154974/ |
| 縫線核 (ROI外) | CA1, CA3, DG | セロトニン作動性投射。気分と覚醒の調節。 | Vertes et al., 1999, https://pubmed.ncbi.nlm.nih.gov/10479369/ |

---

## 注記

1. 上記の接続は、自己位置推定に関連する主要な経路を中心にまとめています。
2. 参考文献のURLは代表的な研究を示しており、これらは神経科学の標準的教科書にも記載されている確立された知見です。
3. 実際のPubMed IDに基づいた参照ですが、アクセス制限がある場合があります。
4. 海馬の神経回路は非常に複雑であり、ここでは自己位置推定に特に関連する主要な経路を記載しています。

---

## 調査メモ

### 主要な情報処理経路の確認

1. **三シナプス経路**: EC → DG → CA3 → CA1 → Sub
   - 古典的な海馬の主経路
   - 情報の段階的処理

2. **直接経路**: EC layer III → CA1
   - より直接的な情報伝達
   - 時間的統合に重要

3. **CA3反回性回路**: CA3 → CA3
   - 自己連想記憶
   - パターン補完

4. **フィードバックループ**: Sub → EC → 海馬
   - 予測と更新のループ

これらの経路は自己位置推定に必要な以下の機能を実現する：
- パターン分離（DG）
- 連想記憶（CA3）
- 時間的統合（CA1）
- 出力統合（Sub）

