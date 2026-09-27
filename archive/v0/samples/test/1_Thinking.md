# ステップ1: ROIとTLFの妥当性検証

## 指定されたROIとTLF

- **ROI（対象領域）**: ショウジョウバエの視葉（Drosophila optic lobe）
- **TLF（トップレベル機能）**: 視葉の機能全体（視覚情報処理全般）

## ROIの構造的概要

### 視葉の基本構造
ショウジョウバエの視葉は、約70,000個のニューロン（片側あたり）から構成される高度に組織化された視覚処理中枢である（Janelia Research Campus, 2025）。視葉は以下の4つの主要なコンパートメントから構成される：

1. **ラミナ（Lamina）**: 第一視覚神経節。光受容体R1-R6から入力を受け、ON/OFF経路の分離が開始される
2. **メデュラ（Medulla）**: 第二視覚神経節。最も複雑な層で、10層の解剖学的層（M1-M10）を持ち、運動検出回路の主要な計算が行われる
3. **ロブラ（Lobula）**: 第三視覚神経節。形態視覚と物体検出を担当し、中心複合体への投射ニューロンの起点となる
4. **ロブラプレート（Lobula Plate）**: 第四視覚神経節。運動視覚に特化し、広視野運動に応答する接線細胞（LPTC）が存在する

### 組織学的特徴
- **円柱構造（Columnar organization）**: 約750個の個眼からの入力が、視葉内で位相対応した円柱状回路を形成
- **層状構造（Layered organization）**: 各神経節内で並列な層が形成され、異なる視覚特徴が処理される
- **網膜位相配置（Retinotopy）**: 視野の空間配置が視葉内で保存される

## TLFの妥当性検証：視葉の機能全体

### 視葉が実行する主要な計算機能

#### 1. コントラスト検出とON/OFF経路分離
- ラミナにおいてL1細胞（ON経路）とL2細胞（OFF経路）に信号が分離される（Joesch et al., 2010, Nature）
- これは脊椎動物のON/OFF双極細胞経路に相当する機能分離である

#### 2. 運動検出（Motion Detection）
- メデュラにおいて、T4細胞（ON運動）とT5細胞（OFF運動）が方向選択的な応答を示す
- 4つのサブタイプがそれぞれ4つの基本方向（前後、上下）に応答（Maisak et al., 2013）
- Hassenstein-Reichardt型およびBarlow-Levick型の基本運動検出器モデルに基づく計算が実装されている

#### 3. 広視野運動統合とオプティックフロー処理
- ロブラプレートの接線細胞（LPTC）が、T4/T5からの入力を統合して広視野運動パターンを抽出
- CH、H1、H2、VS細胞などが異なる運動パターンに選択的に応答
- 飛行制御のための運動視覚情報を下行ニューロン（例：DNOVS1）へ出力（Suver et al., 2016, J Neurosci）

#### 4. 形態視覚と物体検出
- ロブラの円柱ニューロン（LC細胞）が特定の視覚特徴（ルーミング、小物体運動等）を検出
- 約20種類のLC細胞タイプが存在し、それぞれ異なる視覚刺激に応答（Wu et al., 2016, eLife）
- 視覚グロメルリを介して中心複合体などの中枢脳領域へ投射

#### 5. 方位検出と輪郭統合
- Dm3とTmY細胞タイプが局所的な方位情報をコード
- 古典的受容野外からの入力により位置不変な方位選択性と輪郭補完が実現（Ramos-Traslosheros et al., 2024, Nature）

## ROIとTLFの整合性評価

### 妥当性：高い
視葉（ROI）は、視覚情報処理全般（TLF）を実行するための神経組織として極めて適切である。以下の理由による：

