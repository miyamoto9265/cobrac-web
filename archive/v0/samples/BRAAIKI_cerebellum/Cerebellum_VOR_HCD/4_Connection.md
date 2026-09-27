# ステップ4: Connectionの定義とInterfaceの追加

## Connectionとは
Connectionは、神経科学的事実（BIF）に基づいて定義されたUC間の接続です。UC間の情報の受け渡し経路を表現します。

## 注意事項
- Sender/ReceiverはUC名で記述（神経組織名ではない）
- **UC名は必ずバッククォート（`）で囲む**
- BIFで特定した解剖学的接続を、適切なUC間の接続にマッピング
- 一つのBIFが複数のConnection、または複数のBIFが一つのConnectionに対応する場合がある

---

## Connectionテーブル

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
| ------------------------ | -------------------------- | ------- | --------- |
| `MF_VN` | `GrC` | 前庭神経核からの苔状線維が顆粒細胞の樹状突起に興奮性シナプスを形成。糸球内で接続。前庭情報（頭部運動）を伝達 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| `MF_PN` | `GrC` | 橋底核からの苔状線維が顆粒細胞を興奮。糸球内で接続。運動関連情報を伝達 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| `MF_PH` | `GrC` | 舌下神経周囲核群からの苔状線維が顆粒細胞を興奮。糸球内で接続。前庭動眼反射関連情報 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| `MF_PMT` | `GrC` | 傍正中束核からの苔状線維が顆粒細胞を興奮。糸球内で接続。運動コマンドのコピー（efference copy）を伝達 | Langer et al. 1985, https://link.springer.com/article/10.1007/BF01188032 |
| `MF_VIII` | `GrC` | 一次前庭求心性線維からの苔状線維が顆粒細胞を興奮。糸球内で接続。一次前庭情報（頭部角速度）を伝達 | Voogd et al. 2012, https://www.ncbi.nlm.nih.gov/books/NBK557380/ |
| `MF_VN` | `GoC` | 前庭神経核からの苔状線維がゴルジ細胞の基底樹状突起に興奮性シナプスを形成。フィードフォワード興奮 | Vos et al. 1999, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| `MF_PN` | `GoC` | 橋底核からの苔状線維がゴルジ細胞を興奮。フィードフォワード興奮 | Vos et al. 1999, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| `MF_PH` | `GoC` | 舌下神経周囲核群からの苔状線維がゴルジ細胞を興奮。フィードフォワード興奮 | Vos et al. 1999, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| `MF_PMT` | `GoC` | 傍正中束核からの苔状線維がゴルジ細胞を興奮。フィードフォワード興奮 | Vos et al. 1999, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| `MF_VIII` | `GoC` | 一次前庭求心性線維からの苔状線維がゴルジ細胞を興奮。フィードフォワード興奮 | Vos et al. 1999, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| `GrC` | `GoC` | 顆粒細胞の上行軸索がゴルジ細胞の頂樹状突起に興奮性シナプスを形成。フィードバック回路。顆粒細胞活動が自身の抑制を調整 | Cesana et al. 2013, https://www.jneurosci.org/content/33/30/12430 |
| `GoC` | `GrC` | ゴルジ細胞が糸球内で顆粒細胞樹状突起に抑制性シナプスを形成。フィードバック抑制とフィードフォワード抑制。顆粒細胞層の時空間活動パターンを制御 | D'Angelo et al. 2013, https://www.frontiersin.org/articles/10.3389/fncir.2013.00093 |
| `GrC` | `PC` | 顆粒細胞の平行線維がプルキンエ細胞の樹状突起棘に興奮性シナプスを形成。各平行線維は3-5個のプルキンエ細胞に接触、各プルキンエ細胞は数千の平行線維から入力。弱いが多数の入力 | Napper & Harvey 1988, https://en.wikipedia.org/wiki/Cerebellar_granule_cell |
| `GrC` | `BC` | 顆粒細胞の平行線維がバスケット細胞を興奮。興奮性入力によりバスケット細胞を駆動 | Sultan & Bower 1998, https://www.frontiersin.org/journals/molecular-neuroscience/articles/10.3389/fnmol.2019.00267 |
| `GrC` | `SC` | 顆粒細胞の平行線維がステラ細胞を興奮。興奮性入力によりステラ細胞を駆動 | Sultan & Bower 1998, https://www.frontiersin.org/journals/molecular-neuroscience/articles/10.3389/fnmol.2019.00267 |
| `BC` | `PC` | バスケット細胞がプルキンエ細胞の細胞体と軸索起始部にバスケット様シナプス複合体を形成。強力な抑制性入力。低周波数帯域でプルキンエ細胞応答をフィルタリング | Kawaguchi & Kubota 1998, https://www.nature.com/articles/s41598-025-09964-2 |
| `SC` | `PC` | ステラ細胞がプルキンエ細胞の樹状突起に抑制性シナプスを形成。高周波数帯域でプルキンエ細胞応答をフィルタリング | Sultan 2000, https://www.nature.com/articles/s41598-025-09964-2 |
| `CF_IO` | `PC` | 登上線維が各プルキンエ細胞の樹状突起樹を登るように強力なシナプスを形成。1対1接続。視覚誤差信号（retinal slip）を伝達し、"教師信号"として平行線維-プルキンエ細胞シナプスの可塑性を誘導 | Ito 2006, https://www.ncbi.nlm.nih.gov/books/NBK10865/ |
| `PC` | `VN_output` | プルキンエ細胞が前庭神経核（内側・上前庭神経核）に抑制性投射。前庭神経核の二次ニューロンを抑制することでVORゲインを調整 | Barmack et al. 1993, Blazquez et al. 2000, https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0164037 |

---

## Connection図（概念図）

```
[ROI外入力]                    [ROI内: 小脳小節]                         [ROI外出力]

