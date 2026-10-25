"""
Train the CHOKEPOINT 7-day traffic forecaster (XGBoost) on OBSERVED IMF PortWatch daily transits.

  python train_forecast.py      (needs raw/portwatch_daily.csv from build_traffic.py)

Design
- One direct multi-horizon model: horizon h is a feature; target = transits(t+h) / MA28(t).
- Pooled over all 28 PortWatch chokepoints, so it sees many level shifts (COVID 2020, Ever Given 2021,
  Panama drought 2023, Red Sea 2023-24) instead of only Suez's.
- Time split, no shuffling: train 2019-04..2024-06, validation (early stopping + conformal calibration)
  2024-07..2024-12, test 2025-01-01..2026-07-19 (origins; targets to 2026-07-26). The test period is never
  touched while fitting.
- Prediction intervals: split-conformal on Pearson-style residuals |y - yhat| / sqrt(yhat), per chokepoint and
  horizon, calibrated on the validation window (counts are near-Poisson, so spread grows with sqrt(level)).
  Empirical coverage is reported on the untouched test set.
- Feature selection (dropping month and cargo-mix shares) was decided on validation MAE only.

Outputs: public/data/forecast_model.json (trees for in-browser inference), public/data/forecast_eval.json
(metrics, baselines, coverage, importance), data-prep/out/parity.json (fixtures for the TS parity test).
"""
import json, math, os, time
import numpy as np, pandas as pd, xgboost as xgb
from forecast_features import FEATURES, MIN_ORIGIN, feature_matrix

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')
OUTD = os.path.join(HERE, 'out')
os.makedirs(OUTD, exist_ok=True)
NETWORK = {'suez': 'Suez Canal', 'bab': 'Bab el-Mandeb Strait', 'hormuz': 'Strait of Hormuz', 'malacca': 'Malacca Strait',
           'panama': 'Panama Canal', 'cape': 'Cape of Good Hope', 'gibraltar': 'Gibraltar Strait',
           'bosporus': 'Bosporus Strait', 'dover': 'Dover Strait'}
H = 7
PARAMS = dict(n_estimators=4000, learning_rate=0.03, max_depth=5, subsample=0.8, colsample_bytree=0.8, min_child_weight=20,
              reg_lambda=2.0, objective='reg:squarederror', tree_method='hist', early_stopping_rounds=150, random_state=7)
TRAIN = ('2019-04-01', '2024-06-30')
VAL = ('2024-07-01', '2024-12-24')
TEST = ('2025-01-01', '2026-07-19')
SHIFTS = [('suez', 'Suez · Red Sea diversion onset', '2023-12-10', '2024-02-29'),
          ('cape', 'Cape · Red Sea diversion onset', '2023-12-10', '2024-02-29'),
          ('hormuz', 'Hormuz · 2026 traffic collapse', '2026-02-20', '2026-07-15')]

raw = pd.read_csv(os.path.join(HERE, 'raw', 'portwatch_daily.csv'), parse_dates=['date'])
dates = pd.DatetimeIndex(sorted(raw['date'].unique()))
N = len(dates)
ti = lambda s: int(dates.get_loc(pd.Timestamp(s)))
SER = {}
for name, g in raw.groupby('portname'):
    g = g.set_index('date').reindex(dates)
    SER[name] = {c: g[c].values.astype(int) for c in ['n_total', 'n_tanker', 'n_container', 'n_dry_bulk']}


def build(names, t0, t1):
    X, Y, B, Hs, T, NM = [], [], [], [], [], []
    for n in names:
        s = SER[n]
        for h in range(1, H + 1):
            t = np.arange(max(t0, MIN_ORIGIN), min(t1, N - h))
            if not len(t):
                continue
            x, b = feature_matrix(s['n_total'], s['n_tanker'], s['n_container'], s['n_dry_bulk'], dates, t, h)
            X.append(x); Y.append(s['n_total'][t + h] / b); B.append(b); Hs.append(np.full(len(t), h)); T.append(t)
            NM += [n] * len(t)
    return np.vstack(X), np.concatenate(Y), np.concatenate(B), np.concatenate(Hs), np.concatenate(T), np.array(NM)


