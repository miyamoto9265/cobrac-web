# ステップ2: BIF（Brain Information Flow）構築

## 目的
ROI内外の神経接続を網羅的に調査し、解剖学的接続データベースを構築する。

## BIF定義

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| 聴覚視床（MGm, PIN, Sg）(ROI外) | 外側扁桃体核（LA） | 聴覚CS情報の伝達。視床から外側扁桃体への直接投射は恐怖条件づけに十分。 | LeDoux et al., 1990; Romanski & LeDoux, 1992 (J Neurosci 10:1062; 12:4501) |
| 視覚視床（LG, LP）(ROI外) | 外側扁桃体核（LA） | 視覚CS情報の伝達。直接視床→扁桃体経路と視床→皮質→扁桃体経路の両方が存在。 | Linke et al., 1999 (J Comp Neurol 412:383) |
| 後部視床（PIT）(ROI外) | 外側扁桃体核（LA） | 侵害刺激（足ショック）などのUS情報の伝達。PIT病変は足ショックUSによる恐怖条件づけを阻害。 | Shi & Davis, 1999 (J Neurosci 19:5034); Lanuza et al., 2004 (Neuroscience 125:305) |
| 外側視床（Calr+）(ROI外) | 外側扁桃体核（LA） | CS（音）とUS（足ショック）の統合情報を伝達。恐怖条件づけにより可塑性を示す。 | Barsy et al., 2020 (Nat Neurosci 23:625) |
| 腹側海馬（vHPC）(ROI外) | 基底外側扁桃体（BLA） | 文脈情報の伝達。消去学習と恐怖の文脈依存的調節に関与。 | Maren & Hobin, 2007 (J Neurosci 27:12682); Orsini et al., 2011 (Learn Mem 18:747) |
| 腹側海馬（vHPC）(ROI外) | 前辺縁皮質（PL） | 文脈情報の伝達。文脈性恐怖記憶のサポートと恐怖再発に関与。 | Jin & Maren, 2015 (J Neurosci 40:8410); Xu et al., 2016 (Hippocampus 26:1039) |
| 腹側海馬（vHPC）(ROI外) | 下辺縁皮質（IL） | 文脈情報の伝達。消去学習における文脈依存的調節に関与。 | Orsini et al., 2011 (Learn Mem 18:747) |
| 外側扁桃体核（LA） | 基底外側扁桃体（BLA） | LA内でのCS-US連合学習後、BLAへ情報伝達。LAはBLA複合体の一部。 | Pitkänen et al., 1997 (Trends Neurosci 20:517); Johansen et al., 2011 (Nat Neurosci 14:1569) |
| 基底外側扁桃体（BLA） | 中心核（CEA） | 直接的興奮性投射。恐怖反応の駆動。 | Pitkänen et al., 1997 (Trends Neurosci 20:517) |
| 基底外側扁桃体（BLA） | 介在細胞群（ITC） | BLAからITCへの投射。消去学習時にITCが活性化され、CEA出力を抑制。 | Likhtik et al., 2008 (Ann NY Acad Sci 1129:1); Busti et al., 2011 (Proc Natl Acad Sci USA 108:3641) |
| 介在細胞群（ITC） | 中心核（CEA） | GABAergic抑制性投射。ITC活性化によりCEA出力が抑制され、恐怖反応が抑制される。 | Royer et al., 1999 (J Neurosci 19:5793); Likhtik et al., 2008 (Ann NY Acad Sci 1129:1) |
| 中心核（CEA） | 視床下部（ROI外） | CEAから視床下部外側核への投射。恐怖条件づけによる自律神経反応（血圧上昇など）を媒介。 | LeDoux et al., 1988 (J Neurosci 8:2517) |
| 中心核（CEA） | 中脳水道周囲灰白質（PAG）(ROI外) | CEAから吻側PAGへの投射。恐怖条件づけによる行動反応（すくみ反応）を媒介。 | LeDoux et al., 1988 (J Neurosci 8:2517) |
| 中心核（CEA） | 脳幹（ROI外） | CEAから脳幹諸核への投射。恐怖反応の多様な自律神経・行動成分を制御。 | Davis, 1992 (Annu Rev Neurosci 15:353) |
| 前辺縁皮質（PL） | 基底外側扁桃体（BLA：吻側BLA優位） | 興奮性投射。恐怖の発現と恐怖再発に関与。主に吻側BLAに投射し、L2 cortico-amygdalar neuronsを標的とする。 | Vertes, 2004 (Neuroscience 119:251); McGarry & Carter, 2016 (eLife 5:e18691); Fillinger et al., 2022 (eLife 11:e82688) |
| 下辺縁皮質（IL） | 基底外側扁桃体（BLA：尾側BLA優位） | 興奮性投射。消去記憶の獲得・保持に必須。消去訓練後にIL→BLA投射ニューロンの興奮性が増加。主に尾側BLAに投射し、L5 pyramidal tract neuronsを標的とする。 | Milad & Quirk, 2002 (Nature 420:70); Do-Monte et al., 2015 (Nat Neurosci 18:1112); Bloodgood et al., 2018 (Transl Psychiatry 8:60); Fillinger et al., 2022 (eLife 11:e82688) |
| 下辺縁皮質（IL） | 介在細胞群（ITC） | 興奮性投射。IL活性化によりITCが活性化され、CEA出力を抑制して恐怖反応を抑制。 | Quirk et al., 2003 (Neuron 38:625); Amir et al., 2011 (Biol Psychiatry 69:1073) |
| 基底外側扁桃体（BLA：吻側BLA優位） | 前辺縁皮質（PL） | 逆行性投射。吻側BLAは優先的にPL（特にL2）へ投射。mPFC-BLA間の強力な双方向接続の一部。 | Little & Carter, 2013 (J Neurosci 33:15333); Fillinger et al., 2022 (eLife 11:e82688) |
| 基底外側扁桃体（BLA：尾側BLA優位） | 下辺縁皮質（IL） | 逆行性投射。尾側BLAは優先的にIL（特にL5）へ投射。mPFC-BLA間の強力な双方向接続の一部。 | Vertes, 2004 (Neuroscience 119:251); Fillinger et al., 2022 (eLife 11:e82688) |
| 前辺縁皮質（PL） | 下辺縁皮質（IL） | PL→IL投射。層5/6に位置。IL依存学習の12-14時間後に必要。 | Sharpe & Killcross, 2018 (Nat Commun 9:2727) |
| 下辺縁皮質（IL） | 前辺縁皮質（PL） | IL→PL投射。層5/6に位置。IL依存学習中に必要。 | Sharpe & Killcross, 2018 (Nat Commun 9:2727) |
| 中脳水道周囲灰白質（dPAG）(ROI外) | 基底外側扁桃体（BLA） | 背側PAGは無条件刺激情報をBLAへ伝達。BLA不活性化によりdPAG刺激による恐怖反応がブロックされる。 | Kincheski et al., 2012 (Proc Natl Acad Sci USA 109:14985) |

