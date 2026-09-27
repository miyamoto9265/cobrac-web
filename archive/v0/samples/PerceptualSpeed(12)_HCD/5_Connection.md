# Connection定義

本ファイルでは、定義したUniform Circuit（UC）間の接続を、BIFで特定した神経接続に基づいて記述する。

## Connection一覧表

| Sender Circuit ID (sCID) | Receiver Circuit ID (rCID) | Comment | Reference |
| ------------------------- | -------------------------- | ------- | --------- |
| `Early-Visual-Features` | `Visual-Input-Integration` | 基本的な視覚特徴（エッジ、方位、色）をIPSへ送る。V1/V2からIPS1-2への投射 | Lewis & Van Essen (2000). https://pubmed.ncbi.nlm.nih.gov/11058227/ |
| `High-Level-Visual-Representation` | `Visual-Input-Integration` | 文字、数字、物体などのカテゴリー表現をIPSへ送る。Fusiform GyrusからIPS1-2へのIPS-FG線維束による投射 | Kamali et al. (2020). https://www.nature.com/articles/s41598-020-72471-z |
| `Motion-Processing` | `Pattern-Comparison` | 視覚動き情報をLIPへ送る。MT/MSTからLIPへの投射 | Rolls et al. (2023). https://www.oxcns.org/papers/656%20Rolls%20et%20al%202023%20Multiple%20cortical%20visual%20streams.pdf |
| `Thalamic-Attention-Hub` | `Visual-Input-Integration` | 視覚注意の調整信号を後部IPSへ送る。Pulvinarから後部IPSへの投射 | Arcaro et al. (2025). https://www.jneurosci.org/content/jneuro/45/15/e1837242025.full.pdf |
| `Thalamic-Attention-Hub` | `Pattern-Comparison` | 視覚注意の調整信号をLIPへ送る。Pulvinarから下部後頭頂領域への投射 | Arcaro et al. (2025). https://www.jneurosci.org/content/jneuro/45/15/e1837242025.full.pdf |
| `Visual-Input-Integration` | `Pattern-Comparison` | 統合された視覚表現をLIPへ送る。後部IPSからLIPへのIPS内投射 | Culham & Kanwisher (2001). https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/ |
| `Visual-Input-Integration` | `Working-Memory-Maintenance` | 視覚表現をワーキングメモリへ送る。後部IPSからLIPdへの投射 | Culham & Kanwisher (2001). https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/ |
| `Working-Memory-Maintenance` | `Pattern-Comparison` | 記憶された視覚表現をLIPへ送る。LIPd内での記憶-比較統合 | Harrewijn et al. (2025). https://www.nature.com/articles/s42003-025-08596-6 |
| `Top-Down-Attention-Control` | `Visual-Input-Integration` | トップダウン注意制御信号を後部IPSへ送る。dlPFC/InsulaからIPS1-2への投射 | Greenberg et al. (2012). https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| `Top-Down-Attention-Control` | `Working-Memory-Maintenance` | 認知制御信号をワーキングメモリへ送る。dlPFCからLIPdへの投射 | Harrewijn et al. (2025). https://www.nature.com/articles/s42003-025-08596-6 |
| `Top-Down-Attention-Control` | `Comparison-Decision` | 決定基準の制御信号を前部IPSへ送る。dlPFCからIPS3-4への投射 | Greenberg et al. (2012); Basti et al. (2022). https://www.frontiersin.org/articles/10.3389/fnimg.2022.1074674/full |
| `Pattern-Comparison` | `Comparison-Decision` | 比較処理の結果を前部IPSへ送る。LIPから前部IPSへのIPS内投射 | Culham & Kanwisher (2001). https://ncbi.nlm.nih.gov/pmc/articles/PMC1571496/ |
| `Pattern-Comparison` | `Oculomotor-Control` | 眼球運動指令をFEFへ送る。LIPv（腹側LIP）からFEFへの強いフィードフォワード接続 | Harrewijn et al. (2025). https://www.nature.com/articles/s42003-025-08596-6 |
| `Oculomotor-Control` | `Working-Memory-Maintenance` | 眼球運動のフィードバック信号をLIPdへ送る。FEFからLIPdへのフィードバック接続 | Harrewijn et al. (2025). https://www.nature.com/articles/s42003-025-08596-6 |
| `Comparison-Decision` | `Decision-Output` | 決定信号を前頭前野へ送る。前部IPSからdlPFCへの投射 | Greenberg et al. (2012). https://www.sciencedirect.com/science/article/abs/pii/S1053811913005806 |
| `Comparison-Decision` | `High-Level-Visual-Representation` | トップダウン視覚調整信号をFusiform Gyrusへ送る。IPSからFusiform GyrusへのIPS-FG線維束による双方向接続 | Kamali et al. (2020). https://www.nature.com/articles/s41598-020-72471-z |

## 接続の機能的意義

### 入力経路（ROI外 → ROI内）
1. **視覚特徴入力**: `Early-Visual-Features` → `Visual-Input-Integration`
   - 基本的な視覚特徴を提供
2. **高次視覚表現入力**: `High-Level-Visual-Representation` → `Visual-Input-Integration`
   - 文字・数字・物体などのカテゴリー表現を提供
3. **動き情報入力**: `Motion-Processing` → `Pattern-Comparison`
   - 動的刺激の処理に必要な時間的変化情報を提供
4. **注意調整入力**: `Thalamic-Attention-Hub` → `Visual-Input-Integration`, `Pattern-Comparison`
   - 視覚注意の調整により処理効率を向上
5. **認知制御入力**: `Top-Down-Attention-Control` → `Visual-Input-Integration`, `Working-Memory-Maintenance`, `Comparison-Decision`
   - タスク要求に応じた処理の調整

### ROI内処理経路
1. **視覚統合 → 比較**: `Visual-Input-Integration` → `Pattern-Comparison`
   - 統合された視覚表現を比較処理へ
2. **視覚統合 → 記憶**: `Visual-Input-Integration` → `Working-Memory-Maintenance`
   - 視覚情報をワーキングメモリに保持
3. **記憶 → 比較**: `Working-Memory-Maintenance` → `Pattern-Comparison`
   - 記憶情報と現在の視覚入力を比較
4. **比較 → 決定**: `Pattern-Comparison` → `Comparison-Decision`
   - 比較結果を統合し決定を形成

### 出力経路（ROI内 → ROI外）
1. **決定出力**: `Comparison-Decision` → `Decision-Output`
   - 類似性/相違性の判定結果を前頭前野へ
2. **視覚調整出力**: `Comparison-Decision` → `High-Level-Visual-Representation`
   - トップダウン調整により視覚処理を最適化
3. **眼球運動出力**: `Pattern-Comparison` → `Oculomotor-Control`
   - 視覚刺激間の注意シフトと視線移動を制御

### フィードバック経路
1. **眼球運動フィードバック**: `Oculomotor-Control` → `Working-Memory-Maintenance`
   - 眼球運動の情報をワーキングメモリに統合

## 次のステップ
ステップ4-2では、これらのConnectionに基づいて、各ROI内UCのInterfaceを3_UC.mdに追加する。
