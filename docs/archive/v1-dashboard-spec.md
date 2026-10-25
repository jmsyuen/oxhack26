# Build CHOKEPOINT — Maritime Disruption Intelligence Platform

## 1. Project Overview

Build a sophisticated, production-quality web application called **CHOKEPOINT**.

**Tagline:** Predict disruption. Optimise decisions. Keep global trade moving.

CHOKEPOINT is a predictive analytics and decision-intelligence platform that helps shipping operators respond to disruptions at critical global maritime chokepoints.

The platform combines:

1. Historical maritime traffic data.
2. Machine learning-powered traffic forecasting.
3. Interactive maritime route visualisation.
4. Shipping disruption scenario simulation.
5. Vessel rerouting and cost optimisation.
6. Uncertainty analysis using Monte Carlo simulations.
7. Quantitative performance comparisons.

The application's primary use case is a disruption to the Suez Canal. Users should be able to simulate a closure, understand how traffic and congestion might evolve, and determine whether individual vessels should wait or reroute around the Cape of Good Hope.

This is being built for a quantitative decision-making hackathon sponsored by Hudson River Trading (HRT).

The application should demonstrate how predictive modelling and mathematical optimisation improve decisions under uncertainty.

**This must feel like a real operational intelligence platform, not a generic SaaS landing page.**

Build the actual functional dashboard with meaningful user interactions and deterministic simulations. Do not fill the interface with meaningless placeholders.

---

# 2. Technology Stack

Use:

- Next.js 15+ with App Router.
- TypeScript with strict typing.
- React and functional components.
- Tailwind CSS.
- shadcn/ui.
- Lucide icons.
- Recharts for charts.
- MapLibre GL JS for an interactive geographic map.
- Turf.js for geospatial calculations where appropriate.
- Zustand or React Context for shared application state.
- Framer Motion / Motion for subtle animations.

Use a modular architecture so that the frontend can later connect to a Python FastAPI backend containing the prediction and optimisation algorithms.

Avoid unnecessary dependencies.

The application should work immediately with bundled scenario data, even when no external APIs are configured.

If installing MapLibre is necessary, ensure the map actually renders. Use a publicly accessible map style with no required API key.

---

# 3. Visual Design Direction

Create an institutional-grade intelligence dashboard inspired by:

- Bloomberg Terminal.
- Palantir-style operational software.
- Modern quantitative trading dashboards.
- Maritime vessel-tracking interfaces.
- High-end geospatial intelligence tools.

Do not copy these products directly.

## Design characteristics

- Dark mode by default.
- Near-black and deep navy backgrounds.
- Graphite panels with subtle borders.
- Muted slate typography.
- Electric cyan for active routes and selected controls.
- Amber for warnings and predicted congestion.
- Red for disruption and critical risk.
- Green for recommended and cost-saving decisions.
- Minimal gradients.
- Clean, compact typography.
- Monospaced numerical metrics.
- Precise spacing.
- Extremely high information density without clutter.

Avoid oversized rounded cards, excessive shadows, generic stock illustrations, large hero sections and decorative gradients.

This should feel like software used by a professional shipping analyst managing hundreds of millions of dollars in exposure.

Suggested palette:

- Background: #080D16.
- Surface: #101827.
- Elevated surface: #172235.
- Border: #263247.
- Primary text: #E8EEF7.
- Secondary text: #8492A6.
- Cyan: #37C8E8.
- Amber: #F3B45B.
- Red: #F06469.
- Green: #38C99A.

Use the Geist font for the interface and Geist Mono for statistics.

---

# 4. Application Layout

Build the application around a full-screen dashboard optimised for a 1440px desktop viewport.

Include a persistent left sidebar, top navigation and main workspace.

## Left sidebar

Logo: CHOKEPOINT with a minimal nautical/navigation icon.

Navigation:

