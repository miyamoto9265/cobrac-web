# 作業手順

## フォルダ構造

作業を開始する前に、本指示書（instructionファイル）が存在するフォルダに、以下のフォルダ構造を作成してください。

```
{ProjectName}/
├── {ProjectName}_HCD/
├── {ProjectName}_FRG/
└── {ProjectName}_CSV/
```

- **{ProjectName}** (Project ID): プロジェクト名兼 Project ID（英語）。TLF や ROI の内容がわかるわかりやすい ID を付けてください。ユーザーから Project ID の指定がない場合も、同様に内容を反映した適切な ID を決定してください。
- **{ProjectName}_HCD/**: HCD作業用フォルダ。`instruction_1_HCD.md` の作業はこのフォルダ内で行います。
- **{ProjectName}_FRG/**: FRG作業用フォルダ。`instruction_2_FRG.md` の作業はこのフォルダ内で行います。
- **{ProjectName}_CSV/**: CSV格納用フォルダ。`instruction_3_csv.md` で作成するCSVファイルはこのフォルダ内に保存します。

例: プロジェクト名が `VisualCortex` の場合（Project ID も `VisualCortex`）

```
VisualCortex/
├── VisualCortex_HCD/
├── VisualCortex_FRG/
└── VisualCortex_CSV/
```

---

1. まずは、同フォルダ内のinstruction_1_HCD.mdを参照してください。instruction_2_FRG.mdは1_HCDの作業完了まで絶対に読まないでください。
2. ユーザーの指定したROIとTLFから、instruction_1_HCD.mdの作業を開始して下さい。ROIあるいはTLFが与えられていない場合の対応も指示書内にあります。 
3. instruction_1_HCD.mdが終わったら、instruction_2_FRG.mdの作業を開始して下さい。TLFはユーザーが最初に提示したもの、UCはステップ2で作成したものを使用してください。
4. instruction_2_FRG.mdが終わったら、instruction_3_csv.mdの作業を開始してください。
