# ステップ4: Connectionの定義とInterfaceの追加

## 4-1. Connectionの定義

BIFで特定した神経接続を、定義したUC間の接続として記述する。

### Connection表

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
|--------------------------|----------------------------|---------|-----------|
| `VisualInput` (ROI外) | `L-IPS` | 背側視覚経路（V1→V2→V3→V3A→V6→IPS）。視覚情報を空間座標系に変換し、頭頂間溝に伝達。空間的関係の視覚的表現を提供。 | Rizzolatti & Matelli, 2003 |
| `VisualInput` (ROI外) | `L-SPL` | 背側視覚経路の上頭頂小葉への投射。視空間統合に必要な視覚情報を提供。 | Dorsal stream studies |
| `SemanticInput` (ROI外) | `L-IFG` | 側頭葉（pMTG, STG）からの意味情報。前提の意味内容を前頭葉の推論処理に提供。 | Qiao et al., 2025; Davey et al., 2015 |
| `L-IFG` | `L-DLPFC` | 前頭前野内の統合。IFGで処理された意味・ルール情報をDLPFCの作業記憶システムに転送。 | Howlett et al., 2022 |
| `L-IFG` | `L-AG` | 前頭-頭頂投射。IFGのルールベース処理結果を角回の意味統合・心的モデル操作に送信。 | Seghier, 2013; Meta-analysis |
| `L-IFG` | `L-Putamen` | 前頭-線条体投射。IFG（特にBA 44）から被殻への強い機能的結合。ルールベース決定戦略の選択信号を送信。 | Howlett et al., 2022 |
| `L-DLPFC` | `L-Caudate` | 前頭-線条体投射。DLPFCから尾状核背側後部への投射。認知制御とルール選択の信号を送信。 | Leh et al., 2007 |
| `L-DLPFC` | `L-IPS` | 前頭-頭頂投射。DLPFCからIPSへの作業記憶制御信号。空間的作業記憶の維持を支援。 | Fronto-parietal network studies |
| `L-DLPFC` | `L-AG` | 前頭-頭頂投射。トップダウンの認知制御信号。角回の意味統合プロセスを制御。 | Connectivity studies |
| `L-DLPFC` | `L-PMC` | 前頭葉内投射。認知制御から運動準備への情報転送。推論結果の運動出力への変換を準備。 | Cocchi et al., 2022 |
| `L-MeFG` | `L-IFG` | 内側から外側前頭への投射。全体的な認知制御信号をIFGのルール処理に統合。 | Frontal connectivity studies |
| `L-MeFG` | `L-DLPFC` | 内側前頭から背外側前頭への投射。認知制御の調整信号を作業記憶システムに送信。 | Frontal connectivity studies |
| `L-SPL` | `L-IPS` | 頭頂葉内投射。上頭頂小葉の視空間統合結果を頭頂間溝に送信。垂直線維束による強い接続。 | Posterior parietal cortex anatomy |
| `L-Precuneus` | `L-AG` | 内側頭頂から外側頭頂への投射。視空間的イメージと自己参照処理を角回の意味統合に送信。 | Parietal connectivity |
| `L-AG` | `L-IFG` | 頭頂-前頭投射。角回の意味統合と心的モデル情報をIFGのルール適用プロセスにフィードバック。 | Seghier, 2013 |
| `L-AG` | `L-DLPFC` | 頭頂-前頭投射。意味的に統合された情報をDLPFCの作業記憶に送信。 | Connectivity studies |
| `L-IPS` | `L-DLPFC` | 頭頂-前頭投射。空間的作業記憶の内容をDLPFCに送信。双方向の作業記憶ループを形成。 | Fronto-parietal network |
| `L-IPS` | `L-AG` | 頭頂葉内投射。空間情報を角回の意味統合プロセスに提供。 | Posterior parietal connectivity |
| `L-Caudate` | `ThalamusMD` (ROI外) | 直接経路・間接経路。尾状核からGPi/SNrを介してMD核へ。認知制御ループの出力。 | McFarland & Haber, 2002 |
| `L-Putamen` | `ThalamusVA` (ROI外) | 直接経路・間接経路。被殻からGPi/SNrを介してVA核へ。運動プログラム選択の出力。 | McFarland & Haber, 2002 |
| `ThalamusMD` (ROI外) | `L-DLPFC` | 視床皮質投射。MD核からDLPFCへの投射。基底核の認知制御出力を前頭前野にフィードバック。 | Sung et al., 2014; Varela et al., 2019 |
| `ThalamusVA` (ROI外) | `L-PMC` | 視床皮質投射。VA核から前運動皮質への投射。基底核の運動プログラム選択信号を伝達。 | McFarland & Haber, 2002 |
| `ThalamusVA` (ROI外) | `L-MeFG` | 視床皮質投射。VA核から内側前頭回への投射。認知制御調整信号を伝達。 | Haber & Calzavara, 2009 |
| `L-PMC` | `MotorOutput` (ROI外) | 前運動皮質から一次運動野への出力。推論結果に基づく応答の実行。 | Motor system anatomy |
| `L-IFG` | `L-PMC` | 前頭葉内投射。IFGのルール処理結果をPMCの運動準備に送信。 | Lateral prefrontal connectivity |
| `L-PMC` | `L-IFG` | 前頭葉内相互接続。運動準備の状態をIFGにフィードバック。 | Lateral prefrontal connectivity |

