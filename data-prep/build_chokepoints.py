"""Chokepoint metadata. shipsPerDay values are SEED approximations of 2023 PortWatch daily
averages; build_portwatch.py overwrites them (and adds history) from a real PortWatch export."""
import json, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
CPS = [
    ('suez', 'Suez Canal', 'CP_SUEZ', 71), ('bab', 'Bab el-Mandeb', 'CP_BAB', 72),
    ('hormuz', 'Strait of Hormuz', 'CP_HORMUZ', 105), ('malacca', 'Strait of Malacca', 'CP_MALACCA', 230),
    ('panama', 'Panama Canal', 'CP_PANAMA', 34), ('cape', 'Cape of Good Hope', 'CP_CAPE', 55),
    ('gibraltar', 'Strait of Gibraltar', 'CP_GIBRALTAR', 280), ('bosporus', 'Bosporus Strait', 'CP_BOSPORUS', 115),
    ('dover', 'Dover Strait', 'CP_DOVER', 290),
]
if __name__ == '__main__':
    net = json.load(open(os.path.join(OUT, 'network.json')))
    pos = {n['id']: (n['lon'], n['lat']) for n in net['nodes']}
    out = [dict(id=i, name=nm, node=node, lon=pos[node][0], lat=pos[node][1], shipsPerDay=s,
                shipsSource='seed', history=None) for i, nm, node, s in CPS]
    json.dump(out, open(os.path.join(OUT, 'chokepoints.json'), 'w'), indent=1)
    print('chokepoints', len(out))
