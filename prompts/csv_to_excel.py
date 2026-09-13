"""
CoBRAC CSV → xlsx 変換スクリプト（CoBRAC Agents 版）
複数のCSVファイルを加工して1つのxlsxファイルに統合する。

使い方:
    python csv_to_excel.py --contributor "Name" --project-id ProjectID [--base-dir DIR] [--output PATH]

引数を省略した場合は対話入力にフォールバックする（デスクトップ利用との互換性維持）。

{base-dir}/{ProjectID}/{ProjectID}_CSV/ フォルダから以下のCSVを読み込む:
    Project.csv, References.csv, Circuits.csv, Connections.csv, FRG.csv
Project.csv の A2 / B2 には入力値を設定して xlsx に出力する。
出力: {base-dir}/{ProjectID}/{ProjectID}_CSV/{ProjectID}.bra.xlsx（--output で変更可）
"""

import argparse
import os
import sys
import pandas as pd


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
    return df


# ---------------------------------------------------------------------------
# References.csv
# ---------------------------------------------------------------------------
def process_references(csv_dir: str) -> pd.DataFrame:
    """変更なしでそのまま返す。"""
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
                D Transmitter / E Modulation Type / F Comments

    処理後の列構成:
        A Circuit ID
        B Source of ID
        C Names
        D Sub-Circuits          (空欄)
        E Super Class           (空欄)
        F Uniform               (TRUE)
        G Transmitter           (元 D)
        H Modulation Type       (元 E)
        I Size                  (空欄)
        J Output Semantics (0)  (空欄)
        K Physiological Data    (空欄)
        L Comments              (元 F)
        M Contributor           (入力値)
        N Project ID            (入力値)
    """
    df = pd.read_csv(
        os.path.join(csv_dir, "Circuits.csv"),
        header=0,
        keep_default_na=False,
    )
    n = len(df)

    df.insert(3, "Sub-Circuits", [""] * n)
    df.insert(4, "Super Class",  [""] * n)
    df.insert(5, "Uniform",      [True] * n)

    df.insert(8,  "Size",                 [""] * n)
    df.insert(9,  "Output Semantics (0)", [""] * n)
    df.insert(10, "Physiological Data",   [""] * n)

    df["Contributor"] = contributor
    df["Project ID"]  = project_id

    return df


# ---------------------------------------------------------------------------
# Connections.csv
# ---------------------------------------------------------------------------
def process_connections(csv_dir: str, contributor: str, project_id: str) -> pd.DataFrame:
    """
    元の列構成:
        A Sender Circuit ID (sCID) / B Receiver Circuit ID (rCID) / C Comments /
        D Reference ID / E Taxon / F Measurement method /
        G Pointers on literature / H Pointers on figure

    処理後の列構成:
        A Sender Circuit ID (sCID)
        B sCID relation                    (全行 "=")
        C Notation of sCID in Literature   (元 A のコピー)
        D Receiver Circuit ID (rCID)
        E rCID relation                    (全行 "=")
        F Notation of rCID in Literature   (元 B のコピー)
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

    scid_col = df.iloc[:, 0].copy()
    rcid_col = df.iloc[:, 1].copy()

    df.insert(1, "sCID relation", ["="] * n)
    df.insert(2, "Notation of sCID in Literature", scid_col.values)
    df.insert(4, "rCID relation", ["="] * n)
    df.insert(5, "Notation of rCID in Literature", rcid_col.values)
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
        E Capability&Mechanism  (E+改行+タグ+改行+F+改行+タグ)
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

    merged = (
        capability
        + "\n<<mechanism to realize the capability>>\n"
        + mechanism
        + "\n<<mechanism realized by grainest coding scheme>>"
    )

    new_df = pd.DataFrame()

    for i in range(4):
        new_df[df.columns[i]] = df.iloc[:, i].values

    new_df["Capability&Mechanism"] = merged.values

    for i in range(6, len(df.columns)):
        new_df[df.columns[i]] = df.iloc[:, i].values

    return new_df


if __name__ == "__main__":
    main()