1. Overview
2. Live Maritime Map
3. Traffic Intelligence
4. Scenario Simulator
5. Fleet Optimiser
6. Risk Analysis
7. Model Performance
8. Data Sources

Each navigation item should display the appropriate view. Do not create dead links.

The selected page should have a subtle cyan highlight.

At the bottom, display:

- System status.
- Dataset status.
- Model version.
- Scenario data indicator.

## Top navigation

Display:

- Current selected chokepoint.
- Data date / last updated timestamp.
- Data mode: Historical / Simulated.
- Active scenario status.
- A prominent "New Scenario" button.

Use a compact, operational layout.

---

# 5. Overview Dashboard

The Overview page provides an immediate picture of current maritime disruption exposure.

## KPI cards

Display six metrics:

1. Daily Vessel Transits.
2. Seven-Day Predicted Traffic.
3. Estimated Vessels Affected.
4. Estimated Disruption Cost.
5. Average Additional Voyage Days.
6. Estimated Savings from Optimisation.

Each card should contain:

- Metric value.
- Unit.
- Relevant change or comparison.
- Tiny sparkline where useful.
- Tooltip explaining how the metric is calculated.
- Indicator whether the value is observed, predicted or simulated.

Do not imply simulated data is real-world live data.

## Main visualisation

A large interactive world map occupies approximately 65% of the horizontal space.

Beside it, a disruption intelligence panel displays:

- Suez Canal status.
- Bab el-Mandeb status.
- Cape of Good Hope status.
- Current scenario.
- Estimated consequences.
- Recommended response.

The selected chokepoint should be highlighted on the map.

## Bottom section

Include:

- Historical traffic chart.
- Forecast traffic chart.
- Top affected shipping routes.
- Recent scenario events.
- Risk distribution chart.

The dashboard must respond when scenario parameters are changed.

---

# 6. Interactive Maritime Map

This is the visual centrepiece of the application.

Use MapLibre GL JS to render a dark, full-width world map.

Focus initially on Europe, Africa and Asia, with the Suez Canal clearly visible.

## Required geographic locations

Show markers for:

- Suez Canal.
- Bab el-Mandeb Strait.
- Strait of Hormuz.
- Strait of Malacca.
- Panama Canal.
- Cape of Good Hope.

Provide the approximate geographic coordinates for these locations.

Allow the user to zoom, pan and click markers.

## Shipping routes

Visualise the following representative routes:

- Shanghai → Rotterdam.
- Singapore → Rotterdam.
- Mumbai → Rotterdam.
- Shanghai → Hamburg.
- Singapore → Felixstowe.

Draw geographically plausible maritime paths rather than straight lines across continents.

For the initial build, bundled GeoJSON polylines are acceptable.

Support two alternatives:

**Route A: Via Suez Canal**

- Cyan line.
- Default route.
- Highlighted under normal conditions.

**Route B: Around Cape of Good Hope**

- Amber line.
- Alternative route during disruption.
- Show additional distance and travel time.

When a user simulates a Suez closure:

- Mark the canal as disrupted.
- Animate relevant maritime routes changing.
- Display affected vessel counts.
- Highlight vessels selected for rerouting.
- Show rerouting paths.
- Update the estimated financial impact.

## Vessel markers

Generate a synthetic fleet of 100–300 vessels.

Each vessel should have:

- Unique vessel ID.
- Vessel type.
- Origin port.
- Destination port.
- Current geographic position.
- Speed in knots.
- Estimated daily operating cost.
- Cargo priority.
- Delivery deadline.
- Current recommended action.

These vessels must be labelled as simulated.

Animate positions along shipping routes using interpolated coordinates.

Clicking a vessel opens a detailed information card containing its route, estimated arrival time, cost and recommendation.

Include a playback button, animation-speed controls and reset functionality.

Avoid rendering hundreds of heavy DOM elements if map layers would perform better.

---

# 7. Traffic Intelligence Page

Build a dedicated page for historical maritime traffic analysis and forecasting.

