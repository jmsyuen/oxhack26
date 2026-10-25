"""
Replace SEED chokepoint transit counts with OBSERVED IMF PortWatch data.

1. Download "Daily Chokepoint Transit Calls and Trade Volume Estimates" as CSV from
   https://portwatch.imf.org/ (Data -> Chokepoints -> Download, CSV) into data-prep/raw/.
2. python build_portwatch.py --csv raw/<file>.csv
   Optional: --baseline-start 2023-01-01 --baseline-end 2023-10-31  (pre-Red-Sea-crisis normal)
3. python build_meta.py   (flips the badge to OBSERVED)

The script stops with a clear message if the CSV does not have the expected columns.
"""
import argparse, json, os, sys
import pandas as pd

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', 'public', 'data', 'chokepoints.json')
ALIASES = {
    'suez': ['suez canal', 'suez'], 'bab': ['bab el-mandeb strait', 'bab el-mandeb', 'bab-el-mandeb'],
    'hormuz': ['strait of hormuz', 'hormuz'], 'malacca': ['malacca strait', 'strait of malacca', 'malacca'],
    'panama': ['panama canal', 'panama'], 'cape': ['cape of good hope'], 'gibraltar': ['gibraltar strait', 'strait of gibraltar', 'gibraltar'],
    'bosporus': ['bosporus strait', 'bosporus', 'bosphorus strait', 'bosphorus'], 'dover': ['dover strait', 'strait of dover', 'dover'],
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', required=True)
    ap.add_argument('--baseline-start', default='2023-01-01')
    ap.add_argument('--baseline-end', default='2023-10-31')
    a = ap.parse_args()
    df = pd.read_csv(a.csv)
    cols = {c.lower(): c for c in df.columns}
    need = ['portname', 'n_total']
    missing = [c for c in need if c not in cols]
    if missing:
        sys.exit(f"PortWatch CSV is missing columns {missing}. Found: {list(df.columns)}. "
                 "Check the export (expected the daily chokepoints dataset) and update this script.")
    if 'date' in cols:
        df['_date'] = pd.to_datetime(df[cols['date']], errors='coerce', utc=True).dt.tz_localize(None)
    elif all(k in cols for k in ('year', 'month', 'day')):
        df['_date'] = pd.to_datetime(dict(year=df[cols['year']], month=df[cols['month']], day=df[cols['day']]))
    else:
        sys.exit(f"No date column found (need 'date' or year/month/day). Found: {list(df.columns)}")
    df['_name'] = df[cols['portname']].astype(str).str.strip().str.lower()
    cps = json.load(open(OUT))
    lo, hi = pd.Timestamp(a.baseline_start), pd.Timestamp(a.baseline_end)
    for cp in cps:
        sub = df[df['_name'].isin(ALIASES[cp['id']])].sort_values('_date')
        if sub.empty:
            sys.exit(f"No rows for {cp['name']} (looked for {ALIASES[cp['id']]}). Names in file: {sorted(df['_name'].unique())[:40]}")
        base = sub[(sub['_date'] >= lo) & (sub['_date'] <= hi)][cols['n_total']]
        if base.empty:
            sys.exit(f"No {cp['name']} rows inside the baseline window {a.baseline_start}..{a.baseline_end}")
        cp['shipsPerDay'] = round(float(base.mean()), 1)
        weekly = sub.set_index('_date')[cols['n_total']].resample('W').mean().dropna().tail(104)
        cp['history'] = [{'date': d.strftime('%Y-%m-%d'), 'n': round(float(v), 1)} for d, v in weekly.items()]
        cp['shipsSource'] = 'portwatch'
        print(f"{cp['name']:<22} baseline {cp['shipsPerDay']:>6}/day  history {len(cp['history'])} weeks, last {cp['history'][-1]}")
    json.dump(cps, open(OUT, 'w'), indent=1)
    print('wrote', OUT, '- now run: python build_meta.py')

if __name__ == '__main__':
    main()
