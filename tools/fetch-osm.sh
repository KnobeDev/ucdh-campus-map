#!/usr/bin/env bash
# Refresh ucdh-data/osm-sac.json from Overpass.
#
#   ./tools/fetch-osm.sh
#
# Downloads to a temp file and only replaces the cache once the response parses
# as JSON and carries a plausible element count. Overpass answers rate limits
# with an HTTP 200 *HTML* page, so a naive `curl -o` silently destroys the
# cache — which is exactly what happened on 2026-09-09.
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="ucdh-data/osm-sac.json"
TMP="$(mktemp -t osm-sac.XXXXXX.json)"
trap 'rm -f "$TMP"' EXIT

# Map extent plus ~200 m of margin on every side, so buildings that sit right on
# the map edge (MIND Institute, Aggie Square, Regenerative Cures) still have a
# footprint to match against.
BBOX="38.5435,-121.4655,38.5605,-121.4400"

read -r -d '' QUERY <<EOF || true
[out:json][timeout:150];
(
  way["building"]($BBOX);
  way["highway"]($BBOX);
  way["amenity"="parking"]($BBOX);
  way["leisure"]($BBOX);
  way["landuse"]($BBOX);
  node["highway"="bus_stop"]($BBOX);
);
out geom;
EOF

# kumi first: overpass-api.de rate-limits aggressively from a single host.
ENDPOINTS=(
  "https://overpass.kumi.systems/api/interpreter"
  "https://overpass-api.de/api/interpreter"
  "https://overpass.osm.jp/api/interpreter"
)

for ep in "${ENDPOINTS[@]}"; do
  echo "→ $ep"
  if ! curl -sS --max-time 240 -X POST "$ep" --data-urlencode "data=$QUERY" -o "$TMP"; then
    echo "  request failed, trying next endpoint" >&2
    sleep 5
    continue
  fi
  count=$(python3 - "$TMP" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as fh:
        print(len(json.load(fh)["elements"]))
except Exception:
    print(-1)
PY
)
  if [ "$count" -lt 500 ]; then
    echo "  bad response (${count} elements — rate limit or error page), trying next endpoint" >&2
    head -c 200 "$TMP" >&2; echo >&2
    sleep 10
    continue
  fi
  mv "$TMP" "$DEST"
  echo "✓ wrote $DEST — $count elements"
  echo "  Remember: bbox and retrieval date are recorded in ucdh-data/SOURCES.md."
  exit 0
done

echo "✗ every endpoint failed; $DEST left untouched" >&2
exit 1
