"""
Replace SEED trade flows with OBSERVED CEPII BACI flows (same output schema as build_trade_seed.py).

1. Download BACI (HS17 or HS22 nomenclature, latest year) from
   https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37
   Unzip BACI_HSxx_Yyyyy_Vzzzz.csv and country_codes_Vzzzz.csv into data-prep/raw/.
2. python build_trade_baci.py --baci raw/BACI_HS17_Y2023_V202501.csv --codes raw/country_codes_V202501.csv
3. python build_meta.py   (flips the trade badge to OBSERVED)

BACI columns: t (year), i (exporter code), j (importer code), k (HS6 product), v (value, thousand USD),
q (tonnes). The script stops with a clear message if the files do not look like that.

Coverage is the 49 economies in seed_economies.py (their port mappings live there). Flows are aggregated
to 8 groups; pipeline gas (HS 271121) and goods that do not move by sea (electricity, aircraft, ships,
works of art, gold and precious stones) are excluded. Land-neighbour pairs are dropped as in the seed.
"""
import argparse, json, os, sys
import pandas as pd
from seed_economies import C, LAND_BLOCS, EXTRA_LAND
from build_trade_seed import COMMODITIES, ENERGY, BULK, WORLD_GOODS_EXPORTS_BN, MIN_FLOW_MUSD

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', 'public', 'data', 'flows.json')

def group(hs6: str):
    """HS6 code -> commodity index (or None to exclude)."""
    ch, h4 = int(hs6[:2]), hs6[:4]
    if h4 == '2709': return 0
    if h4 == '2711': return None if hs6 in ('271121', '271129') else 1   # pipeline gas excluded
    if h4 == '2710' or h4 in ('2706', '2707', '2708', '2712', '2713', '2714', '2715'): return 2
    if h4 == '2716': return None                                          # electricity
    if 1 <= ch <= 24: return 3
    if ch in (25, 26) or h4 in ('2701', '2702', '2703', '2704', '2705') or ch == 72 or 74 <= ch <= 81: return 5
    if 28 <= ch <= 38: return 6
    if ch == 87: return 7
    if ch in (71, 88, 89, 97, 99): return None                            # gold/gems by air; aircraft & ships deliver themselves
    return 4

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--baci', required=True)
    ap.add_argument('--codes', required=True)
    a = ap.parse_args()
    codes = pd.read_csv(a.codes, encoding='latin-1')
    lc = {c.lower(): c for c in codes.columns}
    code_col = lc.get('country_code')
    iso_col = lc.get('country_iso3') or lc.get('iso_3digit_alpha')
    if not code_col or not iso_col:
        sys.exit(f"country codes file: expected country_code + country_iso3 (or iso_3digit_alpha). Found {list(codes.columns)}")
    code2iso = dict(zip(codes[code_col].astype(int), codes[iso_col].astype(str)))
    isos = list(C.keys()); idx = {iso: n for n, iso in enumerate(isos)}
    land = set()
    for bloc in LAND_BLOCS:
        for x in bloc:
            for y in bloc:
                if x != y: land.add((x, y))
    for x, y in EXTRA_LAND: land.add((x, y)); land.add((y, x))

    head = pd.read_csv(a.baci, nrows=5)
    if not {'t', 'i', 'j', 'k', 'v'} <= set(head.columns):
        sys.exit(f"BACI file: expected columns t,i,j,k,v. Found {list(head.columns)}")
    agg = {}
    year = None
    for chunk in pd.read_csv(a.baci, usecols=['t', 'i', 'j', 'k', 'v'], dtype={'k': str}, chunksize=2_000_000):
        year = int(chunk['t'].iloc[0])
        chunk['ei'] = chunk['i'].map(code2iso).map(idx)
        chunk['ii'] = chunk['j'].map(code2iso).map(idx)
        chunk = chunk.dropna(subset=['ei', 'ii'])
        chunk['g'] = chunk['k'].str.zfill(6).map(group)
        chunk = chunk.dropna(subset=['g'])
        for (ei, ii, g), v in chunk.groupby(['ei', 'ii', 'g'])['v'].sum().items():
            key = (int(ei), int(ii), int(g))
            agg[key] = agg.get(key, 0.0) + float(v) / 1000.0  # thousand USD -> million USD
    flows = [[e, i, g, round(v, 1)] for (e, i, g), v in agg.items()
             if v >= MIN_FLOW_MUSD and e != i and (isos[e], isos[i]) not in land]
    covered = sum(v for (e, i, g), v in agg.items() if e != i) / 1000
    tot = sum(f[3] for f in flows) / 1000
    out = dict(
        source='BACI', year=year,
        commodities=[dict(id=x, label=y, costPerDayShare=c, cargoMusdPerShip=d) for x, y, c, d in COMMODITIES],
        energy=sorted(ENERGY), bulk=sorted(BULK), countries=isos, flows=flows,
        coverage=dict(economies=len(isos), coveredExportsBn=round(covered), worldExportsBn=WORLD_GOODS_EXPORTS_BN,
                      coveredShareOfWorld=round(covered / WORLD_GOODS_EXPORTS_BN, 3), maritimeFlowsBn=round(tot),
                      flowCount=len(flows), note=f'CEPII BACI {year}; flows among covered economies; land-neighbour pairs removed.'))
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    print(json.dumps(out['coverage'], indent=1))
    print('wrote', OUT, '- now run: python build_meta.py')

if __name__ == '__main__':
    main()
