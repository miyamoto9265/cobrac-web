#!/usr/bin/env bash
# 本文のフォントを npm レジストリから .fonts/ に取得する（コミットしない）。
# Noto Sans JP は分割されていない TTF（400・700・800）を使う。Unicode の範囲ごとに分かれた woff2 を使うと、
# 文字ごとにフォントが切り替わって PDF が数倍に膨らむため。JetBrains Mono（等幅）は fontsource の版を使う。
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .fonts && cd .fonts
if [ ! -d noto-sans-jp-ttf ]; then
  tgz="$(npm pack @expo-google-fonts/noto-sans-jp@0.4.4 --silent)"
  mkdir -p noto-sans-jp-ttf
  tar xzf "$tgz" -C noto-sans-jp-ttf --strip-components=2 \
    package/400Regular/NotoSansJP_400Regular.ttf package/700Bold/NotoSansJP_700Bold.ttf package/800ExtraBold/NotoSansJP_800ExtraBold.ttf \
    package/LICENSE_FONT
  rm -f "$tgz"
fi
for pkg in @fontsource/jetbrains-mono@5.3.0; do
  dir="$(echo "$pkg" | sed -E 's#^@fontsource(-variable)?/##; s#@.*##')"
  [ -d "$dir" ] && continue
  tgz="$(npm pack "$pkg" --silent)"
  mkdir -p "$dir" && tar xzf "$tgz" -C "$dir" --strip-components=1 && rm -f "$tgz"
done
ls
