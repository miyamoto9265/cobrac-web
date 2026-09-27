# ステップ4: Connectionの定義とInterfaceの追加

## 目的
UC間の接続を定義し、各UCの入力情報（Interface）を確定する。

---

## 4-1. Connectionの定義

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
| ------------------------- | -------------------------- | ------- | --------- |
| `Thalamus_CS` (ROI外) | `BLA` | 視床から条件刺激（CS）情報をBLAへ伝達。聴覚視床（MGm, PIN, Sg）や視覚視床（LG, LP）からの入力。 | LeDoux et al., 1990; Romanski & LeDoux, 1992; Linke et al., 1999 |
| `Thalamus_US` (ROI外) | `BLA` | 視床から無条件刺激（US）情報をBLAへ伝達。後部視床（PIT）や外側視床（Calr+）からの侵害刺激情報。 | Shi & Davis, 1999; Lanuza et al., 2004; Barsy et al., 2020 |
| `vHPC` (ROI外) | `BLA` | 腹側海馬から文脈情報をBLAへ伝達。消去学習と文脈依存的恐怖調節に関与。 | Maren & Hobin, 2007; Orsini et al., 2011 |
| `vHPC` (ROI外) | `PL` | 腹側海馬から文脈情報をPLへ伝達。文脈性恐怖記憶と恐怖再発に関与。 | Jin & Maren, 2015; Xu et al., 2016 |
| `vHPC` (ROI外) | `IL` | 腹側海馬から文脈情報をILへ伝達。消去学習における文脈依存的調節に関与。 | Orsini et al., 2011 |
| `BLA` | `CEA` | BLAからCEAへの直接興奮性投射。恐怖反応を駆動。 | Pitkänen et al., 1997 |
| `BLA` | `ITC` | BLAからITCへの投射。消去学習時にITCを活性化し、CEA抑制の準備。 | Likhtik et al., 2008; Busti et al., 2011 |
| `ITC` | `CEA` | ITCからCEAへのGABAergic抑制性投射。ITC活性化によりCEA出力を抑制し、恐怖反応を抑制。 | Royer et al., 1999; Likhtik et al., 2008 |
| `CEA` | `Output_Fear` (ROI外) | CEAから視床下部・PAG・脳幹への投射。恐怖反応（すくみ、自律神経反応、内分泌反応）を実行。 | LeDoux et al., 1988; Davis, 1992 |
| `PL` | `BLA` | PLからBLA（主に吻側BLA）への興奮性投射。恐怖発現と恐怖再発を促進。 | Vertes, 2004; McGarry & Carter, 2016; Fillinger et al., 2022 |
| `IL` | `BLA` | ILからBLA（主に尾側BLA）への興奮性投射。消去記憶の獲得・保持に必須。 | Milad & Quirk, 2002; Do-Monte et al., 2015; Bloodgood et al., 2018; Fillinger et al., 2022 |
| `IL` | `ITC` | ILからITCへの興奮性投射。IL活性化によりITCを活性化し、CEA出力を抑制。 | Quirk et al., 2003; Amir et al., 2011 |
| `BLA` | `PL` | BLA（主に吻側BLA）からPLへの逆行性投射。ボトムアップの恐怖情報伝達。 | Little & Carter, 2013; Fillinger et al., 2022 |
| `BLA` | `IL` | BLA（主に尾側BLA）からILへの逆行性投射。ボトムアップの恐怖情報伝達。 | Vertes, 2004; Fillinger et al., 2022 |
| `PL` | `IL` | PLからILへの投射。IL依存学習の12-14時間後に必要。mPFC内の局所回路。 | Sharpe & Killcross, 2018 |
| `IL` | `PL` | ILからPLへの投射。IL依存学習中に必要。mPFC内の局所回路。 | Sharpe & Killcross, 2018 |

---

## 4-2. Interfaceの追加

各UCのInterfaceを追加した3_UC.mdの更新版を以下に示します。

### Interface形式
```
[出力UC名1, 出力UC名2, ...] = このUC名(入力UC名1, 入力UC名2, ...)
```

---

