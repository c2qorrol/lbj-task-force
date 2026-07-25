# Roadmap

What is worth building next, and why. Ordered by judgement rather than
ceremony — the top section is the part that would hurt most to keep ignoring.

## Foundations

The site is deployed, documented and public; the engineering around it is
thinner than the engineering inside it.

- **Tests around the parsers.** Correctness rests on hand-rolled parsers for
  TWDB CSV, USGS RDB, NWPS JSON and CoCoRaHS exports — formats owned by third
  parties who will change them. There is no test script at all. Fixture-based
  tests over the parsers and the pure functions (`classifyFlow`, `computeTrend`,
  `summarize`, `computeSupplyOutlook`) would convert "silently wrong numbers"
  into "failing build". Highest value item here.
- **Scheduled data refresh.** `src/data/` and `public/history/` are
  point-in-time snapshots refreshed only when someone remembers. New gages,
  re-attributed reaches and drifting normals accumulate quietly. A scheduled
  GitHub Action opening a PR with the regenerated files would close it, and a
  PR rather than a direct push keeps a human in the loop on data movement.
- **Upstream health check.** If TWDB renames a field, the first to notice is a
  visitor. A route or scheduled job that asserts each feed still parses turns
  that into an alert.

## Cheap wins

Small, self-contained, and mostly reuse machinery that already exists.

- **An OG card for `/cities`.** Probably the most shareable page on the site
  ("El Paso at 1.6%") and it currently unfurls with the generic statewide card.
  The four existing cards are the template.
- **Expose the newer data through the API.** `/api/lakes` exists, but city
  rollups, flow percentiles and forecasts are HTML-only. `/api/cities` plus a
  documented API section on `/about` makes the site citable by journalists and
  researchers, which is a real audience for this data.
- **Web app manifest.** The icons exist; without `src/app/manifest.ts` the site
  cannot install to a home screen properly.
- **A license.** Public with no license means all rights reserved — readable
  but not reusable. MIT or Apache-2.0 if reuse is wanted.

## Data features

Ordered roughly by value per unit of effort.

- **NWS flood watches and warnings by county.** Keyless, and a natural banner
  on lake and map pages. Complements the gauge-level flood categories already
  shown with the official *alert* rather than an inferred state.
- **Basin rainfall forecast (QPF).** "Expected rain over this basin in the next
  seven days" is the natural leading indicator to pair with the inflow gages,
  and would make the supply outlook considerably more honest than a trailing
  extrapolation.
- **Water-use restrictions (TCEQ).** Which public water systems are in drought
  contingency stages — the single most actionable fact a Texan can get here,
  and a perfect pairing with `/cities`. The catch is that TCEQ's data is not
  API-friendly, so it needs a scraper in the `sync-*` mould.
- **Amistad and Falcon via IBWC.** Both are shared with Mexico and TWDB's
  number tells only part of the story. IBWC publishes the US/Mexico split
  daily; a panel on those two lake pages would cover a chronic South Texas
  water story properly.
- **Evaporation estimates.** TWDB publishes monthly quadrangle evaporation.
  Evaporative loss often exceeds municipal draw in a Texas summer, which is
  both genuinely educational and an input the supply outlook currently ignores.
- **Lake water temperature.** USGS parameter `00010` where gaged. Cheap, and
  of obvious interest to anglers and swimmers.
- **Historical drought benchmarking.** "Today vs 2011 vs the 1950s drought of
  record" — buildable entirely from the period-of-record history and USDM
  archives already on hand. Editorial, shareable, no new upstream.

## Product

- **Alerts.** People who care about one lake want to be told when it changes.
  Email is a project; an RSS/Atom feed of threshold crossings (a lake dropping
  below 25%, a gauge entering a flood category) is cheap and fits the existing
  revalidation machinery.

## Recently shipped

Kept short deliberately — the README documents how these work.

- NWS river forecasts on lake pages, with the forecast peak called out.
- Streamflow percentile colouring on the map, replacing the decommissioned
  WaterWatch service with precomputed USGS daily statistics.
- `/cities` — municipal supply-system rollups from TWDB's own groupings.
- Link previews rebuilt: larger emblem, the shared URL and its sub-links.
- Cloudflare Workers Builds deployment; CI on GitHub Actions with no
  credentials stored off-platform.
