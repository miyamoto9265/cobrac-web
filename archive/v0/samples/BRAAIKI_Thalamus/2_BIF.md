# BIF（Brain Information Flow）: LGNの神経接続データベース

## 概要
外側膝状体（Lateral Geniculate Nucleus, LGN）に関連する神経接続を網羅的に記録したデータベースです。
解剖学的投射の有無に基づいて記述しています。

## 神経接続一覧

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 網膜神経節細胞(ROI外) | LGN | 網膜からの視神経投射。M細胞、P細胞、K細胞の3種類のRGCがLGNの異なる層に投射。主要な視覚入力。 | Sherman & Guillery, 2002, Exploring the Thalamus and Its Role in Cortical Function |
| LGN | V1 Layer 4(ROI外) | LGNから一次視覚皮質Layer 4への視放線投射。Magnocellular層→4Cα、Parvocellular層→4Cβ。視覚情報の主要出力。 | Callaway, 1998, Journal of Comparative Neurology |
| V1 Layer 6(ROI外) | LGN | 皮質視床フィードバック投射。興奮性。視覚処理の調節とゲーティング機能。V1 Layer 6のピラミッド細胞が起源。 | Sherman & Guillery, 2002 |
| LGN | 視床網様核(ROI外) | LGNから視床網様核への興奮性投射。視床網様核の活性化に寄与。 | Pinault, 2004, Progress in Neurobiology |
| 視床網様核(ROI外) | LGN | 視床網様核からLGNへのGABA作動性抑制性投射。注意と覚醒による視覚情報のゲーティング。 | Pinault, 2004, Progress in Neurobiology |
| V1 Layer 6(ROI外) | 視床網様核(ROI外) | V1からTRNへの側枝投射。フィードバック経路の一部。 | Sherman & Guillery, 2002 |
| 上丘(ROI外) | LGN | 上丘からLGNへの投射。視覚的注意と視覚運動統合の調節。 | Bickford et al., 2015, Visual Neuroscience |
| 青斑核(ROI外) | LGN | ノルアドレナリン作動性投射。覚醒レベルと注意状態の調節。 | McCormick, 1992, Cerebral Cortex |
| 脚橋被蓋核(ROI外) | LGN | アセチルコリン作動性投射。覚醒と注意による視覚処理の調節。 | Sherman & Guillery, 2002 |
| LGN介在ニューロン | LGN中継細胞 | LGN内の局所GABAergic介在ニューロンによる中継細胞への抑制。側方抑制とフィードフォワード抑制。 | Sherman, 2004, Current Opinion in Neurobiology |
| LGN中継細胞 | LGN介在ニューロン | 中継細胞から介在ニューロンへの興奮性投射。局所フィードバック回路。 | Sherman, 2004 |

## 補足事項

### LGNの細胞構造
- **中継細胞（Relay cells/Thalamocortical neurons）**: LGNの主要な投射ニューロン。視覚情報をV1へ中継。
- **介在ニューロン（Interneurons）**: GABA作動性の局所抑制性ニューロン。中継細胞の活動を調節。

### LGNの層構造
- **Magnocellular層（M層）**: 動きや輝度変化の情報処理
- **Parvocellular層（P層）**: 色や詳細な形態の情報処理
- **Koniocellular層（K層）**: 青-黄色対立や粗い形態の情報処理

### 入力の割合
- 網膜からの入力: LGNへのシナプスの約10%
- 皮質からのフィードバック: 約30-40%
- その他の調節入力: 約50-60%

この非対称性は、LGNが単なる受動的中継点ではなく、能動的な情報処理とゲーティングを行う部位であることを示しています。



