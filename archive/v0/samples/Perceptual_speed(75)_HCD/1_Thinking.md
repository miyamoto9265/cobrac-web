# ステップ1: ROIとTLFの妥当性検証

## TLFの定義
**TLF**: Perceptual speed（知覚速度）
**定義**: An intermediate-stratum ability that can be defined as the speed and fluency with which similarities or differences in visual stimuli (e.g., letters, numbers, patterns, etc.) can be searched and compared in an extended visual field.

広範な視野内で視覚刺激（文字、数字、パターンなど）の類似点や相違点を素早く流暢に探索・比較する中間層の認知能力。

## ROIの選定過程

### 候補となる脳領域
文献調査により、知覚速度（視覚探索と比較の速度）に関与する主要な脳領域として以下が同定されました：

1. **頭頂間溝（Intraparietal Sulcus; IPS）**
   - 視覚探索の効率性において中心的役割を果たす
   - ターゲット物体の存在をモニタリングし、検出の確信度を追跡
   - 特徴非依存的に動作し、行動関連情報に応答
   - 視覚空間注意をコードする
   - 後部、中部、前部でそれぞれ異なる機能を持つ
   - 損傷研究により空間注意制御における重要性が確認されている
   - 参考文献: UCSB Study (2012), Wilke et al. (2012), Ptak & Schnider (2011)

2. **前頭眼野（Frontal Eye Field; FEF）**
   - 視覚探索中のターゲット処理に関与
   - 注意の展開を制御
   - 価値比較過程に因果的役割を持つ
   - 遅延期間活動により情報を時間的に維持
   - 空間選択と行動関連位置への視覚注意の方向付けに関与
   - 参考文献: Donohue et al. (2021), Griffis et al. (2021)

3. **後部頭頂皮質（Posterior Parietal Cortex; PPC）**
   - 急速な視覚弁別と知覚速度に決定的役割
   - 多様な知覚情報を統合し視覚判断を導く
   - 背側視覚経路と背側前頭頭頂注意ネットワークの一部
   - 一次視覚野の活動を調節し、処理速度を向上させる
   - rTMS研究により反応時間の短縮効果が実証されている
   - 350ms付近でターゲット刺激を分離・増幅
   - 参考文献: Waterston et al. (2020), Liu et al. (2017)

4. **上頭頂小葉（Superior Parietal Lobule; SPL）**
   - 目標指向的視覚探索で強い活性化
   - トップダウン探索とボトムアップポップアウト課題を区別
   - 参考文献: Zheng et al. (2025)

5. **腹外側前頭前皮質（Ventrolateral Prefrontal Cortex; vlPFC）**
   - 価値ある物体の効率的視覚探索に重要
   - 周辺ターゲットに対する反応増幅と受容野拡大
   - 参考文献: Tang et al. (2025)

6. **後頭側頭ネットワーク（Occipitotemporal Network）**
   - 高速読字における情報処理
   - 下後頭回から腹側後頭側頭皮質、後上側頭溝、前上側頭溝への情報伝達
   - 参考文献: Yang et al. (2024)

### ROIの決定：頭頂間溝（IPS）

**選定理由**:
1. **機能的中心性**: IPSは視覚探索の効率性において最も中心的な役割を果たす。ターゲット検出、確信度追跡、注意制御を統合的に実行する。

2. **特徴非依存性**: TLFが「文字、数字、パターンなど」多様な視覚刺激を対象とすることから、特徴非依存的に動作するIPSが最適である。

3. **速度制御**: PPCの一部として、IPSは視覚処理の速度調節に直接関与する。早期視覚野への入力ゲイン調節により、処理速度を向上させる。

4. **注意制御**: IPSは背側前頭頭頂注意ネットワークの中核であり、空間注意と特徴ベースの注意の両方を処理する。

5. **行動関連性**: IPSは視覚特徴そのものではなく、その瞬間に行動関連する情報に応答する。これは「探索と比較」という課題指向的な処理に適している。

6. **神経科学的証拠の豊富さ**: fMRI研究、損傷研究、電気生理学的研究により、IPSの視覚探索における役割が一貫して実証されている。

**ROI定義**: Intraparietal Sulcus（IPS、頭頂間溝）
- 解剖学的範囲: 後部IPS（pIPS）、中部IPS（mIPS）、前部IPS（aIPS）を含む
- Brodmann area 7、40の一部を含む

## ROIの入出力情報の整理

### ROI_Input（IPSに入力される必要がある情報）

1. **初期視覚特徴情報**
   - 送信元: 後頭皮質（V1, V2, V3, V4）
   - 内容: 視覚刺激の基本的特徴（方位、色、空間周波数、位置）
   - 根拠: IPSは背側視覚経路の一部として後頭皮質から投射を受ける

2. **物体/形態情報**
   - 送信元: 腹側視覚経路（下側頭皮質、IT cortex）
   - 内容: 物体の形態、同一性、カテゴリ情報
   - 根拠: IPSは物体表現と空間表現を統合する

