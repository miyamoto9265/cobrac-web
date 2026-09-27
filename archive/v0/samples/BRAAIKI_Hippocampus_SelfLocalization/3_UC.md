# 3_UC.md - Uniform Component定義

## 基本情報
- **ROI**: 海馬（Hippocampus）
- **TLF**: 自己位置推定

---

## ROI内 Uniform Component完全定義

### UC1: `DG`（歯状回）

| 項目                                           | 内容                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Uniform Component**                        | `DG`                                                                                                 |
| **Comment**                                  | 歯状回（Dentate Gyrus）。嗅内皮質から空間・文脈情報を受け取り、パターン分離を行う。顆粒細胞が主要な構成要素。                                        |
| **Interface**                                | `MEC`, `LEC`, `MS`                                                                                   |
| **Output Semantics**                         | パターン分離された空間コード。類似した空間入力を直交化した疎な神経活動パターンとして表現。異なる場所や文脈の弁別を可能にする。                                      |
| **A1. Requirement**                          | 嗅内皮質からの連続的な空間座標情報（格子信号、文脈信号）を受け取り、類似した入力パターンを区別可能な離散的・疎な表現に変換する。これにより、近接した位置や類似した環境を弁別可能にする。         |
| **A2. Requirement realization by interface** | MECから格子座標と頭方向信号、LECから文脈情報を受け取る。MSからのシータリズムにより、入力の時間的ゲーティングが行われる。これらの入力を統合し、Requirementで述べた入力弁別を実現する。 |
| **B1. Capability**                           | 高次元入力ベクトルを疎な活動パターンに変換するパターン分離。少数の顆粒細胞のみが活性化する競合的抑制により、類似入力の直交化を達成。                                   |
| **B2. Mechanism**                            | 顆粒細胞の低い発火率（約1-2%がアクティブ）と強力なフィードフォワード抑制により実現。入力の小さな違いが出力の大きな違いに増幅される。Winner-take-all型の競合的選択。          |
| **B3. Implementation**                       | ```python                                                                                            |


---

### UC2: `CA3`（海馬CA3領域）

| 項目 | 内容 |
| ---- | ---- |
| **Uniform Component** | `CA3` |
| **Comment** | 海馬CA3領域。歯状回から苔状線維を介して入力を受け、再帰的結合によるパターン補完・自己連想的処理を行う。 |
| **Interface** | `MEC`, `LEC`, `DG`, `MS`, `CA3` |
| **Output Semantics** | パターン補完された空間表現。部分的な手がかりから完全な空間パターンを復元。過去の経験に基づく空間記憶の想起。 |
| **A1. Requirement** | 部分的または劣化した空間入力（歯状回からの疎なパターン、嗅内皮質からの直接入力）から、過去に学習した完全な空間パターンを復元する。これにより、不完全な位置手がかりからでも自己位置を推定可能にする。 |
| **A2. Requirement realization by interface** | DGから疎なパターン分離済み信号、MECとLECから直接の空間・文脈情報を受け取る。CA3自身からの再帰的入力により、記憶された空間パターンとの照合・補完を行う。MSのシータリズムが処理の時間的構造を提供。 |
| **B1. Capability** | 自己連想記憶としてのパターン補完。部分入力から完全パターンへのアトラクタ動力学による収束。 |
| **B2. Mechanism** | 再帰的側枝（recurrent collaterals）による相互結合が、Hopfield型の連想記憶ネットワークを形成。学習時に強化されたシナプスパターンがアトラクタ状態を定義し、部分入力がアトラクタ盆地に落ち込むことでパターン補完が達成される。 |
| **B3. Implementation** | 

---

### UC3: `CA1`（海馬CA1領域）

| 項目 | 内容 |
| ---- | ---- |
| **Uniform Component** | `CA1` |
| **Comment** | 海馬CA1領域。シャファー側枝（CA3から）および直接経路（嗅内皮質から）の入力を統合。場所細胞が存在し、自己位置を表現する主要領域。 |
| **Interface** | `CA3`, `MEC`, `LEC`, `ATN`, `MS` |
| **Output Semantics** | 場所信号（Place Signal）。環境内の特定位置を表現する場所細胞の活動。現在の自己位置の確率分布を神経集団活動としてコード。 |
| **A1. Requirement** | CA3からの記憶ベースの空間情報と、嗅内皮質からの現在の感覚ベースの空間情報を統合し、環境内での現在の自己位置を場所細胞の集団活動として表現する。位置の不確実性を含む確率分布として自己位置を推定する。 |
| **A2. Requirement realization by interface** | CA3から補完された空間パターン（記憶ベース）、MECから格子座標と境界情報（感覚ベース）、LECから文脈情報、ATNから頭方向信号を受け取る。MSのシータリズムがこれらの入力の時間的組織化を行い、統合的な場所表現を生成。 |
| **B1. Capability** | 複数情報源からの空間情報のベイズ的統合。各入力源の信頼性を重み付けして最適な位置推定を算出。 |
| **B2. Mechanism** | CA3経路（記憶ベース、事前分布）とEC直接経路（感覚ベース、尤度）の入力を、それぞれの信頼性に応じて重み付け統合。シータ振動の異なる位相でこれらの入力が分離して処理され、適応的な統合が可能。場所細胞の受容野が位置の確率分布の離散化表現となる。 |
| **B3. Implementation** | 

---

### UC4: `SUB`（海馬台）

| 項目 | 内容 |
| ---- | ---- |
| **Uniform Component** | `SUB` |
| **Comment** | 海馬台（Subiculum）。CA1からの出力を受け、下流脳領域への情報分配を担う。場所信号を多様な形式に変換して出力。 |
| **Interface** | `CA1` |
| **Output Semantics** | 分配可能な空間情報。場所、速度、方向、経路情報を下流領域の要求に応じた形式で出力。空間ナビゲーションの行動出力へのインターフェース。 |
| **A1. Requirement** | CA1からの場所細胞活動（自己位置推定結果）を受け取り、下流の各脳領域が必要とする形式（場所、経路、速度、報酬位置など）に変換・分配する。これにより自己位置情報がナビゲーション行動や意思決定に利用可能となる。 |
| **A2. Requirement realization by interface** | CA1から場所細胞の集団活動を受け取る。この単一入力から、SUB内の異なるサブ集団が下流ターゲット固有の表現を生成し、選択的に投射する。 |
| **B1. Capability** | 入力の次元変換と選択的ルーティング。単一の位置表現から複数の機能的に異なる出力形式を生成。 |
| **B2. Mechanism** | SUB内の錐体細胞が異なる下流ターゲットに選択的に投射。各投射集団が入力を異なる座標系や表現形式に変換。境界ベクトル細胞、経路細胞など、ターゲット依存の多様な空間表現が並列に生成される。 |
| **B3. Implementation** | ```python
def SUB_function(ca1_input, target):
    # CA1からの場所表現の受信
    place_representation = np.dot(W_ca1_sub, ca1_input)
    
    # ターゲット固有の変換
    if target == 'mammillary_body':
        # 場所・方向情報（Papez回路用）
        output = transform_to_place_direction(place_representation)
    elif target == 'anterior_thalamus':
        # 頭方向更新信号
        output = transform_to_hd_update(place_representation)
    elif target == 'cingulate_cortex':
        # 経路・道順情報（ナビゲーション計画用）
        output = transform_to_route(place_representation)
    elif target == 'nucleus_accumbens':
        # 報酬位置情報（動機づけ用）
        output = transform_to_reward_location(place_representation)
    
    return output

