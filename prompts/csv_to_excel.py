"""
CoBRAC CSV → xlsx 変換スクリプト（CoBRAC Agents 版）
複数のCSVファイルを加工して1つのxlsxファイルに統合する。

使い方:
    python csv_to_excel.py --contributor "Name" --project-id ProjectID [--base-dir DIR] [--output PATH]

引数を省略した場合は対話入力にフォールバックする（デスクトップ利用との互換性維持）。

{base-dir}/{ProjectID}/{ProjectID}_CSV/ フォルダから以下のCSVを読み込む:
    Project.csv, References.csv, Circuits.csv, Connections.csv, FRG.csv
これらはワーカーがエージェントの JSON（uc.json / connections.json / references.json / frg.json）から
決定的に生成したもの（packages/shared/src/harness.ts の buildCsvs）。
Project.csv の A2 / B2 には入力値を設定して xlsx に出力する。
出力: {base-dir}/{ProjectID}/{ProjectID}_CSV/{ProjectID}.bra.xlsx（--output で変更可）
"""

import argparse
import os
import sys
import pandas as pd

OUT_OF_ROI_CAPABILITY = "No need for description due to input/output circuit"
REVIEW_SHEETS = ("References", "Circuits", "Connections", "FRG")


def main():
    parser = argparse.ArgumentParser(description="CoBRAC CSV -> xlsx converter")
    parser.add_argument("--contributor", default=None)
    parser.add_argument("--project-id", default=None)
    parser.add_argument("--base-dir", default=os.path.dirname(os.path.abspath(__file__)))
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    contributor = args.contributor
    project_id = args.project_id

    if not contributor:
        print("=== CoBRAC CSV → xlsx 変換 ===\n")
        contributor = input("Contributor を入力してください: ").strip()
    if not project_id:
        project_id = input("Project ID を入力してください: ").strip()

    if not contributor or not project_id:
        print("エラー: Contributor と Project ID は必須です。")
        sys.exit(1)

    print("\n各CSVを処理中...")

    csv_dir = os.path.join(args.base_dir, project_id, f"{project_id}_CSV")
    if not os.path.isdir(csv_dir):
        print(f"エラー: CSVフォルダが見つかりません: {csv_dir}")
        sys.exit(1)

    project_df = process_project(csv_dir, contributor, project_id)

    references_df  = process_references(csv_dir)
    circuits_df    = process_circuits(csv_dir, contributor, project_id)
    connections_df = process_connections(csv_dir, contributor, project_id)
    frg_df         = process_frg(csv_dir)

    output_file = args.output or os.path.join(csv_dir, f"{project_id}.bra.xlsx")
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)

    with pd.ExcelWriter(output_file, engine="openpyxl") as writer:
        project_df.to_excel(writer,     sheet_name="Project",     index=False)
        references_df.to_excel(writer,  sheet_name="References",  index=False)
        circuits_df.to_excel(writer,    sheet_name="Circuits",     index=False)
        connections_df.to_excel(writer, sheet_name="Connections",  index=False)
        frg_df.to_excel(writer,         sheet_name="FRG",          index=False)

    print(f"\n完了: {output_file}")


# ---------------------------------------------------------------------------
# Project.csv
# ---------------------------------------------------------------------------
def process_project(csv_dir: str, contributor: str, project_id: str) -> pd.DataFrame:
    """
    Project.csv を読み込み、A2 に Contributor、B2 に Project ID を設定して返す。
    Review End Line（References / Circuits / Connections / FRG の行の B 列）はワーカーが埋めた値を数値にする。
    """
    project_csv = os.path.join(csv_dir, "Project.csv")
    if not os.path.isfile(project_csv):
        print(f"エラー: Project.csv が見つかりません: {project_csv}")
        sys.exit(1)

    df = pd.read_csv(
        project_csv,
        header=0,
        keep_default_na=False,
    )
    df.iloc[0, 0] = contributor
    df.iloc[0, 1] = project_id
    # Review End Line（各シートの最終レコードの行番号）は自然数としてセルに書く
    df = df.astype(object)
    for i in range(len(df)):
        if df.iloc[i, 0] in REVIEW_SHEETS and str(df.iloc[i, 1]).strip().isdigit():
            df.iloc[i, 1] = int(str(df.iloc[i, 1]).strip())
    return df


# ---------------------------------------------------------------------------
# References.csv
# ---------------------------------------------------------------------------
def process_references(csv_dir: str) -> pd.DataFrame:
    """
    変更なしでそのまま返す。
    列構成（CoBRAC-v1-1）: A Reference ID / B DOI / C Literature type / D Alternative URL
    （v1-0 は A・B の 2 列。C・D は末尾への追加なので A・B の位置は変わらない）
    """
    return pd.read_csv(
        os.path.join(csv_dir, "References.csv"),
        header=0,
        keep_default_na=False,
    )


