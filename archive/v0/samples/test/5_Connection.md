# ステップ4-1: Connectionの定義

## UC間の接続定義

BIFで特定した神経接続を、定義したUC間の接続として記述する。

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment                                            | Reference                                  |
| ------------------------ | -------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `R1-R6`                  | `L1`                       | 光受容体からL1への興奮性シナプス。ON経路の開始。明るさ増加情報を伝達。              | Joesch et al., 2010, Nature                |
| `R1-R6`                  | `L2`                       | 光受容体からL2への興奮性シナプス。OFF経路の開始。明るさ減少情報を伝達。             | Joesch et al., 2010, Nature                |
| `R1-R6`                  | `L3`                       | 光受容体からL3への興奮性シナプス。追加的な輝度情報処理経路。                    | Shinomiya et al., 2019, Neural Development |
| `R7-R8`                  | `Tm9`                      | 光受容体R7-R8からTm9への接続。色情報の処理経路の一部。                    | Shinomiya et al., 2019, Neural Development |
| `L1`                     | `Mi1`                      | L1からMi1への興奮性接続。ON運動検出のための遅延応答生成経路。                 | Takemura et al., 2013, Nature              |
| `L1`                     | `Tm3`                      | L1からTm3への興奮性接続。ON運動検出のための非遅延応答経路。                  | Takemura et al., 2013, Nature              |
| `L1`                     | `Mi4`                      | L1からMi4への興奮性接続。ON運動検出への追加入力。                       | Takemura et al., 2017, eLife               |
| `L1`                     | `Mi9`                      | L1からMi9への興奮性接続。ON運動検出への追加入力。                       | Takemura et al., 2017, eLife               |
| `L1`                     | `Dm3`                      | L1からDm3への興奮性接続。方位選択的処理の入力。                         | Ramos-Traslosheros et al., 2024, Nature    |
| `L2`                     | `Tm1`                      | L2からTm1への接続。OFF運動検出のための遅延応答生成経路。                   | Behnia et al., 2014, Nature                |
| `L2`                     | `Tm2`                      | L2からTm2への接続。OFF運動検出のための非遅延応答経路。                    | Behnia et al., 2014, Nature                |
| `L2`                     | `Tm4`                      | L2からTm4への接続。OFF運動検出への追加入力。                         | Behnia et al., 2014, Nature                |
| `Mi1`                    | `T4`                       | Mi1からT4への興奮性接続。遅延したON信号を提供し、方向選択性を生成。              | Takemura et al., 2017, eLife               |
| `Tm3`                    | `T4`                       | Tm3からT4への興奮性接続。非遅延のON信号を提供し、方向選択性を生成。              | Behnia et al., 2014, Nature                |
| `Mi4`                    | `T4`                       | Mi4からT4への接続。ON運動検出の追加入力。                           | Takemura et al., 2017, eLife               |
| `Mi9`                    | `T4`                       | Mi9からT4への接続。ON運動検出の追加入力。                           | Takemura et al., 2017, eLife               |
| `Tm1`                    | `T5`                       | Tm1からT5への接続。遅延したOFF信号を提供し、方向選択性を生成。                | Behnia et al., 2014, Nature                |
| `Tm2`                    | `T5`                       | Tm2からT5への接続。非遅延のOFF信号を提供し、方向選択性を生成。                | Behnia et al., 2014, Nature                |
| `Tm4`                    | `T5`                       | Tm4からT5への接続。OFF運動検出の追加入力。                          | Behnia et al., 2014, Nature                |
| `T4`                     | `HS`                       | T4細胞からHS細胞への方向選択的興奮性接続。ON運動の水平成分を伝達。               | Schnell et al., 2012, J Exp Biol           |
| `T4`                     | `VS`                       | T4細胞からVS細胞への方向選択的興奮性接続。ON運動の垂直成分を伝達。               | Schnell et al., 2012, J Exp Biol           |
| `T5`                     | `HS`                       | T5細胞からHS細胞への方向選択的興奮性接続。OFF運動の水平成分を伝達。              | Schnell et al., 2012, J Exp Biol           |
| `T5`                     | `VS`                       | T5細胞からVS細胞への方向選択的興奮性接続。OFF運動の垂直成分を伝達。              | Schnell et al., 2012, J Exp Biol           |
| `Dm3`                    | `TmY`                      | Dm3からTmYへの接続。方位選択的信号の伝達。同方位の場合は興奮性。                | Ramos-Traslosheros et al., 2024, Nature    |
| `Dm3`                    | `Dm3`                      | 異なる方位選択性を持つDm3細胞間の相互抑制性接続。交差方位抑制。                  | Ramos-Traslosheros et al., 2024, Nature    |
| `TmY`                    | `TmY`                      | 同じ方位選択性を持つTmY細胞間の興奮性接続。同方位興奮による方位検出強化。             | Ramos-Traslosheros et al., 2024, Nature    |
| `TmY`                    | `LC6`                      | TmYからLC6への接続（推定）。方位情報を含む視覚特徴をロブラへ伝達。               | Ramos-Traslosheros et al., 2024, Nature    |
| `Tm9`                    | `LC4`                      | Tm9からLC4への接続。物体情報をロブラへ伝達。                          | Wu et al., 2016, eLife                     |
| `Tm9`                    | `LC6`                      | Tm9からLC6への接続。ルーミング検出のための視覚情報を伝達。                   | Wu et al., 2016, eLife                     |
| `Tm9`                    | `LC10`                     | Tm9からLC10への接続。視覚特徴情報をロブラへ伝達。                       | Wu et al., 2016, eLife                     |
| `Tm9`                    | `LC11`                     | Tm9からLC11への接続。視覚特徴情報をロブラへ伝達。                       | Wu et al., 2016, eLife                     |
| `HS`                     | `DNOVS1`                   | HS細胞からDNOVS1への電気的結合と化学シナプス。水平運動情報を運動制御系へ出力。        | Suver et al., 2016, J Neurosci             |
| `VS`                     | `DNOVS1`                   | VS細胞からDNOVS1への電気的結合。垂直運動情報を運動制御系へ出力。               | Suver et al., 2016, J Neurosci             |
| `LC4`                    | `OG-downstream`            | LC4から中枢脳（オプティックグロメルリ）下流ニューロンへの出力。小物体運動情報を行動制御系へ伝達。 | Wu et al., 2016, eLife                     |
| `LC6`                    | `OG-downstream`            | LC6から中枢脳下流ニューロンへの出力。ルーミング情報を回避行動制御系へ伝達。            | Wu et al., 2016, eLife                     |
| `LC10`                   | `OG-downstream`            | LC10から中枢脳下流ニューロンへの出力。視覚特徴情報を行動制御系へ伝達。              | Wu et al., 2016, eLife                     |
| `LC11`                   | `OG-downstream`            | LC11から中枢脳下流ニューロンへの出力。視覚特徴情報を行動制御系へ伝達。              | Wu et al., 2016, eLife                     |
| `L1`                     | `L2`                       | L1とL2間の電気的結合。ON/OFF経路間の情報交換。コントラスト適応等に寄与。          | Joesch et al., 2010, Nature                |
| `HS`                     | `HS`                       | HS細胞間の電気的結合。広視野運動情報の空間統合を促進。                       | Haag & Borst, 2004 (推定)                    |
| `VS`                     | `VS`                       | VS細胞間の電気的結合。広視野運動情報の空間統合を促進。                       | Haag & Borst, 2004 (推定)                    |