3. **注意制御信号**
   - 送信元: 前頭眼野（FEF）、背外側前頭前皮質（DLPFC）
   - 内容: トップダウン注意制御、探索目標の仕様
   - 根拠: FEFとIPSは背側注意ネットワークの主要ノードとして相互作用

4. **タスク/目標情報**
   - 送信元: 前頭前皮質（PFC）
   - 内容: 探索目標、タスクルール、意思決定基準
   - 根拠: IPSは課題関連情報を受け取り、行動関連処理を実行

5. **視覚作業記憶情報**
   - 送信元: 背外側前頭前皮質（DLPFC）、下頭頂小葉
   - 内容: 維持された視覚情報、探索テンプレート
   - 根拠: IPSは視覚作業記憶の維持と操作に関与

### ROI_Output（IPSから出力されることが期待される情報）

1. **注意優先マップ**
   - 投射先: 前頭眼野（FEF）、上丘（Superior Colliculus）
   - 内容: 空間的注意の優先順位、次に探索すべき位置
   - 根拠: IPSは空間注意の展開を制御し、眼球運動システムに情報を送る

2. **ターゲット検出信号**
   - 投射先: 前頭前皮質、運動前野
   - 内容: ターゲットの検出/不在、検出の確信度
   - 根拠: IPSはターゲット検出をモニタリングし、意思決定領域に情報を送る

3. **比較結果**
   - 投射先: 前頭前皮質、下頭頂小葉
   - 内容: 視覚刺激間の類似性/相違性の判定結果
   - 根拠: IPSは視覚情報の比較処理を実行する

4. **空間情報の更新**
   - 投射先: 海馬、内側側頭葉
   - 内容: 探索済み位置、空間的配置の表現
   - 根拠: IPSは空間ワーキングメモリと長期記憶システムと相互作用

5. **視覚野への注意変調信号**
   - 投射先: 後頭皮質（V1-V4）、腹側視覚経路
   - 内容: トップダウン注意による感度変調
   - 根拠: IPSは早期視覚野への逆投射により入力ゲインを調節

6. **運動準備信号**
   - 投射先: 前頭眼野（FEF）、補足眼野（SEF）、運動前野
   - 内容: 注意シフト、眼球運動、手の動きの準備
   - 根拠: IPSは知覚と行動の橋渡しをする

## TLFとROIの整合性評価

### 適合性の評価
IPSは知覚速度（Perceptual speed）のTLFを実現するのに**極めて適切**な脳領域である。

**理由**:
1. **速度の制御**: IPSは処理速度に直接影響を与え、視覚探索の効率性を決定する
2. **探索機能**: 視野内でのターゲット検出を担当し、探索過程全体を制御する
3. **比較機能**: 複数の視覚刺激を同時に処理し、類似性/相違性を判定する
4. **空間的広がり**: 広範な視野にわたる情報を統合し、空間注意を配分する
5. **特徴柔軟性**: 文字、数字、パターンなど、多様な視覚刺激に対応できる特徴非依存性を持つ
6. **認知的中間層**: 単純な特徴検出と高次意思決定の中間で機能し、TLFの「中間層能力」という性質に一致する

### 神経科学的根拠の強さ
- **強力**: 複数の独立した研究手法（fMRI、損傷研究、TMS、電気生理学）により一貫した証拠がある
- 知覚速度の個人差がIPS活動と相関することが示唆される
- IPSの機能不全は視覚探索の遅延と関連する（例: 半側空間無視）

## 結論
**ROI**: Intraparietal Sulcus（IPS、頭頂間溝）
**TLF**: Perceptual speed（知覚速度）

このROI-TLFの組み合わせは神経科学的に十分に妥当であり、HCD作成に進むことが可能である。

## 参考文献

1. Ptak, R., & Schnider, A. (2011). Lesion evidence for the critical role of the intraparietal sulcus in spatial attention. Brain, 134(6), 1694-1709.

2. UCSB Study (2012). Brain Functions During Visual Searches. https://news.ucsb.edu/2012/013319/ucsb-study-reveals-brain-functions-during-visual-searches

3. Donohue, S. E., et al. (2021). Target processing in overt serial visual search involves the dorsal attention network. Neuropsychologia, 153.

4. Tang, M., et al. (2025). Spatial Processing Enhancement in the Prefrontal Cortex for Rapid Detection of Valuable Objects. Journal of Neuroscience, 45(16).

5. Waterston, M. L., et al. (2020). Low frequency transcranial magnetic stimulation of right posterior parietal cortex reduces reaction time to perithreshold low spatial frequency visual stimuli. Scientific Reports.

6. Yang, Y., et al. (2024). The Role of Occipitotemporal Network for Speed-Reading: An fMRI Study. Journal of Neuroscience.

7. Zheng, X., et al. (2025). Representation of top-down versus bottom-up attention in the right dorsolateral prefrontal cortex and superior parietal lobule. Behavioral and Brain Functions.

8. Griffis, J. C., et al. (2021). The Role of Frontoparietal Cortex across the Functional Stages of Visual Search. Journal of Cognitive Neuroscience, 33(1), 63-80.
