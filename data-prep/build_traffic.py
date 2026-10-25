"""
Build public/data/traffic.json: OBSERVED daily IMF PortWatch transits for the nine network chokepoints,
plus data-prep/raw/portwatch_daily.csv (all PortWatch chokepoints) used for model training.

Input (either):
  --parquet raw/portwatch_chokepoints_daily.parquet   (mirror: github.com/bopanna012/Global-Supply-Chain-Performance-Dashboard,
                                                        data/processed/chokepoints_daily.parquet, MIT, source IMF PortWatch)
  --csv     raw/daily_chokepoints.csv                  (direct PortWatch export, see fetch_portwatch.py)

Gaps (a handful of missing days) are linearly interpolated and rounded; their count is recorded.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'data', 'traffic.json')
RAW_CSV = os.path.join(HERE, 'raw', 'portwatch_daily.csv')
NETWORK = {  # network chokepoint id -> PortWatch portname
    'suez': 'Suez Canal', 'bab': 'Bab el-Mandeb Strait', 'hormuz': 'Strait of Hormuz', 'malacca': 'Malacca Strait',
    'panama': 'Panama Canal', 'cape': 'Cape of Good Hope', 'gibraltar': 'Gibraltar Strait', 'bosporus': 'Bosporus Strait',
    'dover': 'Dover Strait',
}
TYPES = ['n_total', 'n_tanker', 'n_container', 'n_dry_bulk', 'n_general_cargo', 'n_roro']


def load(a):
    if a.parquet:
        df = pd.read_parquet(a.parquet)
        df = df.rename(columns={'chokepoint': 'portname'})
    else:
        df = pd.read_csv(a.csv)
        df.columns = [c.lower() for c in df.columns]
        if 'date' in df:
            df['date'] = pd.to_datetime(df['date'], errors='coerce', utc=True).dt.tz_localize(None).dt.normalize()
        else:
            df['date'] = pd.to_datetime(dict(year=df.year, month=df.month, day=df.day))
    missing = [c for c in ['portname', 'date'] + TYPES if c not in df.columns]
    if missing:
        sys.exit(f'PortWatch input is missing columns {missing}; found {list(df.columns)}')
    return df


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--parquet')
    g.add_argument('--csv')
    a = ap.parse_args()
    df = load(a)
    start, end = df['date'].min().normalize(), df['date'].max().normalize()
    idx = pd.date_range(start, end, freq='D')
    filled, series = 0, {}
    rows = []
    for name in sorted(df['portname'].unique()):
        s = df[df['portname'] == name].groupby('date')[TYPES].sum().reindex(idx)
        filled_here = int(s['n_total'].isna().sum())
        s = s.interpolate(limit_direction='both').round().astype(int)
        s.index.name = 'date'
        out = s.reset_index()
        out.insert(0, 'portname', name)
        rows.append(out)
        cid = next((k for k, v in NETWORK.items() if v == name), None)
        if cid:
            filled += filled_here
            series[cid] = {t.replace('n_', ''): s[t].tolist() for t in TYPES}
    for k, v in NETWORK.items():
        if k not in series:
            sys.exit(f'No PortWatch rows for {v}')
    os.makedirs(os.path.dirname(RAW_CSV), exist_ok=True)
    pd.concat(rows).to_csv(RAW_CSV, index=False)
    doc = {
        'source': 'IMF PortWatch daily chokepoint transits (AIS-based), via public mirror',
        'status': 'OBSERVED', 'start': str(start.date()), 'end': str(end.date()), 'days': len(idx),
        'interpolatedDays': filled, 'types': [t.replace('n_', '') for t in TYPES], 'series': series,
    }
    json.dump(doc, open(OUT, 'w'), separators=(',', ':'))
    print(f'traffic.json: {len(series)} chokepoints, {start.date()}..{end.date()} ({len(idx)} days), '
          f'{filled} interpolated cells; {os.path.getsize(OUT)/1e3:.0f} kB')
    print(f'raw CSV for training: {RAW_CSV} ({df.portname.nunique()} chokepoints)')


if __name__ == '__main__':
    main()
