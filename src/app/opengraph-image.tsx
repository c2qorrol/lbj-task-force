import { ImageResponse } from "next/og";
import { getLakeSummaries, summarize } from "@/lib/lakes";
import { fillStatus, fmtDate, fmtPercent } from "@/lib/format";
import { OG, OG_CONTENT_TYPE, OG_SIZE, OG_STATUS, ogHost } from "@/lib/og";
import { EMBLEM_DATA_URI } from "@/lib/emblem";

export const alt = "Texas Lake Levels — statewide reservoir conditions";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Matches the dashboard's own cache window; the image reflects the same figures.
export const revalidate = 3600;

export default async function Image() {
  const lakes = await getLakeSummaries().catch(() => []);
  const stats = summarize(lakes);
  const statusColor = OG_STATUS[fillStatus(stats.percentFull)];
  const withGage = lakes.filter((l) => l.gage).length;

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
            <div style={{ fontSize: 30, color: OG.accent, letterSpacing: 1 }}>
              TEXAS LAKE LEVELS
            </div>
            <div style={{ fontSize: 60, marginTop: 20, lineHeight: 1.1 }}>
              Statewide reservoir conditions
            </div>
            <div style={{ fontSize: 26, color: OG.muted, marginTop: 14 }}>
              {`${stats.count} reservoirs · ${withGage} with real-time gages${
                stats.asOf ? ` · ${fmtDate(stats.asOf)}` : ""
              }`}
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori JSX, not DOM */}
          <img
            src={EMBLEM_DATA_URI}
            alt=""
            width={200}
            height={200}
            style={{ marginLeft: 40 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <div style={{ fontSize: 140, color: statusColor, lineHeight: 1 }}>
              {fmtPercent(stats.percentFull, 1)}
            </div>
            <div
              style={{
                fontSize: 30,
                color: OG.muted,
                marginLeft: 24,
                marginBottom: 20,
              }}
            >
              of conservation capacity
            </div>
          </div>

          {/* Fill bar — clamped so a spill above 100% can't overflow the frame. */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 18,
              borderRadius: 9,
              background: OG.border,
              marginTop: 30,
            }}
          >
            <div
              style={{
                width: `${Math.min(Math.max(stats.percentFull, 0), 100)}%`,
                height: "100%",
                borderRadius: 9,
                background: statusColor,
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 25,
            borderTop: `2px solid ${OG.border}`,
            paddingTop: 24,
          }}
        >
          {/* Single text children — adjacent nodes become separate flex items. */}
          <div style={{ display: "flex", color: OG.accent }}>{ogHost()}</div>
          <div style={{ display: "flex", color: OG.muted }}>
            Dashboard · Map · Basins · Cities · Drought · Groundwater
          </div>
        </div>
      </div>
    ),
    size,
  );
}
