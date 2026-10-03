#!/bin/sh
# Run by the mock model as the agent's command inside the worker image. Tries what a misused agent would try and
# writes one line per attempt to $1 ("ok <what>" when the attempt was blocked, "LEAK <what>" when it succeeded).
out="$1"
sentinels=/tmp/image-check/sentinels
: > "$out"
blocked() { echo "ok $1" >> "$out"; }
leaked() { echo "LEAK $1" >> "$out"; }

# environment of every other process (the worker is PID 1; Codex, its MCP servers and helpers are its children)
for p in /proc/[0-9]*; do
  pid="${p#/proc/}"
  [ "$pid" = "$$" ] && continue
  comm="$(cat "$p/comm" 2>/dev/null)"
  if tr '\0' '\n' < "$p/environ" 2>/dev/null | grep -qF -f "$sentinels"; then
    which="$(tr '\0' '\n' < "$p/environ" 2>/dev/null | grep -F -f "$sentinels" | sed 's/=.*//' | sort -u | tr '\n' ',')"
    cmd="$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)"
    exe="$(readlink "$p/exe" 2>/dev/null)"
    leaked "environ of pid $pid ($comm) vars=[$which] exe=$exe cmd=[$cmd]"
  fi
done
if cat /proc/1/environ > /dev/null 2>&1; then leaked "/proc/1/environ is readable"; else blocked "/proc/1/environ"; fi
codex_pid="$(for p in /proc/[0-9]*; do [ "$(cat "$p/comm" 2>/dev/null)" = codex ] && echo "${p#/proc/}"; done | head -n 1)"
if [ -z "$codex_pid" ]; then leaked "no codex process found (the probe must run as a Codex command)"
elif cat "/proc/$codex_pid/environ" > /dev/null 2>&1; then leaked "/proc/$codex_pid/environ (codex) is readable"
else blocked "/proc/$codex_pid/environ (codex)"; fi
if head -c 1 /proc/1/mem > /dev/null 2>&1; then leaked "/proc/1/mem"; else blocked "/proc/1/mem"; fi
if env | grep -qF -f "$sentinels"; then leaked "own environment"; else blocked "own environment"; fi
if grep -rqF -f "$sentinels" /work/codex-home 2>/dev/null; then leaked "a file under /work/codex-home"; else blocked "files under /work/codex-home"; fi

# the binaries and the code that run with the secrets
node_bin="$(command -v node)"
codex_bin="$(ls /app/node_modules/@openai/codex-linux-*/vendor/*/bin/codex)"
for f in "$node_bin" "$codex_bin"; do
  if head -c 1 "$f" > /dev/null 2>&1; then leaked "$f is readable"; else blocked "read $f"; fi
  if chmod u+r "$f" 2>/dev/null; then leaked "chmod $f"; else blocked "chmod $f"; fi
done
if cp /bin/true "$codex_bin" 2>/dev/null; then leaked "overwrite $codex_bin"; else blocked "overwrite $codex_bin"; fi
if mv "$(dirname "$codex_bin")" /tmp/moved-codex-bin 2>/dev/null; then leaked "move the Codex bin directory"; else blocked "move the Codex bin directory"; fi
if echo "//" >> /app/worker/codex.js 2>/dev/null; then leaked "write /app/worker/codex.js"; else blocked "write /app/worker"; fi

# Codex config layers that could add an MCP server, a hook or a notify command running with Codex's environment
for f in /work/codex-home/config.toml /work/codex-home/hooks.json /work/codex-home/requirements.toml /work/codex-home/AGENTS.md /work/.codex/config.toml /work/.codex/hooks.json; do
  if echo "# probe" >> "$f" 2>/dev/null; then leaked "write $f"; else blocked "write $f"; fi
done
for d in /work/codex-home /work/.codex; do
  if mv "$d" "$d.moved" 2>/dev/null; then leaked "rename $d"; else blocked "rename $d"; fi
done
if rm -f /work/codex-home/config.toml 2>/dev/null && [ ! -e /work/codex-home/config.toml ]; then leaked "delete /work/codex-home/config.toml"; else blocked "delete /work/codex-home/config.toml"; fi
echo done >> "$out"
