# 2_BIF.md - Brain Information Flow（神経接続データベース）

## 基本情報
- **ROI**: 海馬（Hippocampus）
- **TLF**: 自己位置推定

---

## 神経接続表

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 内側嗅内皮質II層 (MEC Layer II) (ROI外) | 歯状回 (DG) | 貫通路（perforant path）による興奮性投射。格子細胞、頭方向細胞、境界細胞からの空間情報を伝達 | Witter et al., 2000; van Strien et al., 2009 |
| 内側嗅内皮質II層 (MEC Layer II) (ROI外) | CA3 | 貫通路による直接投射。空間周期信号を伝達 | Witter, 2007 |
| 内側嗅内皮質III層 (MEC Layer III) (ROI外) | CA1 | temporoammonic pathwayによる直接投射。空間情報の直接入力 | Brun et al., 2002 |
| 外側嗅内皮質II層 (LEC Layer II) (ROI外) | 歯状回 (DG) | 貫通路による投射。文脈・物体情報を伝達 | Hargreaves et al., 2005 |
| 外側嗅内皮質II層 (LEC Layer II) (ROI外) | CA3 | 貫通路による投射 | Witter et al., 2000 |
| 外側嗅内皮質III層 (LEC Layer III) (ROI外) | CA1 | temporoammonic pathwayによる投射 | Witter, 2007 |
| 歯状回 (DG) | CA3 | 苔状線維（mossy fiber）による興奮性投射。パターン分離された信号を伝達 | Acsády et al., 1998 |
| CA3 | CA3 | 再帰的側枝（recurrent collaterals）による自己連想結合。パターン補完に関与 | Treves & Rolls, 1994 |
| CA3 | CA1 | シャファー側枝（Schaffer collateral）による興奮性投射。主要な情報伝達経路 | Amaral & Witter, 1989 |
| CA1 | 海馬台 (Subiculum) | 興奮性投射。場所信号を出力構造へ伝達 | Witter et al., 2000 |
| CA1 | 内側嗅内皮質V層 (MEC Layer V) (ROI外) | 直接フィードバック投射 | Cenquizca & Bhavneet, 2007 |
| 海馬台 (Subiculum) | 乳頭体 (Mammillary Body) (ROI外) | 海馬台-乳頭体投射。Papez回路の一部 | Ishizuka, 2001 |
| 海馬台 (Subiculum) | 視床前核 (Anterior Thalamus) (ROI外) | 空間情報を視床へ伝達 | Ishizuka, 2001 |
| 海馬台 (Subiculum) | 帯状皮質 (Cingulate Cortex) (ROI外) | 空間・経路情報の伝達 | Kitamura et al., 2017 |
| 海馬台 (Subiculum) | 側坐核 (Nucleus Accumbens) (ROI外) | 報酬関連空間情報の伝達 | Groenewegen et al., 1987 |
| 前部視床核 (ATN) (ROI外) | CA1 | 頭方向情報のフィードバック | Jankowski et al., 2013 |
| 内側中隔 (Medial Septum) (ROI外) | 歯状回 (DG) | GABAergicおよびコリン作動性入力。シータリズムの生成に関与 | Freund & Antal, 1988 |
| 内側中隔 (Medial Septum) (ROI外) | CA3 | シータリズム調節 | Freund & Antal, 1988 |
| 内側中隔 (Medial Septum) (ROI外) | CA1 | シータリズム調節 | Freund & Antal, 1988 |
| CA1 (介在ニューロン) | CA1 (錐体細胞) | 局所抑制性投射。時間的精度の向上 | Klausberger & Somogyi, 2008 |
| CA3 (介在ニューロン) | CA3 (錐体細胞) | 局所抑制性投射 | Klausberger & Somogyi, 2008 |
| 歯状回 (苔状細胞) | 歯状回 (顆粒細胞) | 局所興奮性フィードバック | Scharfman, 2016 |

---

## 主要経路のまとめ

### 1. 三シナプス回路（Trisynaptic Pathway）
```
EC → DG → CA3 → CA1
```
古典的な海馬内情報処理経路。

### 2. 直接経路（Monosynaptic Pathway）
```
EC (Layer III) → CA1
```
嗅内皮質から場所細胞への直接入力。

### 3. 出力経路
```
CA1 → Subiculum → [Mammillary Body, Anterior Thalamus, Cingulate Cortex, Nucleus Accumbens]
```

---

## 空間情報に特化した接続

| 空間情報タイプ | 送信元 | 主要経路 |
| ------------- | ------ | -------- |
| 格子信号 (Grid) | MEC Layer II | MEC → DG → CA3 → CA1 |
| 頭方向信号 (Head Direction) | MEC, ATN | MEC → CA1 (direct), ATN → CA1 |
| 境界信号 (Border) | MEC | MEC → DG, MEC → CA1 |
| 速度信号 (Speed) | MEC | MEC → CA1 |
| 文脈信号 (Context) | LEC | LEC → DG → CA3 → CA1 |

---

## 参考文献

- Amaral, D.G. & Witter, M.P. (1989). The three-dimensional organization of the hippocampal formation: a review of anatomical data. *Neuroscience*, 31(3), 571-591.
- Witter, M.P. et al. (2000). Cortico-hippocampal communication by way of parallel parahippocampal-subicular pathways. *Hippocampus*, 10(4), 398-410.
- van Strien, N.M. et al. (2009). The anatomy of memory: an interactive overview of the parahippocampal-hippocampal network. *Nature Reviews Neuroscience*, 10(4), 272-282.
- Brun, V.H. et al. (2002). Place cells and place recognition maintained by direct entorhinal-hippocampal circuitry. *Science*, 296(5576), 2243-2246.
- Kitamura, T. et al. (2017). Island cells control temporal association memory. *Science*, 343(6173), 896-901.
- Klausberger, T. & Somogyi, P. (2008). Neuronal diversity and temporal dynamics: the unity of hippocampal circuit operations. *Science*, 321(5885), 53-57.
