#!/usr/bin/env bash
# 本文のフォント（Noto Sans JP の静的ウェイト・JetBrains Mono）を npm レジストリから .fonts/ に取得する（コミットしない）
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .fonts && cd .fonts
for pkg in @fontsource/noto-sans-jp@5.3.0 @fontsource/jetbrains-mono@5.3.0; do
  dir="$(echo "$pkg" | sed -E 's#^@fontsource(-variable)?/##; s#@.*##')"
  [ -d "$dir" ] && continue
  tgz="$(npm pack "$pkg" --silent)"
  mkdir -p "$dir" && tar xzf "$tgz" -C "$dir" --strip-components=1 && rm -f "$tgz"
done
ls
