#!/bin/bash
# Runs a check on the Windows box mizepc2 instead of this laptop: copies this working tree there, builds it,
# runs one command in it, and optionally brings a folder of results back.
# Usage: tools/remote/pc2.sh <name> '<command, cmd.exe syntax>' [<remote out dir, relative> <local out dir>]
# Example: tools/remote/pc2.sh hud 'node tools/remote/with-preview.mjs node tools/quality/capture.ts {url} out/frames' out/frames /tmp/frames
set -euo pipefail
name="$1"; cmd="$2"; rout="${3:-}"; lout="${4:-}"
root="$(git rev-parse --show-toplevel)"
dir="W:\\county-work\\$name"
ssh -o BatchMode=yes mizepc2 "if not exist \"$dir\" mkdir \"$dir\""
tar -C "$root" --exclude node_modules --exclude dist --exclude .git --exclude .claude --exclude test-results --exclude 'data/raw' -cf - . | ssh -o BatchMode=yes mizepc2 "tar -xf - -C \"$dir\""
ssh -o BatchMode=yes -o ServerAliveInterval=30 mizepc2 "cd /d \"$dir\" && (if not exist node_modules npm ci --no-audit --no-fund >nul 2>&1) && npm run build >build.log 2>&1 && $cmd"
if [ -n "$rout" ] && [ -n "$lout" ]; then
  mkdir -p "$lout"
  scp -q -r "mizepc2:W:/county-work/$name/$rout/." "$lout/"
fi
