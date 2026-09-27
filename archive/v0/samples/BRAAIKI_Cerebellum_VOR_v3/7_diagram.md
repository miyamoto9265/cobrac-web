# 7_diagram.md - HCD構造図（Mermaid形式）

## TLF: VOR (Vestibulo-Ocular Reflex)
## ROI: 小脳片葉複合体 (Floccular Complex)

---

## HCD Diagram

```mermaid
flowchart TD
    subgraph Legend[凡例]
        L1[ROI内UC]
        L2[ROI外 Input]
        L3[ROI外 Output]
    end

    subgraph noROI_Input[noROI: Input]
        VN[VN: 前庭核]
        IO[IO: 下オリーブ核]
    end

    subgraph ROI[ROI: 小脳片葉複合体]
        GrC[GrC: 顆粒細胞]
        PC[PC: プルキンエ細胞]
        GoC[GoC: ゴルジ細胞]
        BC[BC: 籠細胞]
        SC[SC: 星状細胞]
    end

    subgraph noROI_Output[noROI: Output]
        OMN[OMN: 眼球運動核]
    end

    VN -->|頭部速度信号| GrC
    VN -->|頭部速度信号| OMN
    IO -->|視覚誤差信号| PC
    GrC -->|分散された頭部速度表現| PC
    GrC -->|顆粒細胞活動| GoC
    GrC -->|顆粒細胞活動| BC
    GrC -->|顆粒細胞活動| SC
    GoC -->|ゲイン制御抑制信号| GrC
    BC -->|低周波抑制信号| PC
    SC -->|高周波抑制信号| PC
    PC -->|VORゲイン調節信号| VN

    style L1 fill:#90EE90,stroke:#006400,color:#000000
    style L2 fill:#87CEEB,stroke:#00008B,color:#000000
    style L3 fill:#FFB6C1,stroke:#8B0000,color:#000000

    style VN fill:#87CEEB,stroke:#00008B,color:#000000
    style IO fill:#87CEEB,stroke:#00008B,color:#000000
    style GrC fill:#90EE90,stroke:#006400,color:#000000
    style PC fill:#90EE90,stroke:#006400,color:#000000
    style GoC fill:#90EE90,stroke:#006400,color:#000000
    style BC fill:#90EE90,stroke:#006400,color:#000000
    style SC fill:#90EE90,stroke:#006400,color:#000000
    style OMN fill:#FFB6C1,stroke:#8B0000,color:#000000
```

---

## 色の凡例

| 色 | 意味 |
|----|------|
| 緑 (#90EE90) | ROI内 Uniform Component |
| 青 (#87CEEB) | ROI外 Input（入力ノード） |
| ピンク (#FFB6C1) | ROI外 Output（出力ノード） |

---

## 接続一覧（Output Semantics付き）

| Sender | Receiver | Output Semantics |
|--------|----------|------------------|
| `VN` | `GrC` | 頭部速度信号および眼球運動関連信号 |
| `VN` | `OMN` | 頭部速度信号および小脳によって調節された眼球運動指令 |
| `IO` | `PC` | 視覚誤差信号を表す教師信号 |
| `GrC` | `PC` | 頭部速度信号を空間的に分散させた並列表現 |
| `GrC` | `GoC` | 顆粒細胞の活動状態 |
| `GrC` | `BC` | 顆粒細胞の活動状態 |
| `GrC` | `SC` | 顆粒細胞の活動状態 |
| `GoC` | `GrC` | 顆粒細胞活動の時間的および空間的ゲイン制御信号 |
| `BC` | `PC` | プルキンエ細胞への低周波選択的抑制信号 |
| `SC` | `PC` | プルキンエ細胞への高周波選択的抑制信号 |
| `PC` | `VN` | VORゲイン調節信号 |

---

## 簡略版ダイアグラム（draw.io変換用）

```mermaid
flowchart LR
    subgraph Input[noROI Input]
        VN((VN))
        IO((IO))
    end

    subgraph Cerebellum[ROI Flocculus]
        GrC((GrC))
        GoC((GoC))
        BC((BC))
        SC((SC))
        PC((PC))
    end

    subgraph Output[noROI Output]
        OMN((OMN))
    end

    VN --> GrC
    VN --> OMN
    IO --> PC
    GrC --> PC
    GrC --> GoC
    GrC --> BC
    GrC --> SC
    GoC --> GrC
    BC --> PC
    SC --> PC
    PC --> VN

    style VN fill:#87CEEB
    style IO fill:#87CEEB
    style GrC fill:#90EE90
    style GoC fill:#90EE90
    style BC fill:#90EE90
    style SC fill:#90EE90
    style PC fill:#90EE90
    style OMN fill:#FFB6C1
```

---

## 情報フロー概要図

```mermaid
flowchart TD
    subgraph Sensory[感覚入力]
        SC_canal[半規管]
        Retina[網膜]
    end

    subgraph Brainstem1[脳幹 入力側]
        VN_in[VN 前庭核]
        IO_in[IO 下オリーブ核]
    end

    subgraph Cerebellum[小脳片葉 ROI]
        direction TB
        GrC_c[GrC]
        GoC_c[GoC]
        BC_c[BC]
        SC_c[SC]
        PC_c[PC]
        
        GrC_c --> PC_c
        GrC_c <--> GoC_c
        GrC_c --> BC_c
        GrC_c --> SC_c
        BC_c --> PC_c
        SC_c --> PC_c
    end

    subgraph Brainstem2[脳幹 出力側]
        VN_out[VN 前庭核]
        OMN_out[OMN 眼球運動核]
    end

    subgraph Motor[運動出力]
        EOM[外眼筋]
    end

    SC_canal --> VN_in
    Retina --> IO_in
    VN_in --> GrC_c
    IO_in --> PC_c
    PC_c --> VN_out
    VN_out --> OMN_out
    OMN_out --> EOM

    style GrC_c fill:#90EE90
    style GoC_c fill:#90EE90
    style BC_c fill:#90EE90
    style SC_c fill:#90EE90
    style PC_c fill:#90EE90
    style VN_in fill:#87CEEB
    style IO_in fill:#87CEEB
    style VN_out fill:#FFB6C1
    style OMN_out fill:#FFB6C1
```
