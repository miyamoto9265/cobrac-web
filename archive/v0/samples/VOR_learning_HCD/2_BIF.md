# ステップ2: BIF（Brain Information Flow）

VOR学習における小脳の神経接続データベース

## 神経接続表

| Sender | Receiver | Comment | Reference |
| ------ | -------- | ------- | --------- |
| Vestibular nerve (primary afferents) | Granule cells (cerebellar cortex) | 前庭神経から直接、前庭感覚情報（頭部運動の速度・加速度）を苔状線維として顆粒細胞へ投射。Juxtarestiform bodyを経由してflocculus/nodulus/uvulaへ。一次前庭求心性線維。 | Barmack, 2003; Wikipedia Vestibulocerebellar tract, 2024 (https://en.wikipedia.org/wiki/Vestibulocerebellar_tract) |
| Vestibular nuclei | Granule cells (cerebellar cortex) | 前庭神経核から二次前庭求心性線維として苔状線維投射。Medial, lateral, descending, superior vestibular nucleiから、flocculusおよびvermal lobules IX-Xへ投射。前庭情報および眼球運動のefference copyを含む可能性。 | Barmack, 2003; Springer Vestibulocerebellar Functional Connections (https://link.springer.com/referenceworkentry/10.1007/978-3-319-97911-3_18-2) |
| Pontine nuclei | Granule cells (cerebellar cortex) | 橋核から苔状線維として視覚運動情報を投射。大脳皮質の視覚野および前頭眼野からの情報を中継。Dorsolateral, lateral, ventral medial, dorsomedial nucleiなど複数の亜核から分散してflocculusへ投射。 | Buttner-Ennever & Horn, 1997; Frontiers in Neural Circuits 2017 (https://www.frontiersin.org/articles/10.3389/fncir.2017.00033/full) |
| Nucleus of the optic tract (NOT) / Accessory optic system (AOS) | Inferior olivary nucleus | 視覚誤差信号（retinal slip）を処理。NOTおよびAOS（Medial/Lateral/Dorsal terminal nuclei）から下オリーブ核へ投射。遅い視覚運動に対応し、方向選択性を持つ。視覚誤差信号を符号化。 | Mustari & Fuchs, 1990; Escholarship AOS review (https://escholarship.org/content/qt3v25z604/qt3v25z604_noSplash_0779a860fa893ab369f4c87176d47477.pdf); PMC Smooth Pursuit 2010 (https://ncbi.nlm.nih.gov/pmc/articles/PMC2867559/) |
| Nucleus of the optic tract (NOT) / Pretectum | Pontine nuclei | 視覚情報（optic flow）を橋核へ中継し、苔状線維経路として小脳へ間接的に伝達。 | Mustari & Fuchs, 1990; Buttner-Ennever & Horn, 1997 |
| Inferior olivary nucleus | Purkinje cells | 下オリーブ核（Dorsomedial cell column, β-nucleus）から登上線維として対側のプルキンエ細胞へ投射。Inferior cerebellar peduncleを経由。誤差信号（retinal slip errorなど）を伝達し、複雑スパイクを誘発。シナプス可塑性（LTD/LTP）の教師信号として機能。各プルキンエ細胞は成熟後、単一の登上線維入力を受ける。 | Wikipedia Climbing fiber (https://en.wikipedia.org/wiki/Climbing_fiber); Najafi et al., 2024 (https://www.nature.com/articles/s41593-024-01594-7); Herzfeld et al., 2024 (https://www.biorxiv.org/content/10.1101/2024.01.03.574031v1); Frontiers in Neural Circuits 2013 (https://www.frontiersin.org/journals/neural-circuits/articles/10.3389/fncir.2013.00001/full) |
| Granule cells | Parallel fibers (molecular layer) | 顆粒細胞の軸索が平行線維として分子層へ上昇し、T字型に分岐。各平行線維は数百のプルキンエ細胞の樹状突起と接触可能。興奮性グルタミン酸作動性。 | Wikipedia Parallel fiber; Frontiers in Synaptic Neuroscience 2016 (https://www.frontiersin.org/articles/10.3389/fnsyn.2016.00035/full) |
| Parallel fibers | Purkinje cells | 平行線維からプルキンエ細胞樹状突起へ興奮性シナプス。各プルキンエ細胞は10万以上の平行線維シナプスを受ける。AMPA受容体およびmGlu1受容体を介した伝達。シナプス可塑性（LTD/LTP）の主要部位。 | Frontiers in Synaptic Neuroscience 2016 (https://www.frontiersin.org/articles/10.3389/fnsyn.2016.00035/full); Annual Reviews Neuroscience 2022 (https://www.annualreviews.org/content/journals/10.1146/annurev-neuro-091421-125115) |
| Parallel fibers | Basket cells | 平行線維から分子層の深部に位置するBasket cellsへ興奮性入力。 | Annual Reviews Neuroscience 2022; Lab 6 Cerebellar Cortex (https://vanat.ahc.umn.edu/neurLab6/Cortex.html) |
| Parallel fibers | Stellate cells | 平行線維から分子層のStellate cellsへ興奮性入力。 | Annual Reviews Neuroscience 2022; Lab 6 Cerebellar Cortex |
| Parallel fibers | Golgi cells | 平行線維から顆粒細胞層のGolgi cellsへ興奮性入力。フィードバック抑制回路を形成。 | Frontiers in Cellular Neuroscience 2014 (https://www.frontiersin.org/articles/10.3389/fncel.2014.00055/pdf); PMC Golgi Cells 2008 (https://ncbi.nlm.nih.gov/pmc/articles/PMC2570065/) |
| Mossy fibers | Golgi cells | 苔状線維から顆粒細胞層のGolgi cellsへ興奮性入力。フィードフォワード抑制回路を形成。 | Frontiers in Cellular Neuroscience 2014; PMC Golgi Cells 2008 |
| Golgi cells | Granule cells | Golgi cellsから顆粒細胞へGABA作動性の抑制性シナプス。小脳糸球体（glomerulus）内で接触。Phasic inhibition（α1-GABA-A受容体）とtonic inhibition（α6-GABA-A受容体）の二つのメカニズム。 | Frontiers in Cellular Neuroscience 2014; Wikipedia Glomerulus cerebellum (https://en.wikipedia.org/wiki/Glomerulus_(cerebellum)); eNeuro 2016 (https://www.eneuro.org/content/3/3/eneuro.0055-16.2016) |
| Basket cells | Purkinje cells | Basket cellsからプルキンエ細胞の軸索初節周囲へGABA作動性の抑制性シナプス（"basket"状の接触）。Lateral inhibitionを媒介。 | Lab 6 Cerebellar Cortex; Frontiers in Molecular Neuroscience 2019 (https://www.frontiersin.org/journals/molecular-neuroscience/articles/10.3389/fnmol.2019.00267/full) |
| Stellate cells | Purkinje cells | Stellate cellsからプルキンエ細胞樹状突起へGABA作動性の抑制性シナプス。Lateral inhibitionを媒介。 | Lab 6 Cerebellar Cortex; Frontiers in Molecular Neuroscience 2019 |
| Purkinje cells (flocculus) | Vestibular nuclei | Flocculusのプルキンエ細胞から前庭神経核（Medial, lateral, descending vestibular nuclei）へGABA作動性の抑制性投射。VOR調整の主要出力経路。Flocculus target neurons (FTNs)と呼ばれる複数のタイプの前庭神経核ニューロンへ投射。 | Buttner-Ennever & Horn, 1997; Wiley 1995 Postsynaptic targets (https://onlinelibrary.wiley.com/doi/10.1111/j.1460-9568.1995.tb00653.x); NCBI VOR pathway (https://www.ncbi.nlm.nih.gov/books/NBK545297/) |
| Vestibular nuclei | Abducens nucleus | 前庭神経核から外転神経核へ興奮性投射。Medial longitudinal fasciculus (MLF)を経由。VORの運動出力経路の一部として、外眼筋（lateral rectus）を制御。 | NCBI Neuroanatomy VOR (https://www.ncbi.nlm.nih.gov/books/NBK545297/); Neuroanatomy BS 13 (https://neuroanatomy.wisc.edu/Bs97/TEXT/P13/pw.htm); Wikipedia MLF (https://en.wikipedia.org/wiki/Medial_longitudinal_fasciculus) |
| Vestibular nuclei | Oculomotor nucleus | 前庭神経核から動眼神経核へ投射。Medial longitudinal fasciculus (MLF)を経由。VORの運動出力経路として垂直および回旋方向の眼球運動を制御。 | NCBI Neuroanatomy VOR; NCBI Central Vestibular Pathways (https://www.ncbi.nlm.nih.gov/books/NBK10987/) |
| Vestibular nuclei | Trochlear nucleus | 前庭神経核から滑車神経核へ投射。MLF経由。VORの運動出力経路として垂直および回旋方向の眼球運動を制御。 | NCBI Neuroanatomy VOR; NCBI Central Vestibular Pathways |

## 備考

### ROI内・ROI外の組織

**ROI内（小脳皮質）:**
- Granule cells
- Purkinje cells
- Basket cells
- Stellate cells
- Golgi cells
- Parallel fibers
- Mossy fiber terminals (小脳内部)
- Climbing fiber terminals (小脳内部)

**ROI外（小脳への入力源）:**
- Vestibular nerve (primary afferents)
- Vestibular nuclei
- Pontine nuclei
- Nucleus of the optic tract (NOT)
- Accessory optic system (AOS)
- Pretectum
- Inferior olivary nucleus

**ROI外（小脳からの出力先）:**
- Vestibular nuclei（入力源でもあり出力先でもある）
- Abducens nucleus
- Oculomotor nucleus
- Trochlear nucleus

### 接続の特性に関する注記

1. **興奮性接続**: Mossy fibers → Granule cells, Parallel fibers → Purkinje cells/interneurons, Climbing fibers → Purkinje cells, Vestibular nuclei → Oculomotor nuclei
2. **抑制性接続**: Golgi cells → Granule cells, Basket/Stellate cells → Purkinje cells, Purkinje cells → Vestibular nuclei
3. **可塑性部位**: Parallel fiber-Purkinje cell synapseが主要なLTD/LTP部位（登上線維による教師信号で誘導）

### 参考文献の完全リスト

1. Barmack, N. H. (2003). Central vestibular system: vestibular nuclei and posterior cerebellum. *Brain Research Bulletin*, 60(5-6), 511-541.

2. Buttner-Ennever, J. A., & Horn, A. K. E. (1997). Afferents to the cerebellar flocculus in cat with special reference to pathways conveying vestibular, visual (optokinetic) and oculomotor signals. *Brain Research*, 762(1-2), 107-121.

3. Mustari, M. J., & Fuchs, A. F. (1990). Discharge patterns of neurons in the pretectal nucleus of the optic tract (NOT) in the behaving primate. *Journal of Neurophysiology*, 64(1), 77-90.

4. Najafi, F., et al. (2024). Climbing fibers provide essential instructive signals for associative learning. *Nature Neuroscience*. https://www.nature.com/articles/s41593-024-01594-7

5. Herzfeld, D. J., et al. (2024). Rapid Motor Adaptation via Population-level Modulation of Cerebellar Error Signals. *bioRxiv*. https://www.biorxiv.org/content/10.1101/2024.01.03.574031v1

6. Matsuno, H., et al. (2023). Developmental timing-dependent organization of synaptic connections between mossy fibers and granule cells in the cerebellum. *Communications Biology*, 6, 517.

7. De Zeeuw, C. I., & Ten Brinke, M. M. (2015). Motor Learning and the Cerebellum. *Cold Spring Harbor Perspectives in Biology*, 7(9), a021683.

8. Ito, M. (2006). Cerebellar circuitry as a neuronal machine. *Progress in Neurobiology*, 78(3-5), 272-303.

9. D'Angelo, E., & Casali, S. (2013). Seeking a unified framework for cerebellar function and dysfunction: from circuit operations to cognition. *Frontiers in Neural Circuits*, 6, 116.

10. Additional references from web search results (URLs provided in table).
