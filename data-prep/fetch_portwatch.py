"""
Refresh the raw IMF PortWatch daily chokepoint table (run on a normal internet connection).
  python fetch_portwatch.py            -> raw/daily_chokepoints.csv
  python build_traffic.py --csv raw/daily_chokepoints.csv
  python build_portwatch.py --csv raw/portwatch_daily.csv && python build_meta.py
  python train_forecast.py && python calibrate_queue.py
Endpoint: the PortWatch hub CSV download for "Daily Chokepoint Transit Calls" (item 3da2b9ca97684916b75c4013f95d18ab).
Untested from the build sandbox (no network route to portwatch.imf.org); if it moves, download the CSV by hand from
https://portwatch.imf.org/ (Data -> Chokepoints -> Daily) into raw/.
"""
import os, sys, urllib.request
URL = 'https://portwatch.imf.org/api/download/v1/items/3da2b9ca97684916b75c4013f95d18ab/csv?layers=0'
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', 'daily_chokepoints.csv')
os.makedirs(os.path.dirname(dest), exist_ok=True)
print('downloading', URL)
try:
    with urllib.request.urlopen(URL, timeout=300) as r, open(dest, 'wb') as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
except Exception as e:  # noqa: BLE001
    sys.exit(f'Download failed ({e}). Download the CSV by hand from https://portwatch.imf.org/ into {dest}')
print('saved', dest, os.path.getsize(dest) // 1000, 'kB')
