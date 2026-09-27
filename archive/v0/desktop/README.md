# CoBRAC

**CoBRAC** (Collaborative Brain Reference Architecture Compiler) は、特定の脳領域（ROI）が実行する計算機能（TLF）について、神経科学的知見に基づき情報処理を構造化して記述し、**BRA**（Brain Reference Architecture）データを `.bra.xlsx` 形式で出力するワークフローです。

## ユーザーガイド

作業手順の詳細はユーザーガイドを参照してください。

| 言語 | PDF | HTML |
|------|-----|------|
| 日本語 | [CoBRAC_UserGuide_ja.pdf](userguide/CoBRAC_UserGuide_ja.pdf) | [userguide/ja/index.html](userguide/ja/index.html) |
| English | [CoBRAC_UserGuide_en.pdf](userguide/CoBRAC_UserGuide_en.pdf) | [userguide/en/index.html](userguide/en/index.html) |

## リポジトリ構成

```
_latest_version/
├── instruction_0.md        # プロジェクトフォルダ作成
├── instruction_1_HCD.md    # HCD 作成
├── instruction_2_FRG.md    # FRG 作成
├── instruction_3_csv.md    # CSV 作成
└── csv_to_excel.py         # .bra.xlsx 生成

userguide/                  # ユーザーガイド（HTML / PDF / スクリーンショット）
requirements.txt            # Python 依存パッケージ
```

## クイックスタート

1. リポジトリを clone する
2. [ユーザーガイド（日本語 PDF）](userguide/CoBRAC_UserGuide_ja.pdf) を読む
3. Python 3.x を用意し、依存パッケージをインストールする

   ```bash
   pip install -r requirements.txt
   ```

4. `_latest_version/` で `instruction_0.md` から順に作業を進める

## ワークフロー概要

```
TLF / ROI → HCD → FRG → CSV（5 ファイル）→ .bra.xlsx
```

最終成果物 `.bra.xlsx` には Project / References / Circuits / Connections / FRG の 5 シートが含まれます。

## ライセンス

（未定）