1. **構造的完結性**: 視葉は網膜からの入力を受け、運動制御や行動選択のための出力を生成する、機能的に完結した視覚処理システムである
2. **機能的多様性**: 運動検出、形態認識、方位検出など、視覚処理の主要な計算機能がすべて視葉内で実行される
3. **神経科学的証拠の充実**: 2025年までに完全なコネクトーム（732細胞タイプ、53,000ニューロン）が構築され、詳細な接続情報が利用可能（Dorkenwald et al., 2025, Nature）

### 制約事項
- 視葉は視覚処理の「初期〜中期」段階を担当しており、高次の意思決定や学習・記憶との統合は中心複合体や他の中枢脳領域で行われる
- したがって、視葉からの出力先（中心複合体、下行ニューロン等）との境界をROI外として適切に定義する必要がある

## ROI_InputとROI_Outputの特定

### ROI_Input（視葉への入力）
1. **光受容体（R1-R8）**: 網膜（複眼）からの視覚入力
   - R1-R6 → ラミナ（広帯域輝度情報）
   - R7-R8 → メデュラ（色情報、UV感受性）

### ROI_Output（視葉からの出力）

#### 1. ロブラプレートから下行ニューロンへ
- LPTCから下行ニューロン（例：DNOVS1）への出力
- 運動視覚情報を運動制御回路へ伝達
- **境界**: 下行ニューロンはROI外（中枢脳〜胸部神経節）

#### 2. ロブラから中心複合体へ
- LC細胞から視覚グロメルリを介した中枢脳への投射
- 形態視覚情報を行動選択・空間記憶回路へ伝達
- **境界**: 視覚グロメルリおよび中心複合体はROI外

#### 3. その他の出力経路
- メデュラから中枢脳への直接投射（一部のTm細胞等）
- ロブラプレートから中枢脳への投射（一部のLPTC）

## 次ステップへの方針

### UC定義の方針
1. **層別の機能単位**: ラミナ、メデュラ、ロブラ、ロブラプレートの各層内で機能的に同質な神経集団をUCとして定義
2. **細胞タイプに基づく定義**: L1、L2、Mi1、Tm3、T4、T5、LC、LPTCなど、神経科学的に確立された細胞タイプを基準にUCを構築
3. **メゾスコピックレベルの粒度**: 単一細胞ではなく、機能的に同等な細胞集団を1つのUCとする
4. **ROI境界の明確化**: 
   - ROI内: ラミナ、メデュラ、ロブラ、ロブラプレート内のすべての細胞
   - ROI外（入力）: 光受容体R1-R8
   - ROI外（出力）: 下行ニューロン、中心複合体への投射先、視覚グロメルリ下流のニューロン

### 文献調査の重点領域
次のステップ（BIF構築）では、以下の接続を重点的に調査する：
1. 光受容体 → ラミナ（L1, L2, L3等）
2. ラミナ → メデュラ（Mi, Tm, TmY等の細胞タイプ）
3. メデュラ内接続（Mi-Tm-T4/T5回路等）
4. メデュラ → ロブラ/ロブラプレート（T4/T5 → LPTC等）
5. ロブラ → 中心複合体（LC → 視覚グロメルリ）
6. ロブラプレート → 下行ニューロン（LPTC → DNOVS1等）

## 主要参考文献
1. Dorkenwald et al. (2025). Connectome-driven neural inventory of a complete visual system. Nature.
2. Takemura et al. (2013). A visual motion detection circuit suggested by Drosophila connectomics. Nature.
3. Joesch et al. (2010). ON and OFF pathways in Drosophila motion vision. Nature.
4. Wu et al. (2016). Visual projection neurons in the Drosophila lobula link feature detection to distinct behavioral programs. eLife.
5. Suver et al. (2016). Integration of Lobula Plate Output Signals by DNOVS1. J Neurosci.
6. Ramos-Traslosheros et al. (2024). Predicting visual function by interpreting a neuronal wiring diagram. Nature.
7. Shinomiya et al. (2019). Strategies for assembling columns and layers in the Drosophila visual system. Neural Development.
