import { DocReader } from "../components/DocReader";
import { useT } from "../i18n";
import { APP_BUILD_TIME, APP_VERSION_LABEL } from "../lib/version";
import changelog from "../../../../CHANGELOG.md?raw";

/** For readers of the app: no [Unreleased] section and no maintainer instructions, and `## v0.22.0 · 2026-10-04` headings. */
export function releaseNotesText(md: string): string {
  return md
    .replace(/^## \[Unreleased\][\s\S]*?(?=^## \[)/m, "")
    .replace(/^Accumulate changes under .*\n?/m, "")
    .replace(/^## \[(\d+\.\d+\.\d+)\](?: - (\S+))?\s*$/gm, (_, v: string, d?: string) => `## v${v}${d ? ` · ${d}` : ""}`);
}

const TEXT = releaseNotesText(changelog);

/** The release notes (CHANGELOG.md, bundled at build time), for every signed-in user. */
export function ReleaseNotesPage() {
  const t = useT();
  return (
    <DocReader
      docKey="CHANGELOG"
      text={TEXT}
      navTitle={t("releases.title")}
      navFooter={
        <div className="mt-6 px-3 text-[11px] text-slate-400">
          {APP_VERSION_LABEL}
          {APP_BUILD_TIME && <div>build {APP_BUILD_TIME.replace("T", " ").slice(0, 16)} UTC</div>}
        </div>
      }
    />
  );
}