def transform_to_place_direction(place_rep):
    return np.dot(W_sub_mb, place_rep)

def transform_to_route(place_rep):
    # 現在位置から目標位置への経路ベクトル
    goal_rep = get_current_goal()
    route_vector = compute_route(place_rep, goal_rep)
    return route_vector
``` |

---

## ROI外 入力源（参照用）

| 入力源 | Comment | Output Semantics（ROI入力として） |
| ------ | -------- | -------- |
| `MEC` | 内側嗅内皮質（Medial Entorhinal Cortex）。格子細胞、頭方向細胞、境界細胞、速度細胞が存在。 | 空間座標情報：格子座標（周期的空間表現）、頭方向、環境境界との距離、移動速度 |
| `LEC` | 外側嗅内皮質（Lateral Entorhinal Cortex）。物体情報、感覚的特徴、文脈情報を提供。 | 非空間的文脈情報：物体のアイデンティティ、感覚的特徴、エピソード的文脈 |
| `ATN` | 前部視床核（Anterior Thalamic Nuclei）。頭方向信号のフィードバックを提供。 | 頭方向信号：自己中心的な方向情報、Papez回路からのフィードバック |
| `MS` | 内側中隔（Medial Septum）。シータリズムの調節信号を提供。 | シータ振動調節信号：海馬シータリズム（6-10Hz）の時間的組織化、空間情報の時間的コーディング |

---

## ROI外 出力先（参照用）

| 出力先 | Comment | 受け取る情報 |
| ------ | -------- | -------- |
| `MB` | 乳頭体（Mammillary Body）。Papez回路の一部として空間情報を伝達。 | 場所情報、方向情報 |
| `ATN_out` | 前部視床核（出力先として）。空間情報のフィードフォワード。 | 頭方向更新信号、場所情報 |
| `ACC` | 帯状皮質（Anterior Cingulate Cortex）。経路計画・意思決定への空間情報提供。 | 経路情報、道順、目標位置 |
| `NAc` | 側坐核（Nucleus Accumbens）。報酬関連の空間情報。 | 報酬位置情報、目標地点 |

---

## 情報処理フローの概要

```
[ROI外入力]
MEC (格子・頭方向・境界・速度) ─┬─→ DG ─────→ CA3 ──→ CA1 ──→ SUB ─→ [ROI外出力]
LEC (文脈・物体) ────────────────┤     │         │        ↑          MB, ATN, ACC, NAc
MS (シータリズム) ─────────────────────┴─────────┴────────┤
ATN (頭方向フィードバック) ──────────────────────────────→─┘
                                   └→ CA3 (再帰) ─┘
```
