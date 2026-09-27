# VOR Learning HCD Diagram

## Mermaid Graph Definition

```mermaid
flowchart TD
    %% Style definitions
    classDef inputNode fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef roiNode fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef outputNode fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    
    %% Input nodes (noROI input)
    VN-input[VN-input: Vestibular nuclei input<br/>Head velocity & acceleration]:::inputNode
    PN[PN: Pontine nuclei<br/>Visual motion optic flow]:::inputNode
    NOT-AOS[NOT-AOS: Nucleus of optic tract<br/>Retinal slip error detection]:::inputNode
    IO[IO: Inferior olivary nucleus<br/>Error teaching signals]:::inputNode
    
    %% ROI internal nodes
    GrC[GrC: Granule cells<br/>Multisensory integration & expansion]:::roiNode
    GoC[GoC: Golgi cells<br/>Inhibitory gain control]:::roiNode
    PF[PF: Parallel fibers<br/>Spatial distribution of information]:::roiNode
    BC[BC: Basket cells<br/>Lateral inhibition to axon]:::roiNode
    SC[SC: Stellate cells<br/>Lateral inhibition to dendrite]:::roiNode
    PC[PC: Purkinje cells<br/>Learning via LTD/LTP]:::roiNode
    
    %% Output nodes (noROI output)
    VN-output[VN-output: Vestibular nuclei output<br/>Adjusted VOR commands]:::outputNode
    ABN[ABN: Abducens nucleus<br/>Horizontal VOR]:::outputNode
    OMN[OMN: Oculomotor nucleus<br/>Vertical VOR]:::outputNode
    TN[TN: Trochlear nucleus<br/>Vertical VOR]:::outputNode
    
    %% Connections
    VN-input -->|Vestibular sensory info| GrC
    VN-input -->|Feedforward| GoC
    PN -->|Visual motion info| GrC
    PN -->|Feedforward| GoC
    NOT-AOS -->|Retinal slip| IO
    IO -->|Error teaching signal| PC
    
    GrC -->|Excitatory| PF
    GoC -->|GABAergic inhibition| GrC
    
    PF -->|Excitatory massive inputs| PC
    PF -->|Excitatory| BC
    PF -->|Excitatory| SC
    PF -->|Feedback| GoC
    
    BC -->|GABAergic inhibition| PC
    SC -->|GABAergic inhibition| PC
    
    PC -->|GABAergic inhibition| VN-output
    
    VN-output -->|Motor command| ABN
    VN-output -->|Motor command| OMN
    VN-output -->|Motor command| TN
    
    %% Legend
    subgraph Legend
        L1[Input: noROI input]:::inputNode
        L2[Processing: ROI internal]:::roiNode
        L3[Output: noROI output]:::outputNode
    end
```

## 説明

このMermaid図は、VOR学習における小脳のHCDを視覚化したものです。

### ノードの色分け

- **青色（Input）**: ROI外の入力源（前庭神経核、橋核、視索核・副視覚系、下オリーブ核）
- **オレンジ色（ROI internal）**: 小脳皮質内の処理ユニット（顆粒細胞、ゴルジ細胞、平行線維、バスケット細胞、ステラート細胞、プルキンエ細胞）
- **紫色（Output）**: ROI外の出力先（前庭神経核、外眼筋運動核）

### 主要な情報処理フロー

1. **感覚入力**: VN-inputとPNから前庭感覚と視覚運動情報がGrCへ
2. **拡張と統合**: GrCで多感覚統合、PFで空間的拡散
3. **学習**: IOからの誤差信号に基づいてPCでLTD/LTPが誘導
4. **抑制制御**: GoCによる顆粒細胞のゲイン制御、BC/SCによるプルキンエ細胞の側方抑制
5. **運動出力**: PCからVN-outputへの抑制性投射により、VORゲインが調整される

### 接続の種類

- 実線矢印: 神経接続（興奮性または抑制性）
- 矢印のラベル: 接続の機能的意味

この図は、draw.ioやMermaid対応エディタで可視化できます。