## Historical traffic visualisation

Display a line chart of daily vessel transits through the selected chokepoint.

Support:

- 30-day view.
- 90-day view.
- One-year view.
- Full-history view.

Add filters for:

- Total vessels.
- Container ships.
- Tankers.
- Bulk carriers.
- General cargo.

Show:

- Observed vessel traffic.
- Seven-day rolling mean.
- Historical baseline.
- Forecast vessel traffic.
- Prediction intervals.

Observed data and forecast data must be visually distinguishable.

## Forecast metrics

Include:

- Forecast daily traffic.
- Percentage change from baseline.
- Prediction interval.
- MAE.
- RMSE.
- Forecast horizon.

Create a model information panel explaining:

- Model family.
- Input features.
- Training window.
- Last training date.
- Forecast horizon.
- Evaluation methodology.

## Backend integration

Create a clean interface supporting future endpoints:

GET /api/traffic/history

GET /api/traffic/forecast

GET /api/traffic/chokepoints

If the backend does not exist, use local bundled data.

Do not fabricate evaluation scores and present them as real.

For example, display "Demo model — evaluation pending" until actual evaluation results are provided.

---

# 8. Scenario Simulator

This should be the application's most interactive feature.

Users must be able to create a maritime disruption and immediately see predictions and recommended interventions.

## Scenario controls

Provide the following editable parameters:

**Chokepoint**

- Suez Canal.
- Bab el-Mandeb.
- Panama Canal.
- Strait of Malacca.

Fully support Suez in the initial implementation; other locations can have reduced functionality if clearly indicated.

**Disruption type**

- Complete closure.
- Partial capacity restriction.
- Reduced transit speed.

**Expected disruption duration**\
Slider from 1 to 30 days.

**Disruption uncertainty**\
Slider representing uncertainty in reopening time.

**Affected vessels**\
Slider from 10 to 500 vessels.

**Average vessel speed**\
Slider from 10 to 25 knots.

**Daily operating cost**\
Slider from $10,000 to $150,000 per vessel.

**Fuel cost multiplier**\
Slider from 0.5 to 2.0.

**Cargo urgency**

- Low.
- Medium.
- High.

**Risk preference**

- Minimise expected cost.
- Balanced.
- Minimise worst-case loss.

## Simulation actions

Buttons:

- Run Simulation.
- Compare Scenarios.
- Reset Scenario.
- Export Results.

When Run Simulation is pressed, update the calculated results using the parameters currently selected.

The core engine must calculate meaningful outputs rather than generating unrelated random numbers.

## Simulation results

Display:

- Forecast vessels affected.
- Number recommended to wait.
- Number recommended to reroute.
- Number recommended to delay departure.
- Total expected cost without optimisation.
- Total expected cost with optimisation.
- Estimated cost saving.
- Average delivery delay.
- Percentage of vessels expected to miss delivery deadlines.

Include a scenario comparison chart.

Use deterministic results for the same inputs and random seed.

---

# 9. Route Optimisation Engine

Implement a simplified but mathematically consistent vessel decision engine in TypeScript.

This may later be replaced with a Python optimisation backend.

Each simulated vessel has two or three possible decisions:

1. Wait for Suez reopening.
2. Reroute via Cape of Good Hope.
3. Delay departure, if the vessel has not yet departed.

For each option, estimate:

- Travel distance.
- Voyage duration.
- Additional delay.
- Operating cost.
- Fuel cost where separately modelled.
- Late-delivery penalties.
- Total expected cost.

Avoid double-counting fuel costs already included in an all-inclusive daily operating cost.

Compute baseline voyage time:

voyageDays = nauticalMiles / (speedKnots × 24)

Compute estimated waiting duration from the disruption scenario.

Calculate reroute cost using extra sailing distance and vessel-specific cost assumptions.

Calculate potential late penalties based on a delivery deadline.

