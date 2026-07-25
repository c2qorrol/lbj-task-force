import type { Metadata } from "next";
import { Card } from "@/components/ui";
import CopyButton from "@/components/CopyButton";

/** Checked against its EIP-55 checksum before being published here. */
const ETH_ADDRESS = "0x89705f4d632E93F8a466683Dc520577Ec08D37e0";

const DESCRIPTION =
  "Where the data comes from, how reservoirs are matched to gages, and what the numbers mean.";

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  // No bespoke card for this route; fall back to the site-wide image.
  openGraph: {
    url: "/about",
    title: "About Texas Lake Levels",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: { card: "summary_large_image", title: "About Texas Lake Levels", description: DESCRIPTION },
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">About this site</h1>
        <p className="text-sm text-muted mt-1">
          Statewide Texas reservoir monitoring, combining daily authoritative
          storage figures with real-time gage readings.
        </p>
      </div>

      <div className="flex justify-center pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- static
            pre-sized PNG, same reasoning as the header logo in layout.tsx. */}
        <img
          src="/emblem-large.png"
          alt="LBJ Task Force emblem"
          width={160}
          height={160}
          className="w-32 h-32 sm:w-40 sm:h-40"
        />
      </div>

      <Card>
        <h2 className="font-semibold mb-2">Creators</h2>
        <p className="text-sm text-muted">
          This site was built by true Saint Hedwig patriots and pure-hearted
          cyber angels.
        </p>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium">Source code</dt>
            <dd className="text-muted">
              <a
                href="https://github.com/c2qorrol/lbj-task-force"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                github.com/c2qorrol/lbj-task-force
              </a>{" "}
              — everything that runs this site, including the scripts that
              precompute its data and the notes on why each source is treated
              the way it is.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Ethereum donations</dt>
            <dd className="text-muted">
              If the site has been useful to you, donations are welcome. No
              account, no sign-up, and nothing that identifies you.
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <code className="nums text-xs sm:text-sm break-all rounded-md border border-border bg-background px-2 py-1 text-foreground">
                  {ETH_ADDRESS}
                </code>
                <CopyButton value={ETH_ADDRESS} label="Copy address" />
              </span>
              <span className="mt-2 block text-xs">
                Ethereum mainnet. Transfers cannot be reversed and nobody can
                recover a send to the wrong address, so copy this one rather
                than typing it, and check it in your wallet before confirming.
              </span>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Data sources</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium">Texas Water Development Board</dt>
            <dd className="text-muted">
              Daily conditions for 122 major reservoirs: elevation, surface area,
              conservation storage, and percent full, plus full period-of-record
              history. TWDB is the authoritative source for storage, because
              converting an elevation into a volume requires a reservoir-specific
              area-capacity curve that TWDB maintains.
            </dd>
          </div>
          <div>
            <dt className="font-medium">USGS National Water Information System</dt>
            <dd className="text-muted">
              Roughly 165 active Texas lake-elevation gages reporting about every
              15 minutes, plus 618 river discharge gages used for inflow and
              release. This is what makes intraday movement visible, well before
              the next daily TWDB posting.
            </dd>
          </div>
          <div>
            <dt className="font-medium">US Drought Monitor</dt>
            <dd className="text-muted">
              Weekly drought severity for every Texas county, from the National
              Drought Mitigation Center, USDA and NOAA.
            </dd>
          </div>
          <div>
            <dt className="font-medium">TWDB groundwater monitoring</dt>
            <dd className="text-muted">
              Around 400 recorder wells across 24 aquifers, giving the other half
              of the Texas water picture that reservoirs cannot show.
            </dd>
          </div>
          <div>
            <dt className="font-medium">CoCoRaHS</dt>
            <dd className="text-muted">
              The Community Collaborative Rain, Hail &amp; Snow Network — around
              2,000 Texas volunteers who read a rain gauge each morning and
              report a 24-hour total.
            </dd>
          </div>
          <div>
            <dt className="font-medium">US Army Corps of Engineers (CWMS)</dt>
            <dd className="text-muted">
              Real-time pool elevation for Lake Texoma and O. H. Ivie, which have
              no USGS lake gage.
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">How reservoirs are matched to gages</h2>
        <p className="text-sm text-muted">
          TWDB and USGS use unrelated identifiers and quite different names — the
          same lake is &ldquo;Lake Lyndon B Johnson&rdquo; in one system and
          &ldquo;LCRA Lk LBJ nr Marble Falls, TX&rdquo; in the other. Matching is
          therefore done on position: a USGS gage within 8&nbsp;km of the TWDB gage
          location is accepted outright, and one between 8 and 30&nbsp;km is
          accepted only if the names share a distinctive word.
        </p>
        <p className="text-sm text-muted mt-2">
          That resolves 110 of the 122 reservoirs. The remaining 12 — including
          Amistad, Falcon, Texoma, and Toledo Bend — have no real-time USGS
          lake-elevation gage because they are operated by IBWC or USACE, which
          publish through separate systems. Those lakes show daily TWDB data only.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Historical percentiles</h2>
        <p className="text-sm text-muted">
          TWDB&apos;s record goes back decades — to 1940 for Lake Travis. Each
          lake page compares today against every other year on the same date, so
          you can tell whether a level is genuinely unusual or simply seasonal.
          Comparisons pool the three days either side of the date, because a
          single calendar day has only one reading per year and its extremes are
          noisy.
        </p>
        <p className="text-sm text-muted mt-2">
          Percentiles use percent full, the only measure comparable across
          decades — elevation datums and reservoir capacities are periodically
          re-surveyed. Sedimentation means capacity itself changes over time, so
          cross-decade comparisons are close but not exact.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Drought</h2>
        <p className="text-sm text-muted">
          Drought conditions come from the US Drought Monitor, a joint product of
          the National Drought Mitigation Center, USDA and NOAA, published every
          Thursday. The statewide map has a county overlay, and each lake page
          shows conditions in the county containing its dam.
        </p>
        <p className="text-sm text-muted mt-2">
          Counties are shaded by the <em>worst</em> category present anywhere
          within them, so a county shaded D3 is not necessarily in extreme
          drought throughout. The DSCI figure is the Drought Severity and
          Coverage Index, a 0–500 summary that rises with both how severe the
          drought is and how much of the area it covers.
        </p>
        <p className="text-sm text-muted mt-2">
          Drought where a reservoir sits does not by itself explain its level.
          Most reservoirs are filled by a watershed reaching well beyond a single
          county, and releases are managed for supply and flood control, so treat
          this as context rather than cause.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Rainfall</h2>
        <p className="text-sm text-muted">
          Rainfall comes from CoCoRaHS volunteer observers rather than automated
          gauges. That is a deliberate choice: the obvious automated source,
          USGS precipitation, mixes stations reporting an interval total with
          stations reporting a running cumulative total, and the API does not
          reliably distinguish them — adding them up produced a 56-inch daily
          figure for one Texas site, which would be a world record. CoCoRaHS
          publishes a single already-totalled 24-hour reading per station.
        </p>
        <p className="text-sm text-muted mt-2">
          The trade-off is timing: these are read by hand once each morning, so
          they are not real-time the way the lake and river gauges are. On lake
          pages, rainfall is measured <em>near the dam</em>, not across the
          watershed — a reservoir&apos;s catchment can extend hundreds of
          kilometres upstream, so local rain and reservoir inflow are related
          but far from the same thing.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">River flows</h2>
        <p className="text-sm text-muted">
          Where available, lake pages show discharge at the nearest gaged river
          reaches above and below the dam. These gages are identified by walking
          the USGS hydrography network upstream and downstream from the dam, not
          by distance — a gage a few kilometres away is often on an entirely
          different river.
        </p>
        <p className="text-sm text-muted mt-2">
          The distance from the dam is shown for each gage, because it determines
          how literally to read it: a release gage 2&nbsp;km below the dam
          measures that dam&apos;s outflow, while one 60&nbsp;km downstream has
          picked up tributaries along the way. The &ldquo;gaged net&rdquo; figure
          is <strong className="text-foreground">not</strong> a closed water
          balance — ungaged tributaries, rain falling on the lake, evaporation,
          and direct withdrawals are all unmeasured, so it will not reconcile
          exactly with the change in storage.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Reading the numbers</h2>
        <ul className="text-sm text-muted space-y-2">
          <li>
            <strong className="text-foreground">Percent full</strong> is storage
            in the conservation pool divided by conservation capacity. It can
            exceed 100% when a reservoir rises into its flood pool, which is
            normal and temporary for flood-control lakes.
          </li>
          <li>
            <strong className="text-foreground">Statewide and basin figures</strong>{" "}
            are storage-weighted, not averages of percentages, so Toledo Bend
            counts for far more than a small municipal lake. They also exclude
            Elephant Butte, which lies in New Mexico — TWDB leaves it out of
            Texas totals, and including it would shift the statewide figure by
            several points because it is very large and nearly empty.
          </li>
          <li>
            <strong className="text-foreground">Supply outlook</strong> projects
            the last 60 days of drawdown forward. It is an extrapolation, not a
            forecast: it ignores seasonality, rainfall and managed releases, and
            drawdown normally slows as a reservoir falls.
          </li>
          <li>
            <strong className="text-foreground">Groundwater levels</strong> are
            feet below the land surface, so a larger number means a deeper water
            table — an increase is a decline. Depths cannot be compared between
            wells, only tracked over time within one well.
          </li>
          <li>
            <strong className="text-foreground">Elevation</strong> is feet above
            mean sea level. USGS and TWDB elevations for the same lake can differ
            slightly because of vertical datum (NAVD88 vs NGVD29) and reading time.
          </li>
          <li>
            <strong className="text-foreground">Dead pool</strong> is the elevation
            below which water cannot be released by gravity through the outlet
            works.
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">JSON API</h2>
        <ul className="text-sm space-y-2 nums">
          <li>
            <code className="text-accent">GET /api/lakes</code>
            <span className="text-muted font-sans">
              {" "}
              — all reservoirs; supports <code>?basin=</code> and <code>?status=</code>
            </span>
          </li>
          <li>
            <code className="text-accent">GET /api/lakes/travis</code>
            <span className="text-muted font-sans">
              {" "}
              — one reservoir; supports <code>?range=30day|1year|all</code> and{" "}
              <code>?gage=1</code>
            </span>
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Disclaimer</h2>
        <p className="text-sm text-muted">
          All data is provisional and subject to revision by the originating
          agency. This site is not affiliated with TWDB, USGS, or any river
          authority, and must not be used for navigation, flood response, dam
          safety, or any other life-safety decision. For official flood
          information, consult the National Weather Service and your local river
          authority.
        </p>
      </Card>
    </div>
  );
}
