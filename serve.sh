#!/usr/bin/env bash
# Serve the Campus Map locally. Required because Chrome blocks file:// JSX fetches.
cd "$(dirname "$0")"
PORT="${PORT:-8092}"
echo "Open http://localhost:${PORT}/"
exec python3 -m http.server "$PORT"