MF_VN ──────┐
MF_PN ──────┤
MF_PH ──────┼──→ GrC ─┬─→ PC ──→ VN_output
MF_PMT ─────┤         │    ↑
MF_VIII ────┤         │    │
            │         ↓    │
            └──→ GoC ←─────┘
                 ↓
                GrC
                 │
                 ├──→ BC ──→ PC
                 │
                 └──→ SC ──→ PC

CF_IO ──────────────→ PC
```

---

## 各UCのInterface定義

Connectionに基づいて、各UCのInterfaceを定義します。形式は `[Output1, Output2, ...] = UC名(Input1, Input2, ...)` を遵守します。

### ROI内UC

| Circuit ID | Interface |
| ---------- | --------- |
| `GrC` | [`PC`, `BC`, `SC`, `GoC`] = `GrC`(`MF_VN`, `MF_PN`, `MF_PH`, `MF_PMT`, `MF_VIII`, `GoC`) |
| `GoC` | [`GrC`] = `GoC`(`MF_VN`, `MF_PN`, `MF_PH`, `MF_PMT`, `MF_VIII`, `GrC`) |
| `BC` | [`PC`] = `BC`(`GrC`) |
| `SC` | [`PC`] = `SC`(`GrC`) |
| `PC` | [`VN_output`] = `PC`(`GrC`, `BC`, `SC`, `CF_IO`) |

### ROI外入出力

| Circuit ID | Interface |
| ---------- | --------- |
| `MF_VN` | [`GrC`, `GoC`] = `MF_VN`() |
| `MF_PN` | [`GrC`, `GoC`] = `MF_PN`() |
| `MF_PH` | [`GrC`, `GoC`] = `MF_PH`() |
| `MF_PMT` | [`GrC`, `GoC`] = `MF_PMT`() |
| `MF_VIII` | [`GrC`, `GoC`] = `MF_VIII`() |
| `CF_IO` | [`PC`] = `CF_IO`() |
| `VN_output` | [] = `VN_output`(`PC`) |

---

## Interface解釈

### `GrC`（顆粒細胞）
- **入力**: 5種類の苔状線維（`MF_VN`, `MF_PN`, `MF_PH`, `MF_PMT`, `MF_VIII`）+ ゴルジ細胞からの抑制（`GoC`）
- **出力**: プルキンエ細胞（`PC`）、バスケット細胞（`BC`）、ステラ細胞（`SC`）、ゴルジ細胞（`GoC`）

### `GoC`（ゴルジ細胞）
- **入力**: 5種類の苔状線維（`MF_VN`, `MF_PN`, `MF_PH`, `MF_PMT`, `MF_VIII`）+ 顆粒細胞からのフィードバック（`GrC`）
- **出力**: 顆粒細胞への抑制（`GrC`）

### `BC`（バスケット細胞）
- **入力**: 顆粒細胞の平行線維（`GrC`）
- **出力**: プルキンエ細胞への抑制（`PC`）

### `SC`（ステラ細胞）
- **入力**: 顆粒細胞の平行線維（`GrC`）
- **出力**: プルキンエ細胞への抑制（`PC`）

### `PC`（プルキンエ細胞）
- **入力**: 顆粒細胞の平行線維（`GrC`）、バスケット細胞（`BC`）、ステラ細胞（`SC`）、登上線維（`CF_IO`）
- **出力**: 前庭神経核への抑制（`VN_output`）

---

## 次のステップ

3_UC.mdに戻り、各UCにInterfaceを追加します。その後、ステップ5でOutput Semanticsを定義します。