---

## 4-2. Interfaceの追加

各UCのInterfaceを追加。形式: [Output1, Output2, ...] = UC名(Input1, Input2, ...)

### Interface表

| Circuit ID | Comment | Interface |
|------------|---------|-----------|
| `L-IFG` | 左下前頭回。ルールベース推論の中核。 | [`L-DLPFC`, `L-AG`, `L-Putamen`, `L-PMC`] = `L-IFG`(`SemanticInput`, `L-MeFG`, `L-AG`, `L-PMC`) |
| `L-DLPFC` | 左背外側前頭前野。作業記憶と認知制御。 | [`L-Caudate`, `L-IPS`, `L-AG`, `L-PMC`] = `L-DLPFC`(`L-IFG`, `L-MeFG`, `L-AG`, `L-IPS`, `ThalamusMD`) |
| `L-PMC` | 左前運動皮質。運動出力への変換。 | [`MotorOutput`, `L-IFG`] = `L-PMC`(`L-DLPFC`, `L-IFG`, `ThalamusVA`) |
| `L-MeFG` | 左内側前頭回。認知制御の統合。 | [`L-IFG`, `L-DLPFC`] = `L-MeFG`(`ThalamusVA`) |
| `L-AG` | 左角回。意味的統合と心的モデル操作。 | [`L-IFG`, `L-DLPFC`] = `L-AG`(`L-IFG`, `L-DLPFC`, `L-Precuneus`, `L-IPS`) |
| `L-IPS` | 左頭頂間溝。空間的作業記憶。 | [`L-DLPFC`, `L-AG`] = `L-IPS`(`VisualInput`, `L-SPL`, `L-DLPFC`) |
| `L-SPL` | 左上頭頂小葉。視空間統合。 | [`L-IPS`] = `L-SPL`(`VisualInput`) |
| `L-Precuneus` | 左楔前部。視空間イメージ生成。 | [`L-AG`] = `L-Precuneus`(`VisualInput`) |
| `L-Caudate` | 左尾状核。ルール選択と順序的推論。 | [`ThalamusMD`] = `L-Caudate`(`L-DLPFC`) |
| `L-Putamen` | 左被殻。ルールベース戦略の適用。 | [`ThalamusVA`] = `L-Putamen`(`L-IFG`) |

---

## Connectionの整合性確認

### 各UCの入出力確認

#### `L-IFG`
- **入力**: `SemanticInput`, `L-MeFG`, `L-AG`, `L-PMC`
- **出力**: `L-DLPFC`, `L-AG`, `L-Putamen`, `L-PMC`
- **確認**: ✓ 意味情報と認知制御を受け取り、作業記憶・心的モデル・基底核・運動準備に送信

#### `L-DLPFC`
- **入力**: `L-IFG`, `L-MeFG`, `L-AG`, `L-IPS`, `ThalamusMD`
- **出力**: `L-Caudate`, `L-IPS`, `L-AG`, `L-PMC`
- **確認**: ✓ 多様な入力を統合し、基底核・頭頂葉・運動系に制御信号を送信

