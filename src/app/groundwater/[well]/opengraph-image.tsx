import { ImageResponse } from "next/og";
import { getWells } from "@/lib/groundwater";
import { fmtDate, fmtNumber } from "@/lib/format";
import { OG, OG_CONTENT_TYPE, OG_SIZE, ogHost } from "@/lib/og";
import { EMBLEM_DATA_URI } from "@/lib/emblem";

export const alt = "Groundwater monitoring well";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const revalidate = 3600;

/**
 * Well share card.
 *
 * Uses only the wells feed — deliberately not `getWellHistory`, which downloads
 * the well's complete hourly record (~5 MB) and would make an unfurl slower than
 * loading the page.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ well: string }>;
}) {
  const { well: number } = await params;
  const wells = await getWells().catch(() => []);
  const well = wells.find((w) => w.number === number);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: OG.background,
          color: OG.foreground,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, color: OG.accent, letterSpacing: 1 }}>
              TEXAS LAKE LEVELS · GROUNDWATER
            </div>
            <div style={{ fontSize: 58, marginTop: 16 }}>{`Well ${number}`}</div>
            <div style={{ fontSize: 26, color: OG.muted, marginTop: 12 }}>
              {well
                ? [well.aquifer, well.county ? `${well.county} County` : null]
                    .filter(Boolean)
                    .join(" · ")
                : "TWDB groundwater monitoring"}
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori JSX, not DOM */}
          <img
            src={EMBLEM_DATA_URI}
            alt=""
            width={180}
            height={180}
            style={{ marginLeft: 40 }}
          />
        </div>

        {well ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div style={{ fontSize: 140, color: OG.accent, lineHeight: 1 }}>
                {fmtNumber(well.depthFt, 1)}
              </div>
              <div
                style={{
                  fontSize: 30,
                  color: OG.muted,
                  marginLeft: 22,
                  marginBottom: 22,
                }}
              >
                ft below land surface
              </div>
            </div>
            <div style={{ fontSize: 24, color: OG.muted, marginTop: 16 }}>
              A larger depth means a deeper water table
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 34, color: OG.muted }}>
            TWDB groundwater monitoring network
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderTop: `2px solid ${OG.border}`,
            paddingTop: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 26,
              color: OG.muted,
            }}
          >
            <div style={{ display: "flex" }}>
              {well?.aquiferType
                ? `${well.aquiferType} aquifer`
                : "Monitoring well"}
            </div>
            <div style={{ display: "flex" }}>
              {well ? fmtDate(well.date) : ""}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 23,
              marginTop: 18,
            }}
          >
            <div style={{ display: "flex", color: OG.accent }}>
              {`${ogHost()}/groundwater/${number}`}
            </div>
            <div style={{ display: "flex", color: OG.muted }}>
              Depth history · Aquifer map · All monitoring wells
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
