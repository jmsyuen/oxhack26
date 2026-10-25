"""Slim Natural Earth 1:110m countries to {iso3, name} polygons for the choropleth."""
import json, os
HERE = os.path.dirname(__file__)
g = json.load(open(os.path.join(HERE, 'raw', 'countries110.geojson')))
r = lambda c: [round(c[0], 2), round(c[1], 2)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
feats = []
for f in g['features']:
    p = f['properties']
    if p['ADM0_A3'] == 'ATA': continue
    feats.append({'type': 'Feature', 'id': len(feats), 'properties': {'iso3': p['ADM0_A3'], 'name': p['NAME']},
                  'geometry': {'type': f['geometry']['type'], 'coordinates': r(f['geometry']['coordinates'])}})
json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(HERE, '..', 'public', 'data', 'countries.geojson'), 'w'), separators=(',', ':'))
print('countries', len(feats))
