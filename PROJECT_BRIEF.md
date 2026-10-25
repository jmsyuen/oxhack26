# CHOKEPOINT — drag-and-drop shipping blockage simulator

## STEP ZERO + HANDOFF (most important)
We build on one laptop at a time and switch machines when AI credits run out. The repo is the only memory.
1. Save this entire prompt verbatim as PROJECT_BRIEF.md and commit it. Create STATUS.md.
2. After every meaningful step: update STATUS.md (phase, done, in progress, exact next step, bugs, run commands, unverified assumptions), then git commit and push.
3. If I say "credits nearly gone", do a full handoff immediately.

## WHAT IT IS
A full-screen dark interactive world map. The user can create, drag, resize and delete "blockages" on the ocean. Each blockage has: radius (km), severity (0–100% of shipping capacity removed) and duration (1–180 days). Multiple blockages can exist at once. Every change instantly recalculates the global economic impact, shown in a side panel as headline numbers (green/red deltas) and charts. A "Brief me" button generates a short spoken news-style summary of the scenario.

The demo moment: drop a blockage on the Strait of Hormuz, watch Asian importers light up red and oil/LNG numbers spike; drag it to Suez and watch Europe–Asia trade reroute around Africa; add a second one on Malacca and watch it compound.

## STACK
- Frontend: Next.js + TypeScript, Tailwind, MapLibre GL JS, Recharts. Map style: https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json (no API key).
- Data prep: small Python scripts (pandas, searoute, networkx) run ONCE offline to build bundled JSON. Commit the small output JSON, gitignore raw downloads.
- Impact engine: pure TypeScript running in the browser so dragging feels instant. No backend needed for the core.
- Next.js API routes only for things needing secret keys (Gemini, ElevenLabs, price API). Keys in .env, never in client code.

## DATA (real inputs, badged OBSERVED)
1. Trade flows: CEPII BACI bilateral trade (latest year available), aggregated to country-pair × ~8 commodity groups: crude oil, LNG/gas, refined fuels, grain/food, containers/manufactured goods, metals & ores, chemicals, vehicles. Keep only maritime-relevant flows (drop land neighbours where obvious). If BACI is too heavy, use UN Comtrade for the top ~40 economies.
2. Chokepoint traffic: IMF PortWatch daily transits for Suez, Bab el-Mandeb, Hormuz, Malacca, Panama, Cape of Good Hope, Gibraltar, Bosporus, Dover. Used for "normal ships/day" headlines and a small history sparkline per chokepoint.
3. GDP and trade-to-GDP: World Bank, for scaling country exposure as % of GDP.
4. Live commodity prices: Brent, natural gas, wheat (free price API or FRED, cached 10 min). Show current price plus a clearly MODELLED "shock-adjusted" estimate.
Inspect each source's actual download format first. If an assumption is wrong, stop and tell me.

## THE ENGINE (badged MODELLED, every formula visible in a tooltip)
1. Sea-lane network: ~80–120 nodes (major ports + chokepoints + ocean waypoints), edges with real nautical-mile lengths generated with searoute. Map each country to its main port node(s).
2. Baseline: assign every trade flow to its shortest sea path. Precompute, bundle as JSON.
3. Blockage effect: any edge passing within a blockage's radius loses capacity × severity. Fully blocked edges are removed; partial blockages reroute that share of flow and add a congestion delay to the rest.
4. Reroute affected flows on the modified network. Extra distance → extra days at 14 knots. If no alternative path exists, the flow is STRANDED (counted separately, not infinite cost).
5. Outputs, scaled by duration (annual value × duration/365):
   - Global trade value disrupted, rerouted, stranded (USD)
   - Average extra transit days
   - Extra shipping cost (extra days × assumed daily freight cost per value shipped, stated as an assumption)
   - Top 10 most exposed countries (as importers and exporters), as USD and % of GDP
   - Impact by commodity group
   - Price pressure for oil, LNG, grain = share of global seaborne supply affected × a stated elasticity assumption
   - Which chokepoints absorb diverted traffic (e.g. Cape of Good Hope traffic up X%)
6. Recompute on every change, debounced ~100 ms. Must stay smooth while dragging.

## UI + DESIGN (replaces the UI section, treat as strict)

### Reference feel
Bloomberg Terminal density, Flightradar24/Windy map interactivity, Linear-level restraint. A tool a geopolitical analyst would leave open on a second monitor. Not a startup landing page.

### Banned (these scream "AI-generated")
- Purple/blue gradients, gradient text, glassmorphism on everything, glowing blobs
- Big rounded-2xl cards in a grid, heavy drop shadows, generic shadcn defaults left unstyled
- Emoji as icons, sparkle icons, "✨ AI-powered" copy, marketing taglines in the UI
- Centered hero sections, lorem ipsum, fake avatars, placeholder charts with random data
- Inter as the only font, everything the same font weight, giant padding everywhere

