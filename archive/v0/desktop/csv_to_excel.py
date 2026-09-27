"""
CoBRAC CSV → xlsx 変換スクリプト
複数のCSVファイルを加工して1つのxlsxファイルに統合する。

使い方:
    python csv_to_excel.py.py
Project ID に対応する {ProjectName}/{ProjectName}_CSV/ フォルダから以下のCSVを読み込む:
    Project.csv, References.csv, Circuits.csv, Connections.csv, FRG.csv
Contributor と Project ID は実行時にユーザー入力する。
Project.csv の A2 / B2 には入力値を設定して xlsx に出力する。
出力: {ProjectName}/{ProjectName}_CSV/{ProjectID}.bra.xlsx
"""

import os
import sys
import pandas as pd


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))

    print("=== CoBRAC CSV → xlsx 変換 ===\n")
    contributor = input("Contributor を入力してください: ").strip()
    project_id  = input("Project ID を入力してください: ").strip()

    if not contributor or not project_id:
        print("エラー: Contributor と Project ID は必須です。")
        sys.exit(1)

    print("\n各CSVを処理中...")

    csv_dir = os.path.join(script_dir, project_id, f"{project_id}_CSV")
    if not os.path.isdir(csv_dir):
        print(f"エラー: CSVフォルダが見つかりません: {csv_dir}")
        sys.exit(1)

    project_df = process_project(csv_dir, contributor, project_id)

    references_df  = process_references(csv_dir)
    circuits_df    = process_circuits(csv_dir, contributor, project_id)
    connections_df = process_connections(csv_dir, contributor, project_id)
    frg_df         = process_frg(csv_dir)

    output_file = os.path.join(csv_dir, f"{project_id}.bra.xlsx")

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

    # D, E, F 列を位置 3 に順次挿入
    df.insert(3, "Sub-Circuits", [""] * n)
    df.insert(4, "Super Class",  [""] * n)
    df.insert(5, "Uniform",      [True] * n)
    # 現在: [0]A [1]B [2]C [3]D(Sub-Circuits) [4]E(Super Class) [5]F(Uniform)
    #        [6]G(Transmitter) [7]H(Modulation Type) [8]I(Comments)

    # I, J, K 列を位置 8 (Comments の直前) に順次挿入
    df.insert(8,  "Size",                 [""] * n)
    df.insert(9,  "Output Semantics (0)", [""] * n)
    df.insert(10, "Physiological Data",   [""] * n)
    # 現在: ...[8]I(Size) [9]J(Output Semantics) [10]K(Physiological Data) [11]L(Comments)

    # M, N 列を末尾に追加
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

    # 挿入前に元の sCID / rCID 列を保存
    scid_col = df.iloc[:, 0].copy()
    rcid_col = df.iloc[:, 1].copy()

    # B(1): sCID relation = "="
    df.insert(1, "sCID relation", ["="] * n)

    # C(2): Notation of sCID in Literature = 元 A のコピー
    df.insert(2, "Notation of sCID in Literature", scid_col.values)
    # 現在: A(0)sCID B(1)sCID_rel C(2)Notation_sCID D(3)rCID ...

    # E(4): rCID relation = "="
    df.insert(4, "rCID relation", ["="] * n)

    # F(5): Notation of rCID in Literature = 元 B のコピー
    df.insert(5, "Notation of rCID in Literature", rcid_col.values)

    # G(6): Size = 空欄
    df.insert(6, "Size", [""] * n)
    # 現在: A(0)sCID B(1) C(2) D(3)rCID E(4) F(5) G(6)Size
    #        H(7)Comments I(8)Reference ID J(9)Taxon K(10)Method
    #        L(11)Pointers_lit M(12)Pointers_fig

    # N, O, P を末尾に追加
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

    # 新しいDataFrameを列の順序を保って構築
    new_df = pd.DataFrame()
    
    # A〜D列をコピー
    for i in range(4):
        new_df[df.columns[i]] = df.iloc[:, i].values
    
    # E列として結合列を追加
    new_df["Capability&Mechanism"] = merged.values
    
    # 元のG列以降（index 6以降）を順に追加
    for i in range(6, len(df.columns)):
        new_df[df.columns[i]] = df.iloc[:, i].values

    return new_df


if __name__ == "__main__":
    main()
