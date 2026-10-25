"""Compare network shortest paths with the searoute library (pip install searoute). Run after build_network.py."""
import json, os
import networkx as nx
import searoute as sr

net = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'network.json')))
N = {n['id']: n for n in net['nodes']}
G = nx.Graph()
for e in net['edges']:
    pen = 500 if {'CP_SUEZ', 'CP_PANAMA'} & {e['a'], e['b']} else 0
    G.add_edge(e['a'], e['b'], w=e['nm'] + pen, nm=e['nm'])
PAIRS = [('P_SHANGHAI', 'P_ROTTERDAM'), ('P_SINGAPORE', 'P_ROTTERDAM'), ('P_MUMBAI', 'P_ROTTERDAM'), ('P_SHANGHAI', 'P_HAMBURG'),
         ('P_RASTANURA', 'P_YOKOHAMA'), ('P_SHANGHAI', 'P_NEWYORK'), ('P_HOUSTON', 'P_YOKOHAMA'), ('P_SHANGHAI', 'P_LOSANGELES'),
         ('P_SANTOS', 'P_SHANGHAI'), ('P_HEDLAND', 'P_SHANGHAI'), ('P_RASLAFFAN', 'P_BUSAN'), ('P_ROTTERDAM', 'P_NEWYORK')]
print(f"{'route':<28}{'network nm':>12}{'searoute nm':>13}{'diff':>8}")
for a, b in PAIRS:
    p = nx.shortest_path(G, a, b, weight='w')
    nm = sum(G[p[i]][p[i + 1]]['nm'] for i in range(len(p) - 1))
    r = sr.searoute([N[a]['lon'], N[a]['lat']], [N[b]['lon'], N[b]['lat']], units='naut')['properties']['length']
    print(f"{N[a]['name'][:12]+' → '+N[b]['name'][:12]:<28}{nm:>12.0f}{r:>13.0f}{(nm / r - 1) * 100:>7.1f}%")
