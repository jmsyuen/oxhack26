"""
Build SEED trade flows + country metadata + chokepoint metadata.

  python build_trade_seed.py

Bilateral flows are estimated with a doubly-constrained gravity model (IPF) on top of the
SEED totals in seed_economies.py, using sea distance from the network. This is a stand-in
for CEPII BACI; run build_trade_baci.py with a real BACI download to replace flows.json
with OBSERVED data (same output schema).
"""
import json, os, math
import numpy as np, pandas as pd, networkx as nx
from seed_economies import C, LAND_BLOCS, EXTRA_LAND, AFFINITY, ENERGY_AFFINITY, GDP_FALLBACK

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', 'public', 'data')
COMMODITIES = [
    # id, label, extra cost per day as fraction of cargo value (freight + fuel + inventory carry),
    # typical cargo value per laden voyage in MUSD (converts value flows into ship-equivalents)
    ('crude',   'Crude oil',                 0.0006, 150),
    ('gas',     'LNG & gas',                 0.0008,  60),
    ('refined', 'Refined fuels',             0.0006,  45),
    ('food',    'Grain & food',              0.0008,  20),
    ('manuf',   'Manufactured goods',        0.0003, 350),
    ('metals',  'Ores, metals & coal',       0.0012,  15),
    ('chem',    'Chemicals & fertiliser',    0.0005,  30),
    ('vehicles','Vehicles & parts',          0.0004, 100),
]
ENERGY = {0, 1, 2}; BULK = {3, 5}
DIST_ELASTICITY = [0.9, 0.9, 1.0, 1.0, 1.0, 0.9, 1.0, 1.0]
WORLD_GOODS_EXPORTS_BN = 23800  # WTO 2023 merchandise exports, used only for the coverage report
MIN_FLOW_MUSD = 20

def main():
    net = json.load(open(os.path.join(OUT, 'network.json')))
    G = nx.Graph()
    for e in net['edges']: G.add_edge(e['a'], e['b'], w=e['nm'])
    isos = list(C.keys()); n = len(isos)
    main_port = {i: max(C[i]['ports'].items(), key=lambda kv: kv[1])[0] for i in isos}
    D = np.zeros((n, n))
    for a, ia in enumerate(isos):
        dist = nx.single_source_dijkstra_path_length(G, main_port[ia], weight='w')
        for b, ib in enumerate(isos):
            D[a, b] = max(300.0, dist[main_port[ib]]) if a != b else np.inf

    land = set()
    for bloc in LAND_BLOCS:
        for a in bloc:
            for b in bloc:
                if a != b: land.add((a, b))
    for a, b in EXTRA_LAND: land.add((a, b)); land.add((b, a))

    flows = []
    for k in range(8):
        X = np.array([C[i]['x'] * C[i]['xs'][k] / sum(C[i]['xs']) for i in isos])
        M = np.array([C[i]['m'] * C[i]['ms'][k] / sum(C[i]['ms']) for i in isos])
        if X.sum() == 0 or M.sum() == 0: continue
        M = M * X.sum() / M.sum()
        S = np.zeros((n, n))
        for a in range(n):
            for b in range(n):
                if a == b: continue
                aff = AFFINITY.get((isos[a], isos[b]), 1.0)
                if k in ENERGY: aff *= ENERGY_AFFINITY.get((isos[a], isos[b]), 1.0)
                S[a, b] = aff / (D[a, b] ** DIST_ELASTICITY[k])
        F = S.copy()
        for _ in range(200):
            r = F.sum(1); F *= np.where(r > 0, X / np.where(r > 0, r, 1), 0)[:, None]
            c = F.sum(0); F *= np.where(c > 0, M / np.where(c > 0, c, 1), 0)[None, :]
        for a in range(n):
            for b in range(n):
                v = F[a, b] * 1000  # bn -> m USD
                if v >= MIN_FLOW_MUSD and (isos[a], isos[b]) not in land:
                    flows.append([a, b, k, round(v, 1)])

    gdp = pd.read_csv(os.path.join(HERE, 'raw', 'gdp.csv'))
    countries = []
    for i in isos:
        d = gdp[gdp['Country Code'] == i].sort_values('Year')
        if len(d):
            g, y, src = float(d.iloc[-1]['Value']), int(d.iloc[-1]['Year']), 'World Bank'
        else:
            g, y, src = GDP_FALLBACK[i]
        c = C[i]
        countries.append(dict(iso3=i, name=c['n'], gdpUsd=round(g), gdpYear=y, gdpSource=src,
                              exportsBn=c['x'], importsBn=c['m'],
                              ports=c['ports'], eports=c.get('eports'), bports=c.get('bports'),
                              bypass=c.get('bypass', [])))
    tot = sum(f[3] for f in flows) / 1000
    covered = sum(C[i]['x'] for i in isos)
    out = dict(
        commodities=[dict(id=a, label=b, costPerDayShare=c, cargoMusdPerShip=d) for a, b, c, d in COMMODITIES],
        energy=sorted(ENERGY), bulk=sorted(BULK),
        countries=isos, flows=flows,
        coverage=dict(economies=n, coveredExportsBn=covered,
                      worldExportsBn=WORLD_GOODS_EXPORTS_BN,
                      coveredShareOfWorld=round(covered / WORLD_GOODS_EXPORTS_BN, 3),
                      maritimeFlowsBn=round(tot), flowCount=len(flows),
                      note='Bilateral matrix among covered economies only; land-neighbour pairs removed.'))
    json.dump(out, open(os.path.join(OUT, 'flows.json'), 'w'), separators=(',', ':'))
    json.dump(countries, open(os.path.join(OUT, 'countries.json'), 'w'), indent=1)
    print(json.dumps(out['coverage'], indent=1))
    by_k = {}
    for f in flows: by_k[f[2]] = by_k.get(f[2], 0) + f[3] / 1000
    for k, v in sorted(by_k.items()): print(COMMODITIES[k][0], round(v))

if __name__ == '__main__':
    main()
