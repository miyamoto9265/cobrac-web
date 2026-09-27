# ステップ4-1: Connectionの定義

## Connectionとは

Connectionは、BIFで特定した神経接続を、定義したUC間の接続として記述したものである。各Connectionは、送信元UC（Sender）から受信先UC（Receiver）への情報の流れを表す。

## Connection一覧表

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `V1` | `V2` | 初期視覚処理の階層的投射。輝度、エッジ、方向などの基本特徴。 | Hubel & Wiesel, 1962 |
| `V2` | `V3` | 形状と運動の初期統合。腹側・背側経路の分岐点。 | Felleman & Van Essen, 1991 |
| `V2` | `V4` | 色と形状の高次処理。物体認識への投射。 | Felleman & Van Essen, 1991 |
| `V3` | `V4` | 形状情報の統合。 | Felleman & Van Essen, 1991 |
| `V4` | `FG-math` | 数字や数学的記号の視覚的特徴を紡錘状回へ伝達。数字形態領域への入力。 | Winawer et al., 2010; Grotheer et al., 2016 |
| `V4` | `ITG-math` | 高次視覚特徴を下側頭回へ伝達。物体認識経路の延長。 | Kravitz et al., 2013 |
| `V2` | `pIPS` | 視覚情報を背側経路へ。視空間統合の初期段階。 | Felleman & Van Essen, 1991 |
| `V3` | `pIPS` | 形状と空間情報をIPSへ。 | Felleman & Van Essen, 1991 |
| `V4` | `pIPS` | 物体の視覚的特徴と空間位置の統合。 | Schmid et al., 2009 |
| `FG-math` | `pIPS` | IPS-FG白質路による双方向接続。数字形態と数量表象の統合。 | Takemura et al., 2020 |
| `pIPS` | `FG-math` | IPS-FG白質路。数量情報による数字認識のトップダウン調節。 | Takemura et al., 2020 |
| `FG-math` | `ITG-math` | 腹側側頭皮質内での情報統合。数字形態から抽象概念へ。 | Grill-Spector & Weiner, 2014 |
| `ITG-math` | `FG-math` | フィードバック接続。概念表象による視覚認識の調節。 | Grill-Spector & Weiner, 2014 |
| `pIPS` | `aIPS` | IPS内の階層的情報処理。視覚的数量表象から抽象的数量表象へ。 | Konen & Kastner, 2008 |
| `aIPS` | `pIPS` | フィードバック接続。抽象的推論による視覚的表象の調節。 | Konen & Kastner, 2008 |
| `ITG-math` | `AG` | 数学的概念の意味表象から算術的事実の検索へ。意味記憶の検索開始。 | Seghier, 2013 |
| `aIPS` | `AG` | 抽象的数量表象から算術的事実の検索へ。数量と事実の紐づけ。 | Uddin et al., 2010 |
| `AG` | `aIPS` | 検索された算術的事実を数量表象へフィードバック。 | Uddin et al., 2010 |
| `AG` | `ITG-math` | 検索された事実による概念表象の精緻化。 | Seghier, 2013 |
| `aIPS` | `LIPFC` | 数量情報を作業記憶へ転送。 | Boisgueheneuc et al., 2006 |
| `ITG-math` | `LIPFC` | 数学的概念を作業記憶へ転送。 | Fuster, 2001 |
| `dlPFC` | `pIPS` | トップダウン制御信号。視覚的注意と数量選択の制御。 | Selemon & Goldman-Rakic, 1988 |
| `dlPFC` | `aIPS` | 作業記憶の保持と制御信号。数量操作の制御。 | Selemon & Goldman-Rakic, 1988 |
| `dlPFC` | `FG-math` | 視覚的注意の制御。数字認識の選択的強化。 | Miller & Cohen, 2001 |
| `dlPFC` | `ITG-math` | 概念検索の制御信号。 | Miller & Cohen, 2001 |
| `Pulvinar` | `pIPS` | 視覚的注意の調節。視空間情報の選択的強化。 | Saalmann et al., 2012 |
| `pIPS` | `Pulvinar` | 頭頂皮質から視床へのフィードバック。 | Yeterian & Pandya, 1985 |
| `ACC` | `pIPS` | 認知制御信号。タスク関連情報の選択。 | Cole et al., 2015 |
| `ACC` | `aIPS` | 認知制御信号。数量推論の制御。 | Cole et al., 2015 |
| `pIPS` | `ACC` | 認知負荷情報のフィードバック。 | Cole et al., 2015 |
| `aIPS` | `ACC` | 認知負荷情報のフィードバック。 | Cole et al., 2015 |
| `Hippocampus` | `pIPS` | エピソード記憶と文脈情報。学習時の記憶形成。 | Qi et al., 2022 |
| `Hippocampus` | `aIPS` | 数学的事実の文脈的想起。 | Qi et al., 2022 |
| `Striatum` | `pIPS` | 報酬信号。数学的知識の学習における強化。 | Schultz et al., 1997 |
| `Striatum` | `aIPS` | 報酬信号。抽象的推論の強化。 | Schultz et al., 1997 |
| `pIPS` | `Striatum` | 頭頂皮質から基底核への投射。 | Yeterian & Pandya, 1991 |
| `aIPS` | `Striatum` | 頭頂皮質から基底核への投射。 | Yeterian & Pandya, 1991 |
| `aIPS` | `PMC` | 数学的応答の運動計画。答えを発話・記述するための準備。 | Rizzolatti et al., 1998 |
| `ITG-math` | `PMC` | 概念に基づく運動応答の準備。 | Rizzolatti et al., 1998 |
| `Broca` | `pIPS` | 数学的ステートメントの構文情報（言語構造のみ）。 | Amalric & Dehaene, 2016 |
| `Broca` | `aIPS` | 数学的ステートメントの構文情報（言語構造のみ）。 | Amalric & Dehaene, 2016 |
| `Wernicke` | `ITG-math` | 言語的数学概念の処理。口頭で提示された数学的情報。 | Amalric & Dehaene, 2016 |
| `Wernicke` | `FG-math` | 言語的数学情報の視覚的表象への変換。 | Amalric & Dehaene, 2016 |