| Circuit ID | Names | Comment | Interface |
| ---------- | ----- | ------- | --------- |
| `BLA` | Basolateral Amygdala (基底外側扁桃体) | CS-US連合学習の中心的役割を担う。条件刑激（CS）と無条件刺激（US）の時間的関連を学習し、恐怖記憶を形成・保持する。消去学習時には下辺縁皮質からの入力により消去記憶も保持する。外側扁桃体核（LA）を含む基底外側扁桃体複合体として統合的に扱う。 | [`CEA`, `ITC`, `PL`, `IL`] = `BLA`(`Thalamus_CS`, `Thalamus_US`, `vHPC`, `PL`, `IL`) |
| `CEA` | Central Amygdala (中心核) | 恐怖反応の出力中枢。BLAやITCからの情報を統合し、視床下部・中脳水道周囲灰白質・脳幹へ投射して、すくみ反応、自律神経反応、内分泌反応などの恐怖反応を実行する。 | [`Output_Fear`] = `CEA`(`BLA`, `ITC`) |
| `ITC` | Intercalated Cells (介在細胞群) | 扁桃体の「オフスイッチ」として機能するGABAergic抑制性ニューロン群。BLAとCEAの間に位置し、消去学習時にILからの入力により活性化され、CEA出力を抑制して恐怖反応を抑制する。消去記憶の発現基盤。 | [`CEA`] = `ITC`(`BLA`, `IL`) |
| `PL` | Prelimbic Cortex (前辺縁皮質) | 内側前頭前野の一部。恐怖の発現と恐怖再発を促進する。BLAへ興奮性投射を送り、文脈依存的な恐怖反応の発現を制御する。腹側海馬から文脈情報を受け取り、BLAへトップダウン制御を行う。 | [`BLA`, `IL`] = `PL`(`vHPC`, `BLA`, `IL`) |
| `IL` | Infralimbic Cortex (下辺縁皮質) | 内側前頭前野の一部。消去学習の獲得・保持・想起に必須。BLAとITCへ興奮性投射を送り、消去記憶を形成・維持する。消去訓練後にIL→BLA投射ニューロンの興奮性が増加し、恐怖反応の抑制を媒介する。 | [`BLA`, `ITC`, `PL`] = `IL`(`vHPC`, `BLA`, `PL`) |

---

## Interfaceの解釈

### `BLA` (Basolateral Amygdala)
- **入力**: 
  - `Thalamus_CS`: 条件刺激（音、光など）
  - `Thalamus_US`: 無条件刺激（足ショック、痛みなど）
  - `vHPC`: 文脈情報
  - `PL`: トップダウン恐怖促進信号
  - `IL`: トップダウン消去促進信号
- **出力**:
  - `CEA`: 恐怖反応駆動
  - `ITC`: ITC活性化準備
  - `PL`: ボトムアップ恐怖情報
  - `IL`: ボトムアップ恐怖情報

### `CEA` (Central Amygdala)
- **入力**:
  - `BLA`: 恐怖駆動信号
  - `ITC`: 抑制信号（GABAergic）
- **出力**:
  - `Output_Fear`: 恐怖反応実行（視床下部、PAG、脳幹へ）

### `ITC` (Intercalated Cells)
- **入力**:
  - `BLA`: BLAからの興奮性入力
  - `IL`: ILからの消去促進信号
- **出力**:
  - `CEA`: CEA抑制（GABAergic）

### `PL` (Prelimbic Cortex)
- **入力**:
  - `vHPC`: 文脈情報
  - `BLA`: ボトムアップ恐怖情報
  - `IL`: IL-PL相互作用
- **出力**:
  - `BLA`: トップダウン恐怖促進
  - `IL`: PL-IL相互作用

### `IL` (Infralimbic Cortex)
- **入力**:
  - `vHPC`: 文脈情報
  - `BLA`: ボトムアップ恐怖情報
  - `PL`: PL-IL相互作用
- **出力**:
  - `BLA`: トップダウン消去促進
  - `ITC`: ITC活性化による消去実行
  - `PL`: IL-PL相互作用

---

## 次のステップへ
次のステップ5では、各UCのOutput Semantics（出力情報の意味内容）を定義する。
