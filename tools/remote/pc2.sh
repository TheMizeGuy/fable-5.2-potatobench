#!/bin/bash
# Runs a check on the Windows box mizepc2 instead of this laptop: copies this working tree there, builds it,
# runs one command in it, and optionally brings a folder of results back.
# Usage: tools/remote/pc2.sh <name> '<command, cmd.exe syntax>' [<remote out dir, relative> <local out dir>]
# Example: tools/remote/pc2.sh hud 'node tools/remote/with-preview.mjs node tools/quality/capture.ts {url} out/frames' out/frames /tmp/frames
set -euo pipefail
name="$1"; cmd="$2"; rout="${3:-}"; lout="${4:-}"
root="$(git rev-parse --show-toplevel)"
dir="W:\\county-work\\$name"
ssh -o BatchMode=yes mizepc2 "(if not exist \"$dir\" mkdir \"$dir\") && type nul > \"$dir\\.pc2-run\""
# Run folders are scratch and nothing else clears them: each run first removes the others that nothing has written to for 12 hours.
prune='$cut=(Get-Date).AddHours(-12); Get-ChildItem W:\county-work -Directory | Where-Object Name -ne "'"$name"'" | ForEach-Object { $d=$_.FullName; $t=(@($_.CreationTime)+@(Get-ChildItem -LiteralPath $d,"$d\out","$d\test-results" -Force -ErrorAction SilentlyContinue | ForEach-Object LastWriteTime) | Measure-Object -Maximum).Maximum; if($t -lt $cut){ cmd /c rd /s /q "\\?\$d" } }'
ssh -o BatchMode=yes mizepc2 "powershell -NoProfile -EncodedCommand $(printf '%s' "$prune" | iconv -t UTF-16LE | base64 | tr -d '\n')" >/dev/null 2>&1 || true
tar -C "$root" --exclude node_modules --exclude dist --exclude .git --exclude .claude --exclude test-results --exclude 'data/raw' -cf - . | ssh -o BatchMode=yes mizepc2 "tar -xf - -C \"$dir\""
ssh -o BatchMode=yes -o ServerAliveInterval=30 mizepc2 "cd /d \"$dir\" && (if not exist node_modules npm ci --no-audit --no-fund >nul 2>&1) && npm run build >build.log 2>&1 && $cmd"
if [ -n "$rout" ] && [ -n "$lout" ]; then
  mkdir -p "$lout"
  scp -q -r "mizepc2:W:/county-work/$name/$rout/." "$lout/"
fi