## Connectionの整理

### ROI内のUC間のConnection（内部処理）

1. **`pIPS` ↔ `FG-math`**: IPS-FG白質路による双方向接続。数量表象と数字形態の統合。
2. **`pIPS` ↔ `aIPS`**: IPS内の階層的処理。視覚的から抽象的表象へ。
3. **`FG-math` ↔ `ITG-math`**: 腹側側頭皮質内の統合。数字形態と概念表象の相互作用。

### ROI外からROI内への入力

1. **視覚野（`V1`, `V2`, `V3`, `V4`） → `pIPS`, `FG-math`, `ITG-math`**: 視覚的数学情報の入力
2. **`dlPFC` → `pIPS`, `aIPS`, `FG-math`, `ITG-math`**: トップダウン制御
3. **`AG` → `aIPS`, `ITG-math`**: 検索された事実のフィードバック
4. **`Pulvinar` → `pIPS`**: 視覚的注意の調節
5. **`ACC` → `pIPS`, `aIPS`**: 認知制御信号
6. **`Hippocampus` → `pIPS`, `aIPS`**: エピソード記憶と文脈
7. **`Striatum` → `pIPS`, `aIPS`**: 報酬信号
8. **`Broca` → `pIPS`, `aIPS`**: 構文情報
9. **`Wernicke` → `ITG-math`, `FG-math`**: 言語的数学情報

### ROI内からROI外への出力

1. **`ITG-math` → `AG`**: 概念表象から事実検索へ
2. **`aIPS` → `AG`**: 数量表象から事実検索へ
3. **`aIPS` → `LIPFC`**: 数量情報の作業記憶転送
4. **`ITG-math` → `LIPFC`**: 概念情報の作業記憶転送
5. **`pIPS`, `aIPS` → `ACC`**: 認知負荷のフィードバック
6. **`pIPS` → `Pulvinar`**: 視床へのフィードバック
7. **`pIPS`, `aIPS` → `Striatum`**: 基底核への投射
8. **`aIPS`, `ITG-math` → `PMC`**: 運動計画への投射

## 参考文献

1. Amalric, M., & Dehaene, S. (2016). Origins of the brain networks for advanced mathematics in expert mathematicians. Proceedings of the National Academy of Sciences, 113(18), 4909-4917.
2. Takemura, H., Kruper, J., Miyata, T., & Rokem, A. (2020). Identification of a distinct association fiber tract "IPS-FG" to connect the intraparietal sulcus areas and fusiform gyrus by white matter dissection and tractography. Scientific Reports, 10(1), 15402.
3. Konen, C. S., & Kastner, S. (2008). Two hierarchically organized neural systems for object information in human visual cortex. Nature neuroscience, 11(2), 224-231.
4. Uddin, L. Q., Supekar, K., Amin, H., Rykhlevskaia, E., Nguyen, D. A., Greicius, M. D., & Menon, V. (2010). Dissociable connectivity within human angular gyrus and intraparietal sulcus: evidence from functional and structural connectivity. Cerebral cortex, 20(11), 2636-2646.
5. Felleman, D. J., & Van Essen, D. C. (1991). Distributed hierarchical processing in the primate cerebral cortex. Cerebral cortex, 1(1), 1-47.
