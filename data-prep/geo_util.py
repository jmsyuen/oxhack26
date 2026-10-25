import math
R_NM = 3440.065  # earth radius in nautical miles

def to_xyz(lon, lat):
    lo, la = math.radians(lon), math.radians(lat)
    return (math.cos(la)*math.cos(lo), math.cos(la)*math.sin(lo), math.sin(la))

def gc_dist_nm(a, b):
    (lo1, la1), (lo2, la2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    dl = math.radians(lo2 - lo1)
    h = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R_NM*math.asin(min(1, math.sqrt(h)))

def gc_interp(a, b, step_nm=60):
    """Densified great-circle with continuous (unwrapped) longitudes."""
    d = gc_dist_nm(a, b)
    n = max(1, int(math.ceil(d/step_nm)))
    x1, x2 = to_xyz(*a), to_xyz(*b)
    om = d / R_NM
    pts = []
    for i in range(n+1):
        t = i/n
        if om < 1e-9:
            x = x1
        else:
            s1 = math.sin((1-t)*om)/math.sin(om); s2 = math.sin(t*om)/math.sin(om)
            x = tuple(s1*x1[k] + s2*x2[k] for k in range(3))
        lon = math.degrees(math.atan2(x[1], x[0])); lat = math.degrees(math.asin(max(-1,min(1,x[2]))))
        pts.append([lon, lat])
    # unwrap longitudes relative to the start point
    out = [pts[0]]
    for p in pts[1:]:
        lon = p[0]
        prev = out[-1][0]
        while lon - prev > 180: lon -= 360
        while lon - prev < -180: lon += 360
        out.append([round(lon, 4), round(p[1], 4)])
    out[0] = [round(out[0][0], 4), round(out[0][1], 4)]
    return out, d
