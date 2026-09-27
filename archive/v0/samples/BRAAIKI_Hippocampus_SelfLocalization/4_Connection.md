# 4_Connection.md - UC間接続定義

## 基本情報
- **ROI**: 海馬（Hippocampus）
- **TLF**: 自己位置推定

---

## Connection表（UC間接続）

| Sender(UC) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `MEC` | `DG` | 貫通路（perforant path）Layer II。格子信号、頭方向信号、境界信号、速度信号を伝達 | Witter et al., 2000 |
| `LEC` | `DG` | 貫通路Layer II。文脈・物体情報を伝達 | Hargreaves et al., 2005 |
| `MS` | `DG` | シータリズム調節信号（コリン作動性・GABAergic） | Freund & Antal, 1988 |
| `MEC` | `CA3` | 貫通路による直接投射。空間周期信号 | Witter, 2007 |
| `LEC` | `CA3` | 貫通路による直接投射 | Witter et al., 2000 |
| `DG` | `CA3` | 苔状線維（mossy fiber）。パターン分離された空間表現を伝達。興奮性投射 | Acsády et al., 1998 |
| `MS` | `CA3` | シータリズム調節信号 | Freund & Antal, 1988 |
| `CA3` | `CA3` | 再帰的側枝（recurrent collaterals）。自己連想的処理による記憶補完 | Treves & Rolls, 1994 |
| `CA3` | `CA1` | シャファー側枝（Schaffer collateral）。補完された空間パターンを伝達。主要な情報経路 | Amaral & Witter, 1989 |
| `MEC` | `CA1` | temporoammonic pathway（Layer III）。空間情報の直接入力。格子信号から場所信号への変換に寄与 | Brun et al., 2002 |
| `LEC` | `CA1` | temporoammonic pathway。文脈情報の直接入力 | Witter, 2007 |
| `ATN` | `CA1` | 頭方向信号のフィードバック | Jankowski et al., 2013 |
| `MS` | `CA1` | シータリズム調節信号 | Freund & Antal, 1988 |
| `CA1` | `SUB` | 主要な出力投射。場所信号を海馬台へ伝達 | Witter et al., 2000 |
| `SUB` | `MB` | 海馬台から乳頭体への投射。Papez回路 | Ishizuka, 2001 |
| `SUB` | `ATN_out` | 海馬台から前部視床核への投射 | Ishizuka, 2001 |
| `SUB` | `ACC` | 海馬台から帯状皮質への投射。経路情報 | Kitamura et al., 2017 |
| `SUB` | `NAc` | 海馬台から側坐核への投射。報酬関連空間情報 | Groenewegen et al., 1987 |

---

## ROI内接続のサマリー

### 主要情報フロー（三シナプス回路）
```
MEC/LEC → DG → CA3 → CA1 → SUB
```

### 直接経路（バイパス）
```
MEC/LEC → CA1 (temporoammonic pathway)
MEC/LEC → CA3 (direct perforant path)
```

### 再帰的処理
```
CA3 → CA3 (recurrent collaterals)
```

---

## 接続の機能的役割

| 接続 | 機能的役割 |
| ---- | ---------- |
| `MEC` → `DG` | 空間座標（格子座標系）の入力 |
| `LEC` → `DG` | 文脈情報による空間表現の修飾 |
| `DG` → `CA3` | パターン分離された疎な空間コード |
| `CA3` → `CA3` | 部分的手がかりからの完全パターン復元 |
| `CA3` → `CA1` | 再構成された空間パターンの伝達 |
| `MEC` → `CA1` | 現在の感覚入力に基づく位置情報 |
| `CA1` → `SUB` | 統合された場所信号の出力 |

---

## 参考文献

- Amaral, D.G. & Witter, M.P. (1989). Neuroscience, 31(3), 571-591.
- Witter, M.P. et al. (2000). Hippocampus, 10(4), 398-410.
- Brun, V.H. et al. (2002). Science, 296(5576), 2243-2246.
- Witter, M.P. (2007). Progress in Brain Research, 163, 43-61.
- Acsády, L. et al. (1998). Journal of Neuroscience, 18(9), 3386-3403.
- Treves, A. & Rolls, E.T. (1994). Hippocampus, 4(3), 374-391.
- Freund, T.F. & Antal, M. (1988). Nature, 336(6195), 170-173.
- Jankowski, M.M. et al. (2013). Frontiers in Neural Circuits, 7, 1.
