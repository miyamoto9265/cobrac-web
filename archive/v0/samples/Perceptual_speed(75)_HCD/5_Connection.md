# ステップ4-1: Connectionの定義

## UC間の接続

以下の表は、BIFで特定した神経接続を、定義したUC間の接続としてマッピングしたものです。

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
|---------------------------|----------------------------|---------|-----------|
| `V1` | `pIPS` | 初期視覚特徴（方位、空間周波数、位置）の直接投射。網膜位置対応的マッピング。 | Swisher et al., 2007, https://pubmed.ncbi.nlm.nih.gov/17507555/ |
| `V2` | `pIPS` | より複雑な視覚特徴（輪郭、テクスチャ）の投射。V1を経由した処理結果を伝達。 | Swisher et al., 2007 |
| `V3` | `pIPS` | 大域的運動と動的形態の情報投射。背側視覚経路の初期段階。 | Konen & Kastner, 2008, https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| `V4` | `pIPS` | 色と形態の統合情報。探索対象（文字、数字、パターン）の特徴表現。 | Pasupathy et al., 2020 |
| `MT` | `pIPS` | 視覚運動情報（方向、速度）の投射。動的刺激の探索に重要。 | Amano et al., 2009, https://www.jneurosci.org/content/30/29/9801 |
| `IT` | `pIPS` | 物体・形態の高次表現。文字や数字などの複雑なパターン情報。 | Takemura et al., 2020, https://www.nature.com/articles/s41598-020-72471-z |
| `Pulvinar` | `pIPS` | 皮質下経路からの視覚情報。上丘を経由した高速視覚処理経路。 | Lyon et al., 2010, https://ncbi.nlm.nih.gov/pmc/articles/PMC6623455/ |
| `FEF` | `pIPS` | トップダウン注意制御信号。探索すべき空間位置や特徴の指定。 | Stanton et al., 1995, https://onlinelibrary.wiley.com/doi/10.1002/cne.902650304 |
| `FEF` | `mIPS` | 注意配分の制御信号。探索戦略の調整。 | Stanton et al., 1995 |
| `FEF` | `aIPS` | 探索終了と応答開始の制御信号。 | Stanton et al., 1995 |
| `DLPFC` | `pIPS` | 探索目標テンプレートとタスクルール。何を探すかの情報。 | Riley & Constantinidis, 2015, https://ncbi.nlm.nih.gov/pmc/articles/PMC4128703/ |
| `DLPFC` | `mIPS` | ワーキングメモリ内容と実行制御。探索中の情報維持。 | Riley & Constantinidis, 2015 |
| `DLPFC` | `aIPS` | 意思決定基準と応答ルール。検出判断の閾値制御。 | Riley & Constantinidis, 2015 |
| `pIPS` | `mIPS` | 視覚特徴マップの伝達。初期処理結果を統合段階へ。 | Orban & Caruana, 2014, https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/ |
| `mIPS` | `aIPS` | 注意によって選択された情報と候補ターゲットの情報。 | Orban & Caruana, 2014 |
| `aIPS` | `pIPS` | 予測信号とフィードバック。探索の進行状況に基づく調整。 | Lewis & Van Essen, 2000（一般原則） |
| `aIPS` | `mIPS` | 検出結果に基づく注意再配分のフィードバック。 | Lewis & Van Essen, 2000（一般原則） |
| `pIPS` | `V1` | トップダウン注意変調。関連する視覚特徴の感度を上げる。 | Konen & Kastner, 2008 |
| `pIPS` | `V2` | 注意による処理の変調。輪郭や形態処理の強調。 | Konen & Kastner, 2008 |
| `pIPS` | `V3` | 運動情報への注意変調。 | Konen & Kastner, 2008 |
| `pIPS` | `V4` | 色・形態処理への注意変調。探索関連特徴の強調。 | Konen & Kastner, 2008 |
| `pIPS` | `MT` | 運動知覚への注意による感度調整。 | Konen & Kastner, 2008 |
| `pIPS` | `FEF` | 初期視覚マップと注意の必要性の情報。次の注意シフト先の候補。 | Stanton et al., 1995 |
| `mIPS` | `FEF` | 注意優先マップ。次に探索すべき位置の優先順位。 | Stanton et al., 1995 |
| `aIPS` | `FEF` | ターゲット検出信号と確信度。サッカード目標の確定。 | Stanton et al., 1995 |
| `aIPS` | `DLPFC` | 探索結果と検出判断。意思決定のための感覚証拠。 | Riley & Constantinidis, 2015 |
| `aIPS` | `SC` | サッカード目標と注意シフト指令。眼球運動の実行指示。 | Lyon et al., 2010 |
| `aIPS` | `PMC` | 視覚誘導行動の運動準備信号。手指応答などの準備。 | Selemon & Goldman-Rakic, 1988, https://ncbi.nlm.nih.gov/pmc/articles/PMC6569486/ |

## Connectionの特性

### 1. 順投射（Feedforward）接続
視覚野からIPSへ、IPS内の後部→中部→前部への接続は、情報処理階層における順投射を表現します。
- `V1`, `V2`, `V3`, `V4`, `MT`, `IT` → `pIPS`
- `pIPS` → `mIPS` → `aIPS`

### 2. 逆投射（Feedback）接続
IPSから視覚野への接続、IPS内の前部→後部への接続は、予測とトップダウン変調を表現します。
- `pIPS` → `V1`, `V2`, `V3`, `V4`, `MT`
- `aIPS` → `mIPS` → `pIPS`

### 3. 相互接続（Reciprocal）
前頭皮質とIPSの間は相互接続により、双方向の情報交換を実現します。
- `FEF` ⇄ `pIPS`, `mIPS`, `aIPS`
- `DLPFC` ⇄ `pIPS`, `mIPS`, `aIPS`

### 4. 出力接続
IPSから運動関連領域への接続は、知覚から行動への変換を表現します。
- `aIPS` → `SC`, `PMC`

## 知覚速度を実現する情報フロー

1. **視覚入力段階**: 複数の視覚野（`V1`, `V2`, `V3`, `V4`, `MT`, `IT`）が並行して視覚特徴を処理し、`pIPS`に送信

2. **特徴統合と初期比較**: `pIPS`が視覚特徴マップを作成し、`FEF`と`DLPFC`からの目標情報と比較開始

3. **注意による選択**: `mIPS`が`pIPS`からの情報を受け取り、`FEF`と`DLPFC`の制御下で注意を配分し、ターゲット候補を選択

4. **検出判断**: `aIPS`がターゲット検出の確信度を計算し、`FEF`と`DLPFC`に報告

5. **応答実行**: `aIPS`から`SC`（眼球運動）や`PMC`（手指応答）へ運動指令を送信

6. **トップダウン変調**: IPS各部から視覚野へのフィードバックにより、関連特徴の処理を継続的に強調

この接続パターンにより、視覚刺激の「速やかな探索と比較」という知覚速度の機能が実現されます。
