"""Write public/data/datasets.json: provenance for every bundled dataset (drives UI badges)."""
import json, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
flows = json.load(open(os.path.join(OUT, 'flows.json')))
cps = json.load(open(os.path.join(OUT, 'chokepoints.json')))
countries = json.load(open(os.path.join(OUT, 'countries.json')))
trade_obs = flows.get('source') == 'BACI'
pw_obs = all(c['shipsSource'] == 'portwatch' for c in cps)
gdp_years = sorted({c['gdpYear'] for c in countries})
D = [
  dict(id='trade', label='Bilateral trade flows', status='OBSERVED' if trade_obs else 'SEED',
       source='CEPII BACI' if trade_obs else 'Gravity-model estimate from approximate 2023 national totals (data-prep/seed_economies.py)',
       vintage=flows.get('year', '2023 (approx.)'),
       note='Replace with CEPII BACI via data-prep/build_trade_baci.py' if not trade_obs else 'HS6 aggregated to 8 groups'),
  dict(id='portwatch', label='Chokepoint transits', status='OBSERVED' if pw_obs else 'SEED',
       source='IMF PortWatch' if pw_obs else 'Approximate 2023 daily averages (data-prep/build_chokepoints.py)',
       vintage='daily' if pw_obs else '2023 (approx.)',
       note='Replace via data-prep/build_portwatch.py' if not pw_obs else ''),
  dict(id='gdp', label='GDP (current USD)', status='OBSERVED', source='World Bank via datasets/gdp (GitHub mirror)',
       vintage=f'{gdp_years[0]}–{gdp_years[-1]}', note='Taiwan from IMF WEO (not in World Bank data)'),
  dict(id='network', label='Sea-lane network', status='MODELLED',
       source='230 nodes / 294 lanes, great-circle legs between hand-placed waypoints; land-checked against Natural Earth 1:50m; port-to-port totals within ~2–5% of searoute',
       vintage='built offline', note=''),
]
json.dump(D, open(os.path.join(OUT, 'datasets.json'), 'w'), indent=1)
print([ (d['id'], d['status']) for d in D])
