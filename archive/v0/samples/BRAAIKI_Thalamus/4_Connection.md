# Connection定義: UC間の接続

## 概要
BIFで特定した神経接続を、定義したUC間の接続として記述します。
Sender/ReceiverはUC名で記述し、すべてバッククォート（`）で囲んでいます。

## UC間の接続一覧

| Sender(UC) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 網膜M型RGC(ROI外) | `LGN_M` | M型網膜神経節細胞からLGN Magnocellular層への興奮性投射。動き情報と時間的変化の入力。 | Sherman & Guillery, 2002 |
| 網膜P型RGC(ROI外) | `LGN_P` | P型網膜神経節細胞からLGN Parvocellular層への興奮性投射。高空間周波数と赤緑色対立情報の入力。 | Sherman & Guillery, 2002 |
| 網膜K型RGC(ROI外) | `LGN_K` | K型網膜神経節細胞からLGN Koniocellular層への興奮性投射。青黄色対立情報の入力。 | Sherman & Guillery, 2002 |
| `LGN_M` | V1_Layer4Cα(ROI外) | LGN M層からV1 Layer 4Cαへの視放線投射。動き情報と時間的変化をV1へ中継。 | Callaway, 1998 |
| `LGN_P` | V1_Layer4Cβ(ROI外) | LGN P層からV1 Layer 4Cβへの視放線投射。形態と色情報をV1へ中継。 | Callaway, 1998 |
| `LGN_K` | V1_Blob/Layer1(ROI外) | LGN K層からV1のblob領域とLayer 1への投射。青黄色情報をV1へ中継。 | Callaway, 1998 |
| V1_Layer6(ROI外) | `LGN_M` | V1 Layer 6からLGN M層への皮質視床フィードバック。興奮性。M層の活動を調節。 | Sherman & Guillery, 2002 |
| V1_Layer6(ROI外) | `LGN_P` | V1 Layer 6からLGN P層への皮質視床フィードバック。興奮性。P層の活動を調節。 | Sherman & Guillery, 2002 |
| V1_Layer6(ROI外) | `LGN_K` | V1 Layer 6からLGN K層への皮質視床フィードバック。興奮性。K層の活動を調節。 | Sherman & Guillery, 2002 |
| `LGN_M` | TRN(ROI外) | LGN M層から視床網様核への興奮性投射側枝。 | Pinault, 2004 |
| `LGN_P` | TRN(ROI外) | LGN P層から視床網様核への興奮性投射側枝。 | Pinault, 2004 |
| `LGN_K` | TRN(ROI外) | LGN K層から視床網様核への興奮性投射側枝。 | Pinault, 2004 |
| TRN(ROI外) | `LGN_M` | 視床網様核からLGN M層へのGABAergic抑制性投射。注意による視覚ゲーティング。 | Pinault, 2004 |
| TRN(ROI外) | `LGN_P` | 視床網様核からLGN P層へのGABAergic抑制性投射。注意による視覚ゲーティング。 | Pinault, 2004 |
| TRN(ROI外) | `LGN_K` | 視床網様核からLGN K層へのGABAergic抑制性投射。注意による視覚ゲーティング。 | Pinault, 2004 |
| 上丘(ROI外) | `LGN_M` | 上丘からLGN M層への投射。視覚運動統合と注意の調節。 | Bickford et al., 2015 |
| 上丘(ROI外) | `LGN_P` | 上丘からLGN P層への投射。視覚運動統合と注意の調節。 | Bickford et al., 2015 |
| 上丘(ROI外) | `LGN_K` | 上丘からLGN K層への投射。視覚運動統合と注意の調節。 | Bickford et al., 2015 |
| 青斑核(ROI外) | `LGN_M` | 青斑核からのノルアドレナリン作動性投射。覚醒レベルによるM層活動の調節。 | McCormick, 1992 |
| 青斑核(ROI外) | `LGN_P` | 青斑核からのノルアドレナリン作動性投射。覚醒レベルによるP層活動の調節。 | McCormick, 1992 |
| 青斑核(ROI外) | `LGN_K` | 青斑核からのノルアドレナリン作動性投射。覚醒レベルによるK層活動の調節。 | McCormick, 1992 |
| 脚橋被蓋核(ROI外) | `LGN_M` | 脚橋被蓋核からのアセチルコリン作動性投射。注意によるM層活動の調節。 | Sherman & Guillery, 2002 |
| 脚橋被蓋核(ROI外) | `LGN_P` | 脚橋被蓋核からのアセチルコリン作動性投射。注意によるP層活動の調節。 | Sherman & Guillery, 2002 |
| 脚橋被蓋核(ROI外) | `LGN_K` | 脚橋被蓋核からのアセチルコリン作動性投射。注意によるK層活動の調節。 | Sherman & Guillery, 2002 |
| `LGN_M` | `LGN_IN` | LGN M層中継細胞から介在ニューロンへの興奮性投射。フィードフォワード抑制回路の駆動。 | Sherman, 2004 |
| `LGN_P` | `LGN_IN` | LGN P層中継細胞から介在ニューロンへの興奮性投射。フィードフォワード抑制回路の駆動。 | Sherman, 2004 |
| `LGN_K` | `LGN_IN` | LGN K層中継細胞から介在ニューロンへの興奮性投射。フィードフォワード抑制回路の駆動。 | Sherman, 2004 |
| `LGN_IN` | `LGN_M` | 介在ニューロンからLGN M層中継細胞へのGABAergic抑制性投射。側方抑制とコントラスト増強。 | Sherman, 2004 |
| `LGN_IN` | `LGN_P` | 介在ニューロンからLGN P層中継細胞へのGABAergic抑制性投射。側方抑制とコントラスト増強。 | Sherman, 2004 |
| `LGN_IN` | `LGN_K` | 介在ニューロンからLGN K層中継細胞へのGABAergic抑制性投射。側方抑制とコントラスト増強。 | Sherman, 2004 |

## 補足

### ROI内の接続
以下の接続はROI（LGN）内での情報処理を構成します：
- `LGN_M`, `LGN_P`, `LGN_K` → `LGN_IN`（フィードフォワード）
- `LGN_IN` → `LGN_M`, `LGN_P`, `LGN_K`（フィードバック抑制）

### ROI外からの主要入力
- 網膜からの視覚情報（駆動入力）
- V1からのフィードバック（調節入力）
- TRNからの抑制（ゲーティング入力）
- 脳幹からの神経修飾（状態調節）

### ROI外への主要出力
- V1への視覚情報の中継（TLFの主要出力）
- TRNへの側枝投射（フィードバックループ）



