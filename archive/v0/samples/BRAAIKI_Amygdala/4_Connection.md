# Connection 定義

## UC間の接続

以下の表は、定義されたUniform Component間の接続を示します。各接続は、BIFで特定された神経接続に基づいています。

| Sender(UC) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `LA` | `BLA` | 条件刺激と無条件刺激の連合情報の伝達。興奮性投射。 | Pitkanen et al., 1997, https://doi.org/10.1016/S0149-7634(96)00026-0 |
| `BLA` | `ITC` | 介在細胞群の活性化のための興奮性入力。消去学習時に重要。 | Pare et al., 2004, https://doi.org/10.1152/physrev.00021.2003 |
| `BLA` | `CeA` | 恐怖情報の直接的伝達。興奮性投射。恐怖反応の発現に寄与。 | Pitkanen et al., 1997, https://doi.org/10.1016/S0149-7634(96)00026-0 |
| `BLA` | `vmPFC` | 恐怖関連情報を前頭前野へ送信。消去学習のフィードバックに寄与。 | Sotres-Bayon & Quirk, 2010, https://doi.org/10.1146/annurev-neuro-060909-153238 |
| `BLA` | `dmPFC` | 恐怖関連情報を前頭前野へ送信。恐怖記憶の想起に関与。 | Vertes, 2004, https://doi.org/10.1016/j.neuroscience.2004.04.044 |
| `ITC` | `CeA` | GABA作動性抑制投射。恐怖反応の抑制、消去学習時に活性。 | Likhtik et al., 2008, https://doi.org/10.1038/nn.2101 |
| `vmPFC` | `ITC` | 消去学習時の介在細胞群の活性化。興奮性投射。 | Quirk et al., 2003, https://doi.org/10.1126/science.1086071 |
| `vmPFC` | `BLA` | 消去記憶の維持と恐怖反応の抑制。興奮性・抑制性の混合投射。 | Milad & Quirk, 2012, https://doi.org/10.1146/annurev-psych-120710-100139 |
| `dmPFC` | `BLA` | 恐怖記憶の想起促進。興奮性投射。条件刺激提示時に活性。 | Corcoran & Quirk, 2007, https://doi.org/10.1038/nn1970 |

## ROI外からの主要な入力（ROI_Input）

以下は、ROI外の神経組織からUCへの入力を示します。これらはHCDの入力情報を構成します。

| Sender (ROI外) | Receiver(UC) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 聴覚視床(MGv/PIN) | `LA` | 条件刺激（聴覚情報）の迅速な伝達経路 | LeDoux et al., 1990, https://doi.org/10.1523/JNEUROSCI.10-08-02818.1990 |
| 聴覚皮質(A1/Te1) | `LA` | 条件刺激の詳細な感覚情報の伝達 | Romanski & LeDoux, 1993, https://doi.org/10.1523/JNEUROSCI.13-03-01105.1993 |
| 体性感覚視床(VPL/VPM) | `LA` | 無条件刺激（痛み刺激）の伝達 | Shi & Davis, 1999, https://doi.org/10.1523/JNEUROSCI.19-24-10512.1999 |
| 腹側海馬(vHPC) | `BLA` | 文脈的情報の伝達、空間記憶情報 | Maren & Fanselow, 1995, https://doi.org/10.1016/0149-7634(94)00057-O |
| 青斑核(LC) | `BLA` | ノルアドレナリン作動性調節、恐怖記憶の固定化 | Johansen et al., 2011, https://doi.org/10.1038/nn.2954 |
| 青斑核(LC) | `vmPFC` | ノルアドレナリン作動性調節、消去学習の促進 | Mueller et al., 2008, https://doi.org/10.1037/0735-7044.122.2.403 |
| 腹側被蓋野(VTA) | `BLA` | ドーパミン作動性調節、報酬予測誤差 | Fadok et al., 2009, https://doi.org/10.1016/j.neuron.2009.11.025 |

## ROI外への主要な出力（ROI_Output）

以下は、UCからROI外の神経組織への出力を示します。これらはHCDの出力情報を構成します。

| Sender(UC) | Receiver (ROI外) | Comment | Reference |
| ------ | -------- | ------- | --------- |
| `CeA` | 中脳水道周囲灰白質(PAG) | 防御行動（凍結反応）の出力 | LeDoux et al., 1988, https://doi.org/10.1523/JNEUROSCI.08-07-02517.1988 |
| `CeA` | 視床下部(HYP) | 自律神経系反応（心拍数増加、発汗）の出力 | Davis, 1992, https://doi.org/10.1146/annurev.ne.15.030192.002041 |
| `CeA` | 分界条床核(BNST) | 持続的な不安状態の生成 | Walker et al., 2003, https://doi.org/10.1016/S0031-9384(03)00019-8 |

## 接続の特性まとめ

### 恐怖獲得経路
1. ROI外（感覚系）→ `LA` → `BLA` → `CeA` → ROI外（運動出力系）
2. この経路が条件刺激と無条件刺激の連合、恐怖反応の発現を担当

### 恐怖消去経路
1. `BLA` → `vmPFC` → `ITC` → `CeA`（抑制）
2. この経路が消去学習における恐怖反応の抑制を担当

### 恐怖発現促進経路
1. `dmPFC` → `BLA` → `CeA`
2. この経路が恐怖記憶の想起と発現を促進

### 前頭前野間の拮抗作用
- `vmPFC`と`dmPFC`は`BLA`を介して拮抗的に作用
- 消去学習では`vmPFC`が優位、恐怖想起では`dmPFC`が優位