t_start = time.time()
names = sorted(SER)
Xtr, Ytr, *_ = build(names, ti(TRAIN[0]), ti(TRAIN[1]) + 1)
Xva, Yva, Bva, Hva, Tva, Nva = build(names, ti(VAL[0]), ti(VAL[1]) + 1)
model = xgb.XGBRegressor(**PARAMS)
model.fit(Xtr, Ytr, eval_set=[(Xva, Yva)], verbose=False)
n_trees = model.best_iteration + 1
print(f'trained on {len(Ytr):,} rows, {n_trees} trees (early stopped), {time.time()-t_start:.0f}s')


def predict(X):
    return model.predict(X, iteration_range=(0, n_trees))


# ---- conformal calibration on validation (all chokepoints), per horizon
pva = predict(Xva) * Bva
yva = Yva * Bva
score = np.abs(yva - pva) / np.sqrt(np.maximum(pva, 1.0))


def cq(sc):
    s = np.sort(sc); n = len(s)
    q = lambda a: float(s[min(n - 1, int(math.ceil((n + 1) * a)) - 1)])
    return {'q80': q(0.80), 'q95': q(0.95)}


conf = {h: cq(score[Hva == h]) for h in range(1, H + 1)}  # pooled fallback
conf_cp = {cid: {h: cq(score[(Hva == h) & (Nva == pn)]) for h in range(1, H + 1)} for cid, pn in NETWORK.items()}


def baselines(n, T, Hs):
    y = SER[n]['n_total'].astype(float)
    m = lambda w: np.array([y[t - w + 1:t + 1].mean() for t in T])
    return {'naive': y[T], 'seasonal_naive': y[T + Hs - 7], 'ma7': m(7), 'ma28': m(28)}


def metrics(p, a):
    e = p - a
    return {'mae': float(np.abs(e).mean()), 'rmse': float(np.sqrt((e ** 2).mean()))}


def evaluate(n, w0, w1):
    cid = next((k for k, v in NETWORK.items() if v == n), None)
    cf = conf_cp[cid] if cid else conf
    X, Y, B, Hs, T, _ = build([n], ti(w0), ti(w1) + 1)
    p = predict(X) * B; a = Y * B
    out = {'xgboost': metrics(p, a)}
    for k, v in baselines(n, T, Hs).items():
        out[k] = metrics(v, a)
    out['poisson_floor_mae'] = float(np.mean(np.sqrt(2 * np.maximum(a, 1) / math.pi)))
    sc = np.abs(a - p) / np.sqrt(np.maximum(p, 1.0))
    q80 = np.array([cf[h]['q80'] for h in Hs]); q95 = np.array([cf[h]['q95'] for h in Hs])
    out['coverage80'] = float((sc <= q80).mean()); out['coverage95'] = float((sc <= q95).mean())
    by_h = []
    for h in range(1, H + 1):
        s = Hs == h
        row = {'h': h, 'xgboost': float(np.abs(p[s] - a[s]).mean())}
        for k, v in baselines(n, T[s], Hs[s]).items():
            row[k] = float(np.abs(v - a[s]).mean())
        by_h.append(row)
    out['by_horizon'] = by_h
    out['n'] = int(len(a))
    return out


test = {cid: evaluate(pn, *TEST) for cid, pn in NETWORK.items()}
shifts = [{'id': cid, 'label': lab, 'from': a, 'to': b, **evaluate(NETWORK[cid], a, b)} for cid, lab, a, b in SHIFTS]
s = test['suez']
print('Suez test MAE  xgb %.2f  ma28 %.2f  ma7 %.2f  snaive %.2f  naive %.2f  floor %.2f  cov80 %.2f cov95 %.2f' % (
    s['xgboost']['mae'], s['ma28']['mae'], s['ma7']['mae'], s['seasonal_naive']['mae'], s['naive']['mae'],
    s['poisson_floor_mae'], s['coverage80'], s['coverage95']))
for r in shifts:
    print('  shift %-32s xgb %.2f ma28 %.2f ma7 %.2f naive %.2f' % (r['label'], r['xgboost']['mae'], r['ma28']['mae'], r['ma7']['mae'], r['naive']['mae']))

# ---- dispersion check: is daily noise ~Poisson? (variance / mean of residuals around a 28-day level, Suez, test period)
y = SER['Suez Canal']['n_total'].astype(float)
t = np.arange(ti(TEST[0]), ti(TEST[1]) + 1)
lvl = np.array([y[i - 27:i + 1].mean() for i in t])
dispersion = float(((y[t] - lvl) ** 2).mean() / lvl.mean())

# ---- importance
booster = model.get_booster()
gain = booster.get_score(importance_type='total_gain')
tot = sum(gain.values())
imp = sorted(((FEATURES[int(k[1:])], v / tot) for k, v in gain.items()), key=lambda x: -x[1])[:12]

# ---- export trees (compact) for the browser
booster.save_model(os.path.join(OUTD, 'xgb_model.json'))
mj = json.load(open(os.path.join(OUTD, 'xgb_model.json')))
learner = mj['learner']
trees = learner['gradient_booster']['model']['trees'][:n_trees]
base_score = float(json.loads(learner['learner_model_param']['base_score'])[0]) if learner['learner_model_param']['base_score'].startswith('[') else float(learner['learner_model_param']['base_score'])
ctree = []
for tr in trees:
    ctree.append({'f': tr['split_indices'], 'c': [float(np.float32(v)) for v in tr['split_conditions']],
                  'l': tr['left_children'], 'r': tr['right_children']})
model_doc = {'kind': 'xgboost-gbtree', 'version': xgb.__version__, 'objective': 'reg:squarederror', 'target': 'y[t+h] / max(MA28_t, 1)',
             'baseScore': base_score, 'features': FEATURES, 'horizon': H, 'conformal': conf, 'conformalByChokepoint': conf_cp, 'trees': ctree,
             'trainedOn': {'rows': int(len(Ytr)), 'chokepoints': len(names), 'train': TRAIN, 'validation': VAL, 'test': TEST}}
json.dump(model_doc, open(os.path.join(DATA, 'forecast_model.json'), 'w'), separators=(',', ':'))

# parity fixtures: Suez + Hormuz predictions at random origins (TS must match)
rng = np.random.default_rng(3)
fx = []
for cid in ['suez', 'hormuz', 'cape']:
    sr = SER[NETWORK[cid]]
    for t0 in rng.integers(MIN_ORIGIN + 14, N - 8, 12):
        for h in (1, 4, 7):
            x, b = feature_matrix(sr['n_total'], sr['n_tanker'], sr['n_container'], sr['n_dry_bulk'], dates, np.array([t0]), h)
            fx.append({'cp': cid, 't': int(t0), 'h': h, 'pred': float(predict(x)[0] * b[0]), 'x': [float(v) for v in x[0]]})
json.dump(fx, open(os.path.join(OUTD, 'parity.json'), 'w'))

ev = {'model': {'family': 'XGBoost gradient-boosted trees (direct multi-horizon, pooled)', 'trees': n_trees,
                'maxDepth': PARAMS['max_depth'], 'learningRate': PARAMS['learning_rate'], 'features': len(FEATURES),
                'trainRows': int(len(Ytr)), 'chokepointsPooled': len(names), 'train': TRAIN, 'validation': VAL, 'test': TEST,
                'trainedAt': time.strftime('%Y-%m-%d'), 'data': 'IMF PortWatch daily transits 2019-01-01..' + str(dates[-1].date())},
      'test': test, 'shifts': shifts, 'importance': [{'feature': f, 'share': v} for f, v in imp],
      'dispersionIndexSuez': dispersion, 'conformal': conf_cp['suez']}
json.dump(ev, open(os.path.join(DATA, 'forecast_eval.json'), 'w'), indent=1)
print(f'model: {n_trees} trees, {os.path.getsize(os.path.join(DATA, "forecast_model.json"))/1e3:.0f} kB; dispersion index {dispersion:.2f}')
print('importance:', ', '.join(f'{f} {v:.2f}' for f, v in imp[:8]))
