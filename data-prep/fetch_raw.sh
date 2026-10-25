#!/usr/bin/env bash
# Downloads the small public inputs used by the build scripts into data-prep/raw/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw
curl -fsSL -o raw/countries110.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
curl -fsSL -o raw/land50.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
curl -fsSL -o raw/gdp.csv https://raw.githubusercontent.com/datasets/gdp/main/data/gdp.csv
echo "Fetched Natural Earth (countries 1:110m, land 1:50m) and World Bank GDP into data-prep/raw/"
