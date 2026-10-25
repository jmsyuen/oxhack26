# STATUS

_Last updated: 2026-10-24 (evening) · decision engine merged · handoff-ready_

`PROJECT_BRIEF.md` is the authoritative brief. `docs/archive/v1-dashboard-spec.md` is the superseded first spec, kept for reference only.

## Phase
Build-order steps 1–6 are implemented and verified in a headless browser. What remains is data and key testing, not code.

## Done (verified)
1. **Map and blockages.** MapLibre map with an offline fallback style. Blockages can be created by click, N or add mode (ghost preview), dragged, resized with a handle (minimum 16px from centre so it never steals the drag), and deleted. Severity, duration and radius sliders update live. Undo/redo works. Verified by scripted Chromium: click-to-add, land rejection, drag, handle resize, keyboard edits, undo ×4.
2. **Data.** 230-node / 294-lane network, land-checked, within 2–5% of searoute. SEED flows: 49 economies, 84% of world goods exports, 10,721 flows. World Bank GDP (OBSERVED). Chokepoint transits (SEED). Coverage is reported in the Data & assumptions panel.
3. **Engine and headlines.** All 12 sanity checks pass (`npm run sanity`).
4. **Charts, choropleth, rerouting, presets.** The choropleth uses 300ms tweens. Rerouted traffic shows only the detour, with an animated trace; stranded routes show as grey dashes. Presets animate into place.
5. **Brief me and prices.** Gemini, ElevenLabs (with-timestamps) and FRED routes are written, with tested fallbacks: template brief, browser voice, prices hidden.
6. **Polish and pitch numbers.** Pitch numbers are in the README.
- **Quality bar.** No truncated `.truncate` elements and no preset-bar overflow at 1440×900 or 1920×1080 (automated check). No console errors. Every headline has a badge and formula tooltip.

## Done in the merge (decision engine)
- PortWatch transits are OBSERVED (2019 → 2026-07-26); chokepoint baselines and sparklines rebuilt.
- XGBoost forecaster trained, evaluated (baselines, Poisson floor, conformal coverage, regime-shift failure table) and ported to TS (parity < 1e-4).
- Queue simulator calibrated on Ever Given (κ 1.31). Monte Carlo optimiser with out-of-sample evaluation, stress test, break-even, VSS/EVPI.
- UI: answer line + tabbed Forecast / Simulate / Decide window, vessel dots on the map, model info, stress test, vessel plan with CSV export.
- Analyst Mode: Gemini function calling (/api/analyst), ElevenLabs speech, offline fallback; single-file artifact build with a d3 map.
- FRED_API_KEY set in .env.local (live Brent / LNG / wheat in the Prices panel of the Next.js app).
- `npm run sanity`: 21/21 pass. `next build` passes.

## In progress
Nothing.

## Untested without keys / network
- Gemini function-calling round trip (request shape follows v1beta generateContent; tool responses are sent as `functionResponse` parts with role `user`; model content is echoed back unchanged so thought signatures survive).
- ElevenLabs and FRED (unchanged from before).
- `fetch_portwatch.py` endpoint (the sandbox had no route to portwatch.imf.org).
- The published-artifact analyst uses `claude.use("sample")`; tools are passed only when `sample.limits()` reports them.

## Exact next step
0. Put GEMINI_API_KEY and ELEVENLABS_API_KEY in `.env.local`, `npm run dev`, click Ask the analyst → Recommend a decision. Never zip `.env.local` once it holds keys.
1. Download CEPII BACI, then run `data-prep/build_trade_baci.py`, `build_meta.py`, `npm run sanity` and `npm run pitch`. Update the README numbers.
2. Download the PortWatch daily chokepoint CSV, then run `build_portwatch.py` and `build_meta.py`. Sparklines appear automatically.
3. Put real keys in `.env.local` and click Brief me. Confirm the Gemini text, the ElevenLabs voice, word-synced transcript and waveform. Confirm the prices panel.
4. Open the app with internet access and confirm the Carto dark-matter basemap renders under the layers. Only the offline fallback was tested.
5. `git remote add origin <url> && git push -u origin main`. There is no remote yet.

## Run commands
```bash
npm install && npm run dev      # app on :3000
npm run build && npm start      # production
npm run typecheck               # tsc --noEmit
npm run sanity                  # engine sanity checks (exit 1 on failure)
npm run pitch                   # preset numbers as a Markdown table
cd data-prep && ./build_all.sh  # rebuild bundled data (needs Python deps)
```

## Decisions that deviate from the brief (please confirm)
- **Network size.** 230 nodes rather than ~80–120, so that no lane crosses land.
- **Lane lengths.** Lengths are great-circle between land-checked waypoints, calibrated against searoute, rather than generated per lane by searoute.
- **Baseline assignment.** It is computed in the browser at load (deterministic, about 0.2–0.6 s) rather than shipped as precomputed JSON, so it can never drift from the network and flows.
- **Trade and transit data.** Both are SEED, because the build sandbox could not reach CEPII or PortWatch. They are badged SEED everywhere and the replacement scripts are ready.
- **Trade disrupted.** Defined as rerouted + stranded, so it scales with severity. Delayed-in-place value is shown separately.
- **Recompute timing.** Throttled at 90 ms with a trailing run, instead of debounced, so the numbers move during a drag.
- **Price series.** LNG uses FRED's Asian LNG series (`PNGASJPUSDM`) rather than a US gas price, because the modelled shock is to seaborne LNG.
- **Additions.**
  - A fifth preset, Panama drought.
  - Extra shortcuts: arrows, `-` `=`, `1`–`9`, `?`.
  - Narrate uses browser speech, not ElevenLabs.
  - Pipeline bypasses for Saudi Arabia, the UAE and Iran.
- **Framework and fonts.** Next.js 15.5 with Tailwind v4. Fonts are self-hosted through @fontsource, so the app needs no network at build time.

## Unverified assumptions
- **ElevenLabs.** The `/v1/text-to-speech/{voice}/with-timestamps` response fields (`audio_base64`, `alignment.characters`, `alignment.character_start_times_seconds`) haven't been tested without a key. If alignment is missing, the transcript falls back to proportional timing.
- **Gemini.** The `v1beta generateContent` request with `x-goog-api-key` and `thinkingConfig.thinkingBudget: 0` is untested; a 400 error retries without `thinkingConfig`. Change `GEMINI_MODEL` if 2.5 Flash is retired.
- **FRED.** Series IDs and the observations endpoint are untested without a key.
- **BACI and PortWatch formats.** The column names in both scripts are untested on real files: BACI `t,i,j,k,v` plus `country_codes` with `country_iso3` or `iso_3digit_alpha`; PortWatch `portname`, `n_total`, `date`.
- **SEED values.** Every economy total, commodity mix and ships/day figure is approximate.
- **Calibration constants.** These are judgement calls, all in `lib/engine/assumptions.ts` and `data-prep/build_trade_seed.py`:
  - price multipliers (oil 3, LNG 4, grain 1.5)
  - inventory τ of 14 days
  - congestion delay of 4 days
  - cost per extra day by commodity
  - cargo value per ship

## Known issues
- Shipping cost reads near zero for Hormuz, because stranded trade is not costed (by design). An optional "carrying cost of stranded cargo" metric was proposed but not added.
- Singapore and other very small countries aren't drawn in the 1:110m polygons, so they're never tinted.
- `?debug` in the URL exposes the map as `window.__map`. It's used by the browser tests and is harmless, but remove it if you prefer.