The optimiser should select the action minimising the appropriate objective.

For example:

ExpectedCost(action) =\
ExpectedOperatingCost +\
ExpectedWaitingCost +\
ExpectedLatePenalty

When risk preferences are selected, include a risk penalty associated with uncertain outcomes.

Every recommendation must include a short explanation.

Example:

"Reroute recommended because the expected reopening delay exceeds the additional voyage duration. Estimated cost reduction: $420,000."

The figures must be calculated from scenario inputs, not hardcoded.

For vessels with alternative-route infeasibility, mark the action unavailable.

---

# 10. Monte Carlo Risk Analysis

Build a working simulation that evaluates uncertain disruption durations.

Use 500–1,000 simulated reopening scenarios.

Allow the user to adjust:

- Mean expected closure duration.
- Closure-duration uncertainty.
- Daily vessel costs.
- Cargo delay penalties.
- Risk preference.

Use a seeded random generator so results are reproducible.

Sample non-negative closure durations from a suitable probability distribution and clearly label the modelling assumption.

For each vessel and candidate decision:

- Calculate outcome under each sampled closure duration.
- Estimate mean cost.
- Estimate median cost.
- Calculate 90th- and 95th-percentile costs.
- Estimate probability of missing deadline.
- Calculate a tail-risk metric such as CVaR.

## Charts

Include:

- Distribution of predicted disruption costs.
- Expected cost by strategy.
- P10/P50/P90 outcome comparison.
- Cost sensitivity to closure duration.
- Cumulative cost distribution.
- Comparison of wait versus reroute decisions.

## Critical feature: "What If We're Wrong?"

Add a prominent button called:

**WHAT IF WE'RE WRONG?**

When clicked, display a stress-test panel.

Show how the recommended strategy performs if the disruption lasts:

- Half as long as expected.
- As long as expected.
- Twice as long as expected.
- Three times as long as expected.

Show whether the original recommendation remains optimal.

Highlight where the decision switches from waiting to rerouting.

This is a signature feature of the product.

---

# 11. Fleet Optimiser Page

Create a professional, filterable table containing all simulated vessels.

Columns:

- Vessel ID.
- Vessel type.
- Origin.
- Destination.
- Current position.
- Original ETA.
- Revised ETA.
- Expected delay.
- Recommended action.
- Expected cost.
- Estimated savings.
- Risk category.

Support sorting and filtering by:

- Vessel type.
- Route.
- Recommended action.
- Risk level.
- Estimated financial impact.

Clicking a row opens a detailed vessel decision breakdown.

## Vessel detail view

Display:

- Original route.
- Alternative route.
- Total voyage distance.
- Additional voyage distance.
- Estimated arrival time.
- Expected cost of waiting.
- Expected cost of rerouting.
- Probability of missing deadline.
- Recommended decision.
- Explanation of the optimisation result.

Include a simple interactive chart showing the cost of waiting and rerouting as closure duration changes.

Display the break-even closure duration for each vessel.

## Fleet-level optimisation

Provide a comparison of:

- Always Wait.
- Always Reroute.
- Optimised Strategy.

Show:

- Total expected cost.
- Mean voyage delay.
- Missed delivery deadlines.
- Tail-risk exposure.
- Savings against baselines.

All figures must derive from the same vessels, costs and disruption assumptions.

---

# 12. Model Performance Page

Build a page showing whether predictions and optimisation decisions are actually useful.

This should appeal to technically sophisticated judges.

## Forecast evaluation

Display:

- Predicted versus actual historical traffic.
- Forecast error over time.
- MAE.
- RMSE.
- Comparison against a naive forecast.
- Comparison against a seven-day moving average.

Provide a labelled example interface when real model outputs are not connected.

Do not generate fake model accuracy and label it as validated.

## Decision evaluation

Compare:

- Always Wait.
- Always Reroute.
- Prediction-Informed Optimisation.
- Perfect Foresight Oracle.

