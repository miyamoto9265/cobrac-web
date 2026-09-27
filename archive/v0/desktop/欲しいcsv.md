1. Reference.csv
すべての文献を記載する
A列: Referece ID
- [auther, year]形式
B列: DOI
- DOI

2. Circuits.csv
すべてのUniform Circuitを記載する
A列: Circuit ID
B列: Source of ID
- 該当Circuitの根拠となるReference ID
C列: Names
- Uniform Circuitの正式名称
D列: Transmitter
- 神経伝達物質(明らかであれば、任意)
E列: Modulation Type
- Inhibitory or Exatatory or Modulatory
F列: Comments
- 備考

3. Connections.csv
すべてのConnectionを記載する
A列: Sender Circuit ID (sCID)
- 送信Uniform Circuitを記載
B列: Receiver Circuit ID (rCID)
- 受信Uniform Circuitを記載
C列: Comments
- 備考
D列: Reference ID
- 該当Connectionの根拠となるReference ID
E列: Taxon
- 動物種を記載
F列: Measurement method
- Connectionを調べた実験手法を記載
G列: Pointers on literature
H列: Pointers on figure
- 文献内で接続の存在が分かる箇所の目印(簡潔に)

4. FRG.csv
A列: Node ID
B列: Subnodes
C列: Circuit ID
D列: Projected Circuits
E列: Capability
F列: Mechanism

G列: Implementation of Uniform Circuit
H列: Requirements Realization by Interface
I列: Requirements
J列: Output Semantics
K列: Comments