"""
Feature definition for the 7-day chokepoint traffic forecaster. lib/models/forecast.ts implements the
same function; scripts/sanity.ts checks that TypeScript and XGBoost predictions agree.

Origin t = last observed day. Month and cargo-mix features were dropped after validation (they encoded regime, not seasonality).
 Horizon h = 1..7. All level features are divided by base = max(MA28_t, 1),
so one model serves every chokepoint whatever its size, and the target is y[t+h] / base.
"""
import math  # noqa: F401  (kept for parity with the TS port)
import numpy as np, pandas as pd

FEATURES = (
    [f'lag{l}' for l in range(14)] + ['lag20', 'lag27', 'snaive7', 'snaive14', 'ma3', 'ma7', 'ma28_over_ma91', 'sd7', 'min7',
     'z7_28', 'dow', 'h']
)
MIN_ORIGIN = 90  # need 91 days of history


def origin_features(y, tank, cont, bulk, dates, t, h):
    """Python reference (scalar). y and type arrays are integer counts; dates a DatetimeIndex."""
    w28 = y[t - 27:t + 1]
    base = max(w28.mean(), 1.0)
    w7 = y[t - 6:t + 1]
    m7 = w7.mean()
    f = [y[t - l] / base for l in range(14)]
    f += [y[t - 20] / base, y[t - 27] / base, y[t + h - 7] / base, y[t + h - 14] / base]
    f += [y[t - 2:t + 1].mean() / base, m7 / base, base / max(y[t - 90:t + 1].mean(), 1.0), w7.std() / base, w7.min() / base]
    f += [(m7 - base) / math.sqrt(base / 7)]
    d = dates[t] + pd.Timedelta(days=h)
    f += [d.weekday(), h]
    return f, base


def _roll_mean(a, w):
    c = np.concatenate([[0.0], np.cumsum(a, dtype=float)])
    out = np.full(len(a), np.nan)
    out[w - 1:] = (c[w:] - c[:-w]) / w
    return out


def feature_matrix(y, tank, cont, bulk, dates, t_idx, h):
    """Vectorised version used for training; identical maths to origin_features."""
    y = np.asarray(y, float)
    n = len(y)
    m28, m7, m3, m91 = _roll_mean(y, 28), _roll_mean(y, 7), _roll_mean(y, 3), _roll_mean(y, 91)
    s = pd.Series(y)
    sd7 = s.rolling(7).std(ddof=0).values
    mn7 = s.rolling(7).min().values
    base = np.maximum(m28, 1.0)
    t = np.asarray(t_idx)
    cols = [y[t - l] / base[t] for l in range(14)]
    cols += [y[t - 20] / base[t], y[t - 27] / base[t], y[t + h - 7] / base[t], y[t + h - 14] / base[t]]
    cols += [m3[t] / base[t], m7[t] / base[t], base[t] / np.maximum(m91[t], 1.0), sd7[t] / base[t], mn7[t] / base[t]]
    cols += [(m7[t] - base[t]) / np.sqrt(base[t] / 7)]
    td = dates[t] + pd.Timedelta(days=h)
    cols += [td.weekday.values.astype(float), np.full(len(t), float(h))]
    return np.column_stack(cols), base[t]