## Connection定義の注釈

### BIFからConnectionへのマッピング
- BIFで記載された神経組織名（例：「L1 lamina neurons」）を、対応するUC名（`L1`）にマッピング
- 複数のBIFエントリが単一のConnectionに統合される場合がある（例：T4の4つのサブタイプ → `T4` → `HS`/`VS`）

### 接続の種類
1. **興奮性化学シナプス**: 大部分の接続
2. **抑制性化学シナプス**: `Dm3` → `Dm3`（交差方位抑制）
3. **電気的結合（ギャップジャンクション）**: `L1` ⇄ `L2`, `HS` ⇄ `HS`, `VS` ⇄ `VS`, `HS`/`VS` → `DNOVS1`

### 主要な情報フロー経路

#### 経路1: ON運動検出 → 水平/垂直運動 → 運動制御
`R1-R6` → `L1` → `Mi1`/`Tm3` → `T4` → `HS`/`VS` → `DNOVS1`

#### 経路2: OFF運動検出 → 水平/垂直運動 → 運動制御  
`R1-R6` → `L2` → `Tm1`/`Tm2` → `T5` → `HS`/`VS` → `DNOVS1`

#### 経路3: 方位検出 → 形態視覚 → 行動制御
`R1-R6` → `L1` → `Dm3` → `TmY` → `LC6` → `OG-downstream`

#### 経路4: 色/形態情報 → 物体検出 → 行動制御
`R7-R8` → `Tm9` → `LC4`/`LC6`/`LC10`/`LC11` → `OG-downstream`

### 相互結合とフィードバック
- `Dm3` ⇄ `Dm3`: 交差方位抑制による方位選択性の鋭敏化
- `TmY` ⇄ `TmY`: 同方位興奮による方位検出の強化
- `L1` ⇄ `L2`: ON/OFF経路間の相互作用
- `HS` ⇄ `HS`, `VS` ⇄ `VS`: 広視野統合

## 次ステップ
次に3_UC.mdに戻り、各UCのInterfaceを追加する。
