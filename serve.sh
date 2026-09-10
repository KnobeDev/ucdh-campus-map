#!/usr/bin/env bash
# Serve the Campus Map locally. Required because Chrome blocks file:// JSX fetches.
# serve.py = static files + the 3D map's tour/event session API. Any static server
# still serves the maps; only live tours need serve.py.
cd "$(dirname "$0")"
PORT="${PORT:-8092}"
echo "Open http://localhost:${PORT}/  (3D: /3d/)"
exec python3 serve.py "$PORT"