The perfect foresight oracle is for retrospective simulation benchmarking only and must not be presented as a deployable strategy.

Evaluate decisions across scenarios with different actual closure durations.

Calculate:

- Average realised cost.
- Percentage cost saving against baselines.
- Worst-case cost.
- Regret relative to the oracle.

Highlight how better information affects decision quality.

Use the same simulated fleet and cost assumptions for every strategy.

---

# 13. Data Sources Page

Build a transparent data-provenance interface.

Display each dataset with:

- Dataset name.
- Provider.
- Description.
- Data fields used.
- Historical coverage.
- Last retrieval time, where known.
- Whether the source is observed, derived, forecast or simulated.
- Link to original source.
- Integration status.

Include:

**IMF PortWatch**\
[https://portwatch.imf.org/](https://portwatch.imf.org/)

Historical maritime chokepoint traffic data.

**SeaRoute**\
[https://pypi.org/project/searoute/](https://pypi.org/project/searoute/)

Approximate maritime routing and distance calculations.

**UN Comtrade**\
[https://comtradeplus.un.org/](https://comtradeplus.un.org/)

International trade statistics.

**Open-Meteo Marine API**\
[https://open-meteo.com/en/docs/marine-weather-api](https://open-meteo.com/en/docs/marine-weather-api)

Marine environmental data.

**Simulated Fleet**\
Internally generated synthetic vessel scenarios.

Clearly explain that aggregate observed maritime traffic does not provide individual commercial vessel costs, exact cargo values or reopening predictions.

Use visible data-provenance badges throughout the product:

- OBSERVED
- FORECAST
- MODELLED
- SIMULATED

---

# 14. API and Integration Architecture

Create the frontend around typed service interfaces.

Suggested endpoints:

GET /api/chokepoints

GET /api/traffic/history?chokepoint=suez

GET /api/traffic/forecast?chokepoint=suez&days=7

POST /api/scenarios/simulate

POST /api/routes/optimise

POST /api/risk/monte-carlo

GET /api/fleet

GET /api/models/performance

Do not assume the Python backend exists yet.

For the MVP, implement working local mock services returning deterministic, internally consistent scenario results.

Keep all API URLs configurable with environment variables.

Include reusable TypeScript types for:

- Chokepoint.
- HistoricalTrafficRecord.
- TrafficForecast.
- Vessel.
- MaritimeRoute.
- DisruptionScenario.
- VesselDecision.
- OptimisationResult.
- RiskSimulationResult.
- ModelEvaluation.

Design the data layer so replacing mock services with FastAPI fetch calls requires minimal changes to React components.

---

# 15. User Experience and Interaction Requirements

Every major dashboard control should do something meaningful.

Required interactions:

- Select different chokepoints.
- Change date ranges.
- Switch vessel categories.
- Modify disruption parameters.
- Run simulations.
- Compare scenarios.
- Select vessels on the map.
- Inspect vessel decisions.
- Sort and filter fleet data.
- Compare route alternatives.
- Change risk preferences.
- Run uncertainty stress tests.
- Export scenario results to CSV.
- Reset scenarios to defaults.

Show loading states, empty states and informative errors.

Display explanatory tooltips for technical statistics.

Use smooth but restrained animations.

Avoid fake notifications and misleading live-data indicators.

Support responsive layouts, but prioritise desktop use.

---

# 16. Signature Visual Elements

Include the following:

## A. Maritime Command Map

A large, dark geographic map showing shipping routes, chokepoints and simulated vessels.

## B. Disruption Timeline

A timeline showing:

- Disruption begins.
- Queue starts growing.
- Vessels begin rerouting.
- Expected reopening.
- Traffic recovery.

## C. Strategy Comparison

A clear visual comparison of three strategies:

Always Wait / Always Reroute / Optimised.

## D. Break-Even Analysis

An interactive chart showing the closure duration at which rerouting becomes cheaper than waiting.

## E. Risk Distribution

A probability distribution of possible financial losses under uncertain reopening times.

## F. Decision Explanation

A human-readable explanation describing why each vessel received its recommended action.

---

# 17. Default Demonstration Scenario

The application should open with a complete, engaging demonstration scenario.

**Scenario name:** Suez Canal Disruption

Use these explicitly simulated parameters:

- Chokepoint: Suez Canal.
- Status: Complete closure.
- Expected duration: 7 days.
- Duration uncertainty: 3 days.
- Synthetic fleet: 150 vessels.
- Typical vessel speed: 15 knots.
- Average daily operating cost: $50,000.
- Selected origin: Shanghai.
- Selected destination: Rotterdam.
- Available alternative: Cape of Good Hope.
- Optimisation objective: Minimise expected total cost.

When the application loads:

1. Show the Suez Canal highlighted in red.
2. Show normal routes and alternative routes.
3. Display initial scenario KPIs.
4. Automatically calculate fleet-level outcomes.
5. Show a strategy recommendation.
6. Allow the user to immediately change any assumption.

Make the experience feel like an operational scenario being investigated by a maritime intelligence team.

Do not describe the simulation as a currently occurring real-world event.

---

# 18. Code Organisation

Use a clean architecture such as:

app/

- page.tsx
- overview/
- map/
- traffic/
- scenarios/
- fleet/
- risk/
- performance/
- data/

components/

- layout/
- dashboard/
- maritime-map/
- charts/
- scenario/
- fleet/
- shared/

lib/

- api/
- data/
- simulation/
- optimisation/
- risk/
- geo/
- utils/

types/

Separate domain calculations from UI components.

Implement the scenario calculations as pure, testable TypeScript functions.

Include a deterministic synthetic fleet generator.

Ensure that numerical outputs remain consistent across the Overview, Simulator, Fleet Optimiser and Risk Analysis pages.

Do not recalculate different random scenarios independently on each page.

---

# 19. Quality Requirements

Prioritise:

1. Functional interactions.
2. Coherent quantitative calculations.
3. An exceptional map-based demonstration.
4. Clear scenario-to-decision flow.
5. Professional visual quality.
6. Transparent separation of observed and simulated data.
7. Extensibility for a real Python backend.

Do not use arbitrary random numbers as dashboard values.

All simulated figures should derive from documented assumptions.

Avoid unnecessary animations that distract from the analysis.

Use realistic units:

- Nautical miles.
- Knots.
- Days.
- Vessel counts.
- USD.
- Percentages.

Use correct date and number formatting.

Include accessibility features such as keyboard navigation and adequate text contrast.

---

# 20. Definition of Done

The generated application is complete when a user can:

1. Open CHOKEPOINT and see a professional maritime intelligence dashboard.
2. Inspect the Suez Canal on an interactive world map.
3. View historical or clearly labelled illustrative vessel traffic.
4. Create a disruption scenario.
5. Change the expected closure duration.
6. Watch the projected financial consequences change.
7. Run a working wait-versus-reroute optimisation.
8. View recommendations for individual simulated vessels.
9. Compare fleet strategies.
10. Run an uncertainty stress test.
11. Understand why the model recommended a particular action.
12. Export the results.

**Most important instruction: Build the working application, not a static mockup.**

If everything cannot be implemented in one generation, prioritise a fully working vertical slice consisting of:

- Overview dashboard.
- Interactive maritime map.
- Suez Canal scenario simulator.
- Deterministic vessel cost model.
- Wait-versus-reroute optimiser.
- Strategy comparison.
- "What If We're Wrong?" stress test.

The resulting product should be impressive enough to demonstrate live to quantitative researchers and software engineers at Hudson River Trading.

The central product promise is:

**CHOKEPOINT turns uncertainty in global maritime trade into measurable, optimised decisions.**



turn this into a markdown file
