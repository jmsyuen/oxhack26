/**
 * Daily fluid FIFO queue at a chokepoint (the disruption simulator's aggregate view).
 * Same model as data-prep/calibrate_queue.py, where kappa was fitted on the 2021 Ever Given closure.
 */
export interface FluidInput {
  arrivals: number[];        // vessels/day wanting to transit
  waitShare: number[];       // share of each day's arrivals that queue (the rest reroute)
  level: number;             // normal daily level (MA28 at the forecast origin)
  kappa: number;             // surge throughput multiple while clearing a queue
  severity: number;          // share of capacity removed while closed
  closedFrom: number;        // days from now
  reopen: number;            // days from now
}

export interface FluidDay { day: number; baseline: number; transits: number; queue: number; rerouted: number; closed: number }

export function fluidQueue(p: FluidInput): FluidDay[] {
  let q = 0;
  const out: FluidDay[] = [];
  for (let d = 0; d < p.arrivals.length; d++) {
    const closed = Math.max(0, Math.min(d + 1, p.reopen) - Math.max(d, p.closedFrom));
    const cap = p.kappa * p.level * (1 - closed + closed * (1 - p.severity));
    const a = p.arrivals[d];
    // rerouting only happens while the route is (or is expected to be) blocked
    const share = closed > 0 || q > 0.5 ? p.waitShare[d] : 1;
    const join = a * share;
    const served = Math.min(q + join, cap);
    q = q + join - served;
    out.push({ day: d, baseline: a, transits: served, queue: q, rerouted: a - join, closed });
  }
  return out;
}
