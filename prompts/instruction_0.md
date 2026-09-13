# 作業手順

## CoBRAC Agents 実行環境での追加ルール（最初に必ず読むこと）

本指示書は **CoBRAC Agents**（サーバー上の Codex エージェント実行環境）で実行されます。デスクトップ上での対話的実行とは異なり、以下のルールが適用されます。

### 1. 与えられる情報

最初のプロンプトで以下が与えられます。これらは変更せずそのまま使用してください。

- **ROI**（未指定の場合あり）
- **TLF**（未指定の場合あり）
- **Project ID**（`{ProjectName}` として使用。必ずこの値をフォルダ名・Project.csv に使用すること）
- **Contributor**（Project.csv の Contributor に使用。ユーザーに確認しないこと）

### 2. ユーザーへの確認が必要な場合（質問ルール）

ユーザーへの確認・判断が必要な場合（例: ROI が TLF の実現に不適切と判断した場合、ROI/TLF の候補が複数あり選択が必要な場合）は、**以下の形式で質問のみを出力してターンを終了**してください。

```
[QUESTION]
（ここに質問文。判断に必要な根拠・候補・推奨案を簡潔に含める）
[/QUESTION]
```

- `[QUESTION]` ブロックを出力したターンでは、それ以上の作業を行わないでください。
- ユーザーの回答は次のターンの入力として届きます。回答を受け取ったら、中断した箇所から作業を再開してください。
- 質問は本当に必要な場合のみ行ってください。自律的に妥当な判断ができる事項は、その判断理由を `1_Thinking.md` に記録して進めてください。
- 一度のターンで複数の質問がある場合は、1つの `[QUESTION]` ブロックにまとめてください。

### 3. 進捗マーカー

各 instruction の作業が完了した時点で、以下のマーカーを1行で出力してください（システムが進捗表示に使用します）。

- `instruction_1_HCD.md` の全成果物が完成: `[STEP_COMPLETE] HCD`
- `instruction_2_FRG.md` の全成果物が完成: `[STEP_COMPLETE] FRG`
- `instruction_3_csv.md` の全成果物が完成: `[STEP_COMPLETE] CSV`

### 4. xlsx 変換について

`csv_to_excel.py` による xlsx 変換は、CSV 作成完了後に **システムが自動実行** します。エージェントが実行する必要はありません（実行しても問題はありません）。

### 5. ツール

- Web 検索ツールが利用できます。文献調査に積極的に活用してください。
- 作業は作業ディレクトリ（本ファイルが存在するフォルダ）内で行ってください。

### 6. フォローアップ（修正指示）モード

初回作成完了後に「フォローアップ指示」が届いた場合は、以下に従ってください。

1. 指示内容に応じて `{ProjectName}_HCD/` および `{ProjectName}_FRG/` 内の成果物を修正する
2. HCD/FRG の内容に変更があった場合は、`instruction_3_csv.md` に従って `{ProjectName}_CSV/` の CSV を **再生成** する
3. 変更内容の要約を最後に出力し、`[STEP_COMPLETE] CSV` を出力する

---

## フォルダ構造

作業を開始する前に、本指示書（instructionファイル）が存在するフォルダに、以下のフォルダ構造を作成してください。

```
{ProjectName}/
├── {ProjectName}_HCD/
├── {ProjectName}_FRG/
└── {ProjectName}_CSV/
```

- **{ProjectName}** (Project ID): プロジェクト名兼 Project ID（英語）。CoBRAC Agents では最初のプロンプトで与えられた **Project ID をそのまま使用** してください。
- **{ProjectName}_HCD/**: HCD作業用フォルダ。`instruction_1_HCD.md` の作業はこのフォルダ内で行います。
- **{ProjectName}_FRG/**: FRG作業用フォルダ。`instruction_2_FRG.md` の作業はこのフォルダ内で行います。
- **{ProjectName}_CSV/**: CSV格納用フォルダ。`instruction_3_csv.md` で作成するCSVファイルはこのフォルダ内に保存します。

例: Project ID が `VisualCortex` の場合

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
