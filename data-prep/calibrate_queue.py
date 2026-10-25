"""
Calibrate the disruption simulator's queue model on a real closure: the Ever Given grounding (Suez, March 2021).

Model (same as lib/models/queue.ts, daily fluid FIFO queue):
  arrivals a_d      = XGBoost forecast made the day before the closure (days 1-7), then its 7-day mean
  capacity per day  = kappa * level while open, (1 - s) * kappa * level while closed   (level = MA28 at the origin)
  during the closure a share rho of new arrivals diverts (Cape / waits elsewhere) instead of queueing
  transits_d        = min(queue + arrivals, capacity)
Closure: grounded 23 Mar 2021 ~05:40 local, refloated 29 Mar ~15:00 -> closed [0.24, 6.6) days from 23 Mar 00:00.
Fit (kappa, s, rho) by grid search on observed PortWatch transits 23 Mar - 10 Apr. kappa is then used for every
chokepoint as the surge capacity multiple when a queue is being cleared.
"""
import json, os
import numpy as np, pandas as pd, xgboost as xgb
from forecast_features import feature_matrix

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')
raw = pd.read_csv(os.path.join(HERE, 'raw', 'portwatch_daily.csv'), parse_dates=['date'])
g = raw[raw.portname == 'Suez Canal'].set_index('date').sort_index()
dates = pd.DatetimeIndex(g.index)
y = g['n_total'].values
booster = xgb.Booster(); booster.load_model(os.path.join(HERE, 'out', 'xgb_model.json'))
n_trees = len(json.load(open(os.path.join(DATA, 'forecast_model.json')))['trees'])

t0 = int(dates.get_loc(pd.Timestamp('2021-03-22')))  # forecast origin: day before grounding
fc = []
for h in range(1, 8):
    x, b = feature_matrix(y, g['n_tanker'].values, g['n_container'].values, g['n_dry_bulk'].values, dates, np.array([t0]), h)
    fc.append(float(booster.predict(xgb.DMatrix(x), iteration_range=(0, n_trees))[0] * b[0]))
level = float(y[t0 - 27:t0 + 1].mean())
D = 19
arr = np.array(fc + [np.mean(fc)] * (D - 7))
obs = y[t0 + 1:t0 + 1 + D].astype(float)
C0, C1 = 0.24, 6.6


def simulate(kappa, s, rho, arrivals=arr):
    q, out, qs = 0.0, [], []
    for d in range(D):
        closed = max(0.0, min(d + 1, C1) - max(d, C0))  # fraction of day d closed
        cap = kappa * level * ((1 - closed) + closed * (1 - s))
        a = arrivals[d] * (1 - rho * closed)
        served = min(q + a, cap)
        q = q + a - served
        out.append(served); qs.append(q)
    return np.array(out), np.array(qs)


best = None
for kappa in np.arange(1.0, 2.51, 0.01):
    for s in np.arange(0.6, 1.001, 0.01):
        for rho in np.arange(0.0, 0.61, 0.02):
            sim, _ = simulate(kappa, s, rho)
            sse = float(((sim - obs) ** 2).sum())
            if best is None or sse < best[0]:
                best = (sse, kappa, s, rho)
sse, kappa, s, rho = best
sim, q = simulate(kappa, s, rho)
naive_sim, _ = simulate(1.0, 1.0, 0.0)
rmse = float(np.sqrt(((sim - obs) ** 2).mean()))
doc = {
    'event': 'Ever Given grounding, Suez Canal', 'origin': '2021-03-22', 'closedFromDay': C0, 'reopenDay': C1,
    'level': level, 'forecast': fc, 'kappa': round(kappa, 3), 'severity': round(s, 3), 'rho': round(rho, 3),
    'rmse': rmse, 'rmseNoSurge': float(np.sqrt(((naive_sim - obs) ** 2).mean())),
    'peakQueue': float(q.max()), 'dates': [str(d.date()) for d in dates[t0 + 1:t0 + 1 + D]],
    'observed': obs.tolist(), 'simulated': [round(v, 2) for v in sim], 'queue': [round(v, 1) for v in q],
    'note': 'kappa = cleared-queue throughput as a multiple of the pre-closure 28-day level; fitted by least squares',
}
json.dump(doc, open(os.path.join(DATA, 'queue_calibration.json'), 'w'), indent=1)
print(f'level {level:.1f}/day  kappa {kappa:.2f}  closure severity {s:.2f}  diverted {rho:.2f}  RMSE {rmse:.1f} ships/day '
      f'(no-surge model {doc["rmseNoSurge"]:.1f})  peak queue {q.max():.0f}')
print('obs', obs.astype(int).tolist())
print('sim', [int(round(v)) for v in sim])