## 補足情報

### LAとBLAの関係
外側扁桃体核（LA）は基底外側扁桃体複合体（BLA complex）の一部であり、LAはBLAの前方入力ステージとして機能する。本HCDでは、LAでのCS-US連合学習をBLA全体の機能として統合的に扱う可能性がある。

### ITCの多様性
介在細胞群（ITC）は複数のクラスター（main ITC, caudal ITC, lateral ITCなど）から構成され、各クラスターは異なる接続パターンを持つ。本HCDでは、消去学習における主要なITC機能を統合的に扱う。

### 双方向接続の機能的非対称性
BLA↔mPFC間の双方向接続は、解剖学的には相互的だが、機能的には異なる役割を果たす：
- mPFC→BLA: トップダウン制御（恐怖の発現促進 or 抑制）
- BLA→mPFC: ボトムアップ情報（恐怖信号の伝達）

### 文献リスト（主要なもの）

1. LeDoux et al., 1988. Different projections of the central amygdaloid nucleus mediate autonomic and behavioral correlates of conditioned fear. J Neurosci 8:2517-2529.
2. LeDoux et al., 1990. The lateral amygdaloid nucleus: sensory interface of the amygdala in fear conditioning. J Neurosci 10:1062-1069.
3. Romanski & LeDoux, 1992. Equipotentiality of thalamo-amygdala and thalamo-cortico-amygdala circuits in auditory fear conditioning. J Neurosci 12:4501-4509.
4. Linke et al., 1999. Organization of projections to the lateral amygdala from auditory and visual areas of the thalamus in the rat. J Comp Neurol 412:383-409.
5. Shi & Davis, 1999. Pain pathways involved in fear conditioning measured with fear-potentiated startle. J Neurosci 19:420-430.
6. Lanuza et al., 2004. Unconditioned stimulus pathways to the amygdala. Neuroscience 125:305-315.
7. Milad & Quirk, 2002. Neurons in medial prefrontal cortex signal memory for fear extinction. Nature 420:70-74.
8. Quirk et al., 2003. Stimulation of medial prefrontal cortex decreases the responsiveness of central amygdala output neurons. J Neurosci 23:8800-8807.
9. Vertes, 2004. Differential projections of the infralimbic and prelimbic cortex in the rat. Neuroscience 119:251-272.
10. Maren & Hobin, 2007. Hippocampal regulation of context-dependent neuronal activity in the lateral amygdala. Learn Mem 14:318-324.
11. Likhtik et al., 2008. Amygdala intercalated neurons are required for expression of fear extinction. Ann NY Acad Sci 1129:1-14.
12. Orsini et al., 2011. Hippocampal and prefrontal projections to the basal amygdala mediate contextual regulation of fear after extinction. Learn Mem 18:747-750.
13. Amir et al., 2011. The role of the orbitofrontal cortex in anxiety disorders. Ann NY Acad Sci 1121:546-561.
14. Johansen et al., 2011. Molecular mechanisms of fear learning and memory. Cell 147:509-524.
15. Kincheski et al., 2012. Dorsal periaqueductal gray-amygdala pathway conveys both innate and learned fear responses in rats. Proc Natl Acad Sci USA 109:14985-14990.
16. Little & Carter, 2013. Synaptic mechanisms underlying strong reciprocal connectivity between the medial prefrontal cortex and basolateral amygdala. J Neurosci 33:15333-15342.
17. Do-Monte et al., 2015. A temporal shift in the circuits mediating retrieval of fear memory. Nature 519:460-463.
18. Jin & Maren, 2015. Prefrontal-hippocampal interactions in memory and emotion. Front Syst Neurosci 9:170.
19. McGarry & Carter, 2016. Inhibitory gating of basolateral amygdala inputs to the prefrontal cortex. eLife 5:e18691.
20. Xu et al., 2016. Delineating the contribution of the rodent prelimbic and infralimbic cortices to fear conditioning. Hippocampus 26:1039-1053.
21. Bloodgood et al., 2018. Fear extinction requires infralimbic cortex projections to the basolateral amygdala. Transl Psychiatry 8:60.
22. Sharpe & Killcross, 2018. Infralimbic cortex is required for learning alternatives to prelimbic promoted associations through reciprocal connectivity. Nat Commun 9:2727.
23. Barsy et al., 2020. Associative and plastic thalamic signaling to the lateral amygdala controls fear behavior. Nat Neurosci 23:625-637.
24. Fillinger et al., 2022. Rostral and caudal basolateral amygdala engage distinct circuits in the prelimbic and infralimbic prefrontal cortex. eLife 11:e82688.
