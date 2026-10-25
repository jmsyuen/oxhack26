"""Build public/data/network.json from network_def.py (run once, offline)."""
import json, os
from network_def import NODES, E
from geo_util import gc_interp

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
os.makedirs(OUT, exist_ok=True)

def build():
    nodes = [{"id": k, "name": v[0], "lon": v[1], "lat": v[2], "kind": v[3]} for k, v in NODES.items()]
    edges = []
    for i, (a, b) in enumerate(E):
        coords, nm = gc_interp(NODES[a][1:3], NODES[b][1:3], 60)
        edges.append({"id": i, "a": a, "b": b, "nm": round(nm, 1), "coords": coords})
    return {"nodes": nodes, "edges": edges}

if __name__ == '__main__':
    net = build()
    json.dump(net, open(os.path.join(OUT, 'network.json'), 'w'), separators=(',', ':'))
    print('nodes', len(net['nodes']), 'edges', len(net['edges']),
          'total nm', round(sum(e['nm'] for e in net['edges'])))
