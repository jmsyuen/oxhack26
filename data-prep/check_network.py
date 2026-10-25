import json, sys
from shapely.geometry import shape, LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
from network_def import NODES, E
from geo_util import gc_interp
import networkx as nx

land = json.load(open('raw/land50.geojson'))
polys = [shape(f['geometry']) for f in land['features']]
tree = STRtree(polys)

bad = []
seen = set()
for a, b in E:
    assert a in NODES and b in NODES, (a, b)
    k = tuple(sorted((a, b)))
    if k in seen: print('dup', k)
    seen.add(k)
    pa = NODES[a][1:3]; pb = NODES[b][1:3]
    coords, d = gc_interp(pa, pb, 20)
    # normalise for land test (shift into [-180,180])
    def norm(c): return [((c[0]+180) % 360) - 180, c[1]]
    segs = []
    cur = [norm(coords[0])]
    for c in coords[1:]:
        n = norm(c)
        if abs(n[0]-cur[-1][0]) > 180:
            segs.append(cur); cur = [n]
        else: cur.append(n)
    segs.append(cur)
    tot = 0.0
    for s in segs:
        if len(s) < 2: continue
        ls = LineString(s)
        for i in tree.query(ls):
            inter = ls.intersection(polys[i])
            if not inter.is_empty:
                tot += inter.length * 60  # deg -> approx nm
    if tot > 4:
        bad.append((round(tot,1), a, b))
for x in sorted(bad, reverse=True): print('LAND', x)
G = nx.Graph(); G.add_edges_from(E)
print('nodes', len(NODES), 'edges', len(E), 'connected', nx.is_connected(G))
iso = [n for n in NODES if n not in G]
print('isolated', iso)
