# CHOKEPOINT · pitch and demo script (4–5 minutes per judge)

## The hook (20 s)
"In March 2021 the Ever Given blocked Suez for six days. Hundreds of ships had to make one call: wait at anchor,
or sail around Africa for an extra one to three weeks. The right answer depends on one thing nobody knows: **time**.
How long until it reopens? CHOKEPOINT turns that uncertainty into a decision for every ship, priced in dollars."

## Demo path (clicks in order)
First-time visitors get a five-step guided tour (map → play → decision window → impact panel → analyst), with Skip and a Tour button in the top bar to replay it. For judging, skip it and drive the demo yourself:
1. **Opens on "Suez · 2 weeks", Decide tab.** Read the answer line under the map: *hold 746 ships, reroute 116, saving $107m (14%) vs everyone waiting.*
   Then the three Monte Carlo cases: best (reopens ~6 days), middle (~12), worst (~25), each priced against everyone waiting.
   That is the whole product: the answer to "how can shipping companies minimise costs when routes are disrupted?"
2. **Map:** cyan dots wait, amber dots reroute. Point out amber dots are the ones still far out (Malacca, in port): they haven't passed the
   point where the Cape route splits off. Ships already in the Red Sea or the Med wait, because turning back costs more.
3. **Forecast tab.** XGBoost on real IMF PortWatch data (28 chokepoints, 2019–Jul 2026). Click *Day before Ever Given* (or drag **Forecast from**):
   the model forecasts from that day and draws 1,000 simulated weeks (60 shown). The dots show what actually happened: 0 of 7 days fall
   inside the simulated range. No normal week looks like a blockage, which is exactly why step 2 exists. Time travel, computed live in the browser.
   (Simulated weeks: shared level shock + Poisson noise, calibrated to the conformal interval; 85% held-out coverage of the 80% band.)
   Open **Model info**: test MAE 5.04 vs 7.13 naive (−29%), at the Poisson noise floor (4.98). Intervals hit 83% / 95% coverage.
4. **Simulate tab.** Queue length for the best, middle and worst reopening dates. Click **Check the model against Ever Given**: our queue model against the
   real 2021 transits, RMSE 9.6 ships/day (17.9 without the surge term). Surge rate κ = 1.31× normal was *fitted*, not assumed.
5. **Decide tab again.** 1,000 reopening dates drawn; decisions are scored on a *separate* 1,000 draws. Range bars compare the plan with
   everyone waiting / everyone rerouting from best to worst case. Switch **Plan for → Worst case**: reroutes jump, the worst case shrinks.
6. **What if we're wrong?** Replay the plan at 0.5×, 1×, 2×, 3× the expected closure. Regret vs hindsight, decisions that flip,
   break-even chart where waiting stops beating a blanket reroute.
7. **Ship by ship.** Click any ship: its wait-cost curve vs the flat reroute cost, break-even closure, P(reroute cheaper), plain-English reason.
   Export CSV. (You can also click a dot on the map.)
8. **Drag the blockage onto Hormuz** (or click the Hormuz dot): the engine switches chokepoint. No sea alternative exists, so every ship waits;
   right panel shows oil +62%-class pressure and Gulf importers lighting up as % of GDP.
9. **Analyst → Recommend a decision.** Gemini (full app) answers using only engine outputs; it calls `what_if` / `list_vessels` tools that run
   our models in the browser, so it can't invent numbers. ElevenLabs reads it out. Ask "what changes if it lasts another week?".

## Numbers to have ready (SEED trade data; PortWatch OBSERVED)
| Scenario | Wait / reroute | Monte Carlo | Always wait | Saving |
|---|---|---|---|---|
| Suez 7 d, ±60% | 829 / 33 | $256m | $270m | 5% |
| Suez 14 d, ±60% | 746 / 116 | $658m | $765m | 14% |
| Suez 28 d, ±60% | 307 / 555 | $1.04bn | $1.86bn (all reroute $1.11bn) | 6% vs all reroute |
| Suez 7 d, ±100%, worst-case rule | 329 / 533 | CVaR $1.03bn | CVaR $1.84bn | 44% on CVaR |

## Questions HRT judges will ask
- **"Isn't your XGBoost just a moving average?"** In calm periods, yes, and that's the point we checked: daily transits have a dispersion index
  of 0.98 (Poisson-like). No model can beat ~5.0 MAE; we're at 5.04. So we don't pretend to predict that noise, we propagate it.
  Where it fails: abrupt collapses (Hormuz 2026), shown honestly in Model info.
- **"How do you avoid overfitting the optimiser?"** Decisions on one set of draws, evaluation on an independent set with common random
  numbers across strategies. Perfect foresight is a lower bound and is never deployable.
- **"Do ships affect each other?"** Yes: FIFO queue. Ships decide in arrival order, so each sees the queue built by the ships ahead,
  for every draw, with no iteration needed (later arrivals can't delay earlier ones under FIFO).
- **"Value of modelling uncertainty?"** VSS = point-estimate cost − Monte Carlo cost. Small under the risk-neutral rule (costs are near-linear
  in duration), large under the worst-case rule. EVPI tells you what a reliable reopening date is worth.
- **Latency:** ~200 ms for 862 ships × 2,000 draws in the browser; trade engine ~25 ms per pass; forecast inference < 1 ms.

## Side tracks
- **Gemini (MLH):** function calling with client-executed, allow-listed tools; key server-side; grounded by construction.
- **ElevenLabs (MLH):** spoken recommendation with word-timed transcript; browser voice fallback.
- **Theme TIME:** uncertain reopening time is the cost driver; 7-day forecast; time-travel backtest; timeline scrubber.
