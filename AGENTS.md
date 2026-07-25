<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- Everything below is hand-written. The block above is generated — leave its
     markers and contents alone, and add new guidance outside them. -->

# Working in this repo

**Texas Lake Levels** (https://lbjtaskforce.com) — statewide reservoir, river,
drought and groundwater conditions. Next.js App Router, deployed to Cloudflare
Workers through the OpenNext adapter.

`README.md` is the reference documentation: it explains *why* each subsystem
works the way it does, and is worth reading before changing one.
`docs/data-sources.md` tabulates every upstream and its quirks;
`docs/roadmap.md` tracks what is worth building next. This file is the short
list of things that are easy to get wrong.

## Before you claim it works

```bash
npx tsc --noEmit && npm run lint && npm test && npm run cf:build
```

`npm test` (vitest, `tests/`) covers the upstream parsers, the pure
calculations they feed, and the sync scripts' parsing and matching logic. It
never touches the network: every case hands the code a fixture reproducing a
real quirk of the feed. **If you change a parser, add the malformed input that
motivated the change** — the failure mode that matters here is a silently
wrong number, not a crash.

Watch for one bug shape in particular, which has now appeared twice:
`Number(null)` and `Number("")` are both `0`, so a guard like
`Number.isFinite(Number(cell))` accepts an absent value and publishes it as a
zero. Check for null and empty string explicitly before converting.

`cf:build` is the real Workers build, and catches Satori and runtime
incompatibilities that `next dev` cannot.

## Deployment is automatic — don't

Cloudflare Workers Builds builds and deploys on every push to `main`. **Do not
run `npm run cf:deploy` unless explicitly asked**: it publishes the working
tree straight to production, bypassing review.

Never add a Cloudflare API token to GitHub. That was tried and deliberately
removed; the README records what it would have to be scoped to and why that is
too much to hold off-platform.

## Upstream data

- **Every upstream fetch goes through `src/lib/`** and is cached at the data
  layer with `next: { revalidate }`. Components never fetch upstream directly.
- **TWDB throttles bursts** — 502/503 after roughly 100 rapid requests. Never
  fan out per-lake. This is why there is no `generateStaticParams` over the 122
  reservoirs, and why period-of-record history is precomputed.
- **Precomputed data is committed and never regenerates at request time.**
  `src/data/*.json` and `public/history/*.json` come only from
  `scripts/sync-*.mjs`. A stale checkout serves stale normals rather than
  failing. Each script runs `main()` only when executed directly, so its
  parsers can be imported and tested — keep that guard if you add one.
- **Optional enrichment must never break a page.** Wrap secondary upstreams in
  `.catch(() => fallback)`, and stream slow panels through `<Suspense>` so a
  cold fetch cannot hold the document.

## Keep heavy data out of client bundles

`src/lib/flowstats.ts` is server-only — it imports a ~120 KB thresholds table.
Client components import the palette from `src/lib/flowclass.ts` instead and
receive the classification as props. Any future lookup table follows the same
split: data server-side, presentation tokens in a separate leaf module.

## OG images are Satori, not a browser

`src/app/**/opengraph-image.tsx` renders through Satori, which supports only a
subset of CSS: flexbox only (no grid), every element with more than one child
needs an explicit `display: flex`, colours must be literal values rather than
the CSS variables the site itself uses, and images must be data URIs
(`src/lib/emblem.ts`) because nothing can be fetched at render time on Workers.

## Domain rules that look like bugs

- **Statewide aggregates exclude non-Texas reservoirs** (the `isTexas` tag), to
  match TWDB's published figure. Including Elephant Butte drags the statewide
  number from 78.3% to 73.8%.
- **City supply systems deliberately include them** — Elephant Butte *is* El
  Paso's supply. Supply systems also overlap (Lake Texoma serves both Dallas
  and Texarkana), so they must never be summed with one another.
- **The supply outlook is an extrapolation, not a forecast**, and is labelled
  that way in the UI. Keep that framing: the only genuine forecast on the site
  is the NWS series in `ForecastPanel`.

## Assets

The emblem has one master, `lbj-taskforce-emblem-cyberpunk.png` at the repo
root. Edit that, then run `npm run generate:emblem` to rebuild all six derived
files (favicon, app icon, apple icon, header logo, dashboard hero, and the
inlined OG data URI). Never hand-edit a derived file.

## Environment

Windows. Both PowerShell and Git Bash are available — pick one syntax per
command rather than mixing them. A `workerd` process left behind by
`cf:preview` keeps a handle on `.open-next/`, and the next build dies with
`EPERM ... rm`; stop the process and delete the directory.

## House style

Comments explain **why**, and cite the observation that motivated them — "TWDB
throttles aggressive clients (we saw 502/503 after ~100 rapid requests)" rather
than "fetch the data". Don't narrate what the next line does. Match the
surrounding density: this codebase comments decisions, not mechanics.

Formatting goes through `src/lib/format.ts` (`fmtAcreFeet`, `fmtPercent`,
`fmtFeet`, `fmtSigned`, …) and colour through the shared token maps
(`STATUS_HEX`, `DROUGHT_HEX`, `FLOOD_HEX`, `FLOW_CLASS_HEX`), so a unit or a
palette is defined exactly once.

The repository is public. Nothing secret belongs in a commit — the only
committed configuration values are the public site URL and a KV namespace id.