# ---------------------------------------------------------------------------
# Circuits.csv
# ---------------------------------------------------------------------------
def process_circuits(csv_dir: str, contributor: str, project_id: str) -> pd.DataFrame:
    """
    元の列構成: A Circuit ID / B Source of ID / C Names /
                D Transmitter / E Modulation Type / F Comments / G UC Descriptor /
                H Sub-Circuits / I Uniform（H・I は CoBRAC-v1-1 から。無い CSV は空欄・TRUE とみなす）
    2 行目（最初のデータ行）は ROI 行（ROI_<ProjectID>、Uniform=FALSE、Sub-Circuits に ROI 内の全 UC）。

    処理後の列構成:
        A Circuit ID
        B Source of ID
        C Names
        D Sub-Circuits          (元 H。無ければ空欄)
        E Super Class           (空欄)
        F Uniform               (元 I。無ければ TRUE)
        G Transmitter           (元 D)
        H Modulation Type       (元 E)
        I Size                  (空欄)
        J Output Semantics (0)  (空欄)
        K Physiological Data    (空欄)
        L Comments              (元 F)
        M Contributor           (入力値)
        N Project ID            (入力値)
        O UC Descriptor         (元 G。BRA の A〜N 列の位置を変えないよう最後に置く)
    """
    df = pd.read_csv(
        os.path.join(csv_dir, "Circuits.csv"),
        header=0,
        keep_default_na=False,
    )
    n = len(df)
    descriptor = df.pop("UC Descriptor")
    sub_circuits = df.pop("Sub-Circuits") if "Sub-Circuits" in df.columns else pd.Series([""] * n)
    uniform = (
        df.pop("Uniform").map(lambda v: str(v).strip().upper() != "FALSE")
        if "Uniform" in df.columns
        else pd.Series([True] * n)
    )

    df.insert(3, "Sub-Circuits", sub_circuits.values)
    df.insert(4, "Super Class",  [""] * n)
    df.insert(5, "Uniform",      uniform.values)

    df.insert(8,  "Size",                 [""] * n)
    df.insert(9,  "Output Semantics (0)", [""] * n)
    df.insert(10, "Physiological Data",   [""] * n)

    df["Contributor"] = contributor
    df["Project ID"]  = project_id
    df["UC Descriptor"] = descriptor

    return df


# ---------------------------------------------------------------------------
# Connections.csv
# ---------------------------------------------------------------------------
def process_connections(csv_dir: str, contributor: str, project_id: str) -> pd.DataFrame:
    """
    元の列構成:
        A Sender Circuit ID (sCID) / B Receiver Circuit ID (rCID) / C Comments /
        D Reference ID / E Taxon / F Measurement method /
        G Pointers on literature / H Pointers on figure /
        I sCID relation / J Notation of sCID in Literature /
        K rCID relation / L Notation of rCID in Literature
        （I〜L は CoBRAC-v1-1 から。無い CSV は relation "="、Notation は Circuit ID のコピー）

    処理後の列構成:
        A Sender Circuit ID (sCID)
        B sCID relation                    (元 I)
        C Notation of sCID in Literature   (元 J)
        D Receiver Circuit ID (rCID)
        E rCID relation                    (元 K)
        F Notation of rCID in Literature   (元 L)
        G Size                             (空欄)
        H Comments                         (元 C)
        I Reference ID                     (元 D)
        J Taxon                            (元 E)
        K Measurement method               (元 F)
        L Pointers on literature           (元 G)
        M Pointers on figure               (元 H)
        N In-depth literature              (空欄)
        O Contributor                      (入力値)
        P Project ID                       (入力値)
    """
    df = pd.read_csv(
        os.path.join(csv_dir, "Connections.csv"),
        header=0,
        keep_default_na=False,
    )
    n = len(df)

    def pop_or(name, default):
        return df.pop(name).values if name in df.columns else default

    s_rel = pop_or("sCID relation", ["="] * n)
    s_not = pop_or("Notation of sCID in Literature", df.iloc[:, 0].values)
    r_rel = pop_or("rCID relation", ["="] * n)
    r_not = pop_or("Notation of rCID in Literature", df.iloc[:, 1].values)

    df.insert(1, "sCID relation", s_rel)
    df.insert(2, "Notation of sCID in Literature", s_not)
    df.insert(4, "rCID relation", r_rel)
    df.insert(5, "Notation of rCID in Literature", r_not)
    df.insert(6, "Size", [""] * n)

    df["In-depth literature"] = ""
    df["Contributor"]         = contributor
    df["Project ID"]          = project_id

    return df


# ---------------------------------------------------------------------------
# FRG.csv
# ---------------------------------------------------------------------------
def process_frg(csv_dir: str) -> pd.DataFrame:
    """
    元の列構成:
        A Node ID / B Subnodes / C Circuit ID / D Projected Circuits /
        E Capability / F Mechanism / G Implementation of Uniform Circuit /
        H Requirements Realization by Interface / I Requirements /
        J Output Semantics / K Comments

    処理後の列構成:
        A Node ID
        B Subnodes
        C Circuit ID
        D Projected Circuits
        E Capability&Mechanism  (E+改行+タグ+改行+F。タグはテンプレートの既定値。ROI 外 UC の行は E の定型文だけ)
        F Implementation of Uniform Circuit  (元 G)
        G Requirements Realization by Interface  (元 H)
        H Requirements  (元 I)
        I Output Semantics  (元 J)
        J Comments  (元 K)
    """
    df = pd.read_csv(
        os.path.join(csv_dir, "FRG.csv"),
        header=0,
        keep_default_na=False,
    )

    capability = df.iloc[:, 4].astype(str)
    mechanism  = df.iloc[:, 5].astype(str)

    merged = capability + "\n<<mechanism to realize the capability>>\n" + mechanism
    # ROI 外 UC の定型文（harness.ts の OUT_OF_ROI_CAPABILITY）はタグを付けずにそのまま出す
    fixed = (capability == OUT_OF_ROI_CAPABILITY) & (mechanism.str.strip() == "")
    merged = merged.where(~fixed, capability)

    new_df = pd.DataFrame()

    for i in range(4):
        new_df[df.columns[i]] = df.iloc[:, i].values

    new_df["Capability&Mechanism"] = merged.values

    for i in range(6, len(df.columns)):
        new_df[df.columns[i]] = df.iloc[:, i].values

    return new_df


if __name__ == "__main__":
    main()
