import { ImageResponse } from "next/og";
import { getReservoir } from "@/lib/twdb";
import {
  fillStatus,
  fmtAcreFeet,
  fmtDate,
  fmtFeet,
  fmtPercent,
  STATUS_LABEL,
} from "@/lib/format";
import { OG, OG_CONTENT_TYPE, OG_SIZE, OG_STATUS, ogHost } from "@/lib/og";
import { EMBLEM_DATA_URI } from "@/lib/emblem";

export const alt = "Reservoir conditions";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const revalidate = 3600;

/**
 * Per-lake share card.
 *
 * Reads only the cached statewide conditions feed — deliberately not the
 * period-of-record history, which is up to 1.9 MB per lake and would make image
 * generation as slow as the page it previews.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const reservoir = await getReservoir(slug).catch(() => null);

  if (!reservoir) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: OG.background,
            color: OG.foreground,
            fontSize: 56,
            fontFamily: "sans-serif",
          }}
        >
          Texas Lake Levels
        </div>
      ),
      size,
    );
  }

  const status = fillStatus(reservoir.percentFull);
  const color = OG_STATUS[status];
  const headroom =
    reservoir.conservationPoolElevation !== null && reservoir.elevation !== null
      ? reservoir.elevation - reservoir.conservationPoolElevation
      : null;

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
          padding: "52px 64px",
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
              TEXAS LAKE LEVELS
            </div>
            <div style={{ fontSize: 58, marginTop: 16, lineHeight: 1.1 }}>
              {reservoir.name}
            </div>
            <div style={{ fontSize: 26, color: OG.muted, marginTop: 12 }}>
              {[
                reservoir.basin ? `${reservoir.basin} basin` : null,
                reservoir.region,
              ]
                .filter(Boolean)
                .join(" · ")}
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

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div style={{ fontSize: 120, color, lineHeight: 1 }}>
              {fmtPercent(reservoir.percentFull, 1)}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginLeft: 26,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: color,
                  marginRight: 12,
                }}
              />
              <div style={{ fontSize: 30, color }}>{STATUS_LABEL[status]}</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: "100%",
              height: 18,
              borderRadius: 9,
              background: OG.border,
              marginTop: 26,
            }}
          >
            <div
              style={{
                width: `${Math.min(Math.max(reservoir.percentFull ?? 0, 0), 100)}%`,
                height: "100%",
                borderRadius: 9,
                background: color,
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderTop: `2px solid ${OG.border}`,
            paddingTop: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Figure
              label="Elevation"
              value={fmtFeet(reservoir.elevation, 2)}
              hint={
                headroom === null
                  ? "above mean sea level"
                  : `${headroom > 0 ? "+" : ""}${headroom.toFixed(2)} ft vs pool`
              }
            />
            <Figure
              label="Storage"
              value={fmtAcreFeet(reservoir.conservationStorage)}
              hint={`of ${fmtAcreFeet(reservoir.conservationCapacity)}`}
            />
            <Figure
              label="As of"
              value={fmtDate(reservoir.date)}
              hint="TWDB daily reading"
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 23,
              marginTop: 20,
            }}
          >
            <div style={{ display: "flex", color: OG.accent }}>
              {`${ogHost()}/lake/${slug}`}
            </div>
            <div style={{ display: "flex", color: OG.muted }}>
              Level history · Real-time gage · Compare lakes
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 22, color: OG.muted, letterSpacing: 1 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 38, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 21, color: OG.muted, marginTop: 6 }}>{hint}</div>
    </div>
  );
}