#### `L-PMC`
- **入力**: `L-DLPFC`, `L-IFG`, `ThalamusVA`
- **出力**: `MotorOutput`, `L-IFG`
- **確認**: ✓ 認知制御と基底核出力を受け取り、運動出力を生成

#### `L-MeFG`
- **入力**: `ThalamusVA`
- **出力**: `L-IFG`, `L-DLPFC`
- **確認**: ✓ 視床からの調整信号を前頭葉に配信

#### `L-AG`
- **入力**: `L-IFG`, `L-DLPFC`, `L-Precuneus`, `L-IPS`
- **出力**: `L-IFG`, `L-DLPFC`
- **確認**: ✓ 前頭葉と頭頂葉内の情報を統合し、前頭葉にフィードバック

#### `L-IPS`
- **入力**: `VisualInput`, `L-SPL`, `L-DLPFC`
- **出力**: `L-DLPFC`, `L-AG`
- **確認**: ✓ 視覚・頭頂・前頭情報を統合し、作業記憶と意味統合に送信

#### `L-SPL`
- **入力**: `VisualInput`
- **出力**: `L-IPS`
- **確認**: ✓ 視覚情報を処理し頭頂間溝に送信

#### `L-Precuneus`
- **入力**: `VisualInput`
- **出力**: `L-AG`
- **確認**: ✓ 視空間イメージを生成し角回に送信

#### `L-Caudate`
- **入力**: `L-DLPFC`
- **出力**: `ThalamusMD`
- **確認**: ✓ 認知制御信号を受け取り視床MD核を介して前頭前野にフィードバック

#### `L-Putamen`
- **入力**: `L-IFG`
- **出力**: `ThalamusVA`
- **確認**: ✓ ルール選択信号を受け取り視床VA核を介して前運動野に送信

---

## 情報フローの検証

### 主要な処理経路

#### 経路1: 意味情報処理
`SemanticInput` → `L-IFG` → `L-DLPFC` → `L-Caudate` → `ThalamusMD` → `L-DLPFC`
- 意味情報が前頭葉で処理され、基底核ループで選択・強化されて作業記憶に保持される

#### 経路2: 空間的心的モデル構築
`VisualInput` → `L-SPL` → `L-IPS` → `L-AG` → `L-IFG`
- 視覚情報が空間情報に変換され、意味統合を経てルール処理に利用される

#### 経路3: 認知制御ループ（前頭-線条体-視床）
`L-DLPFC` → `L-Caudate` → `ThalamusMD` → `L-DLPFC`
- 作業記憶と認知制御の動的調整ループ

#### 経路4: 運動出力経路
`L-IFG` → `L-Putamen` → `ThalamusVA` → `L-PMC` → `MotorOutput`
- ルール適用結果が基底核を経由して運動出力に変換される

#### 経路5: 前頭-頭頂相互作用
`L-IFG` ↔ `L-AG` ↔ `L-DLPFC`
- ルール処理、意味統合、作業記憶の三者間の双方向情報交換

---

## ROI境界の処理

### ROI外からの入力（4箇所）
1. **`VisualInput`**: 後頭皮質からの視覚情報
   - 接続先: `L-SPL`, `L-IPS`, `L-Precuneus`
   
2. **`SemanticInput`**: 側頭葉からの意味情報
   - 接続先: `L-IFG`
   
3. **`ThalamusMD`**: 視床内側背側核からの認知制御フィードバック
   - 接続先: `L-DLPFC`
   
4. **`ThalamusVA`**: 視床腹側前核からの運動調整信号
   - 接続先: `L-PMC`, `L-MeFG`

### ROI外への出力（3箇所）
1. **`ThalamusMD`**: 視床内側背側核への認知制御信号
   - 送信元: `L-Caudate`
   
2. **`ThalamusVA`**: 視床腹側前核への運動プログラム選択信号
   - 送信元: `L-Putamen`
   
3. **`MotorOutput`**: 一次運動野への運動実行信号
   - 送信元: `L-PMC`

---

## 次のステップ

ステップ5に進み、各UCのOutput Semantics（出力情報の意味内容）を定義する。各UCがどのような情報をコードしているかを明確に記述する。