### Visual system
- Colours: background #070B12, panels #0D1420, raised #131C2B, hairline borders #1E2A3C (1px). Text #E6EDF5 / secondary #7D8BA0. Cyan #2EC4E6 = normal sea lanes and selection. Red #EF5A5F = blockages and losses. Amber #F2A93B = rerouted traffic. Green #34C38F = gains / diverted-to chokepoints benefiting. Use colour for meaning only, never decoration.
- Type: IBM Plex Sans for UI, IBM Plex Mono for every number. Tight sizes (12–13px body, 11px labels in uppercase with letter-spacing, 20–28px for headline figures). Tabular numerals so digits don't jiggle when they change.
- Corners 4–6px max. Spacing on a 4px grid. Dense but aligned, everything snaps to columns.
- Icons: Lucide, 16px, stroke 1.5, monochrome.

### Map (the centrepiece)
- Sea lanes rendered as thin lines with a slow animated dash flowing in the direction of trade (line-dasharray animation), thickness scaled by trade volume.
- Blockages: translucent red circle, opacity = severity, a slow pulsing outer ring, a visible resize handle on the edge, a small label showing severity % and duration.
- When a blockage is placed or moved: affected lanes fade to red, rerouted paths draw in amber with a short animated "trace" along the new route, stranded flows turn dashed grey.
- Countries tint smoothly by exposure (choropleth), transitions 300ms, never flicker.
- Hover a country: compact tooltip with its exposure in USD, % of GDP, top affected commodity. Hover a lane: what it carries and how much.
- Ghost preview circle follows the cursor in "add blockage" mode. Cursor changes for drag/resize/add.

### Side panel
- Top: 4–6 headline figures (trade disrupted, stranded, extra days, extra shipping cost, oil price pressure). Each animates (count up/down over ~400ms) when it changes, and briefly flashes red/green on the delta, then settles.
- Below: exposed-countries horizontal bar chart (bars animate to new lengths), commodity breakdown, diverted-chokepoint list with arrows (e.g. "Cape of Good Hope +38% traffic").
- Every figure has an OBSERVED / MODELLED badge (tiny, monospace, outlined) and a hover tooltip showing the formula.
- Selected-blockage inspector: severity slider, duration slider, radius, delete. Sliders update the map and numbers live while dragging, not on release.

### Interactions that make it feel alive
- Duration timeline scrubber along the bottom: drag through day 1 → day 180 and watch cumulative losses build and the map intensify. A play button animates it.
- Presets as compact chips at the top (Suez closure, Hormuz closure, Red Sea 2024-style, Malacca + Hormuz). Clicking one animates blockages into place.
- Keyboard: N = new blockage, Delete = remove selected, [ / ] = severity down/up, Shift+[ / ] = duration, Esc = deselect, Space = play timeline.
- Undo/redo for blockage edits (Cmd/Ctrl+Z).
- Empty state on first load: subtle hint "Click anywhere on the ocean to drop a blockage", plus one preset pre-highlighted.
- "Brief me" button with a small waveform animation while ElevenLabs speaks, transcript appearing word by word.

### Motion rules
- 150–300ms, ease-out, purposeful. Nothing bounces, nothing spins, no confetti. Motion should explain cause and effect (blockage placed → lanes change → numbers move), not decorate.
- Everything must stay at 60fps while dragging a blockage. If the engine is slow, debounce the heavy recalculation but keep the circle itself moving instantly.

### Quality bar
Before marking any UI phase done, check: does every number change when inputs change, does anything overlap or truncate at 1440px and 1920px, are all badges and tooltips present, does it look like a deliberate product rather than a template. If something looks generic, redesign it before moving on.


## ELEVENLABS + GEMINI (accessibility)
- "Brief me": send the current scenario outputs to Gemini, get a 20–30 second plain-English news-anchor style summary, read it aloud with ElevenLabs. Show the text too.
- Accessibility: keyboard controls for creating/moving blockages, and an option to auto-narrate the headline change after each edit.

## BUILD ORDER (finish + verify each before the next)
1. Map renders, blockages create/drag/resize/delete with severity + duration controls (no maths yet).
2. Data prep: network + baseline flow assignment + PortWatch + GDP bundled. Report coverage (countries, % of world trade covered).
3. Engine + side panel headlines. Sanity checks below must pass.
4. Charts, heatmap, rerouted path rendering, presets.
5. Brief me (Gemini + ElevenLabs), live prices.
6. Polish + pitch numbers.
CUT ORDER IF BEHIND: live prices → keyboard accessibility → presets → commodity price pressure. NEVER cut: map interaction, engine, exposed countries, Brief me.

## SANITY CHECKS (must pass before moving on)
- Blocking Suez reroutes Asia–Europe flows around the Cape, adding roughly 10–14 days.
- Blocking Hormuz strands most Gulf oil exports (few alternatives) and hits Japan, South Korea, India, China hardest.
- Blocking Panama barely affects Asia–Europe trade.
- Severity 0 or duration 0 = zero impact. Doubling duration doubles disrupted value.
- Two blockages on the same lane don't double-count the same flow.

## PITFALLS
- Don't double-count flows that pass through several blocked edges.
- MapLibre uses [lon, lat]; Pacific routes cross the antimeridian, split or unwrap those lines so they don't streak across the map.
- Annual trade data → scale by duration/365 explicitly.
- Never present MODELLED numbers as OBSERVED, never say the scenario is a real current event.
- No hardcoded outputs: every number must come from the engine and change with inputs.
- Ask before changing the stack or scope.
