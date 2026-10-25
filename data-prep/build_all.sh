#!/usr/bin/env bash
# Rebuild every bundled dataset in public/data from scratch (SEED trade + seed transits).
# For OBSERVED data, run build_trade_baci.py / build_portwatch.py afterwards, then build_meta.py.
set -euo pipefail
cd "$(dirname "$0")"
[ -f raw/land50.geojson ] || ./fetch_raw.sh
python3 check_network.py
python3 build_network.py
python3 build_countries_geojson.py
python3 build_trade_seed.py
python3 build_chokepoints.py
python3 build_meta.py
