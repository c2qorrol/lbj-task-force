import { ImageResponse } from "next/og";
import {
  DROUGHT_HEX,
  exclusiveShares,
  getStatewideDroughtHistory,
  type DroughtWeek,
} from "@/lib/drought";
import { getLakeSummaries, summarize } from "@/lib/lakes";
import { fmtDate, fmtPercent } from "@/lib/format";
import { OG, OG_CONTENT_TYPE, OG_SIZE, ogHost } from "@/lib/og";
import { EMBLEM_DATA_URI } from "@/lib/emblem";

export const alt = "Texas drought conditions and reservoir storage";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const revalidate = 3600;

const BANDS = ["d0", "d1", "d2", "d3", "d4"] as const;

export default async function Image() {
  const [weeks, lakes] = await Promise.all([
    getStatewideDroughtHistory(1).catch(() => [] as DroughtWeek[]),
    getLakeSummaries().catch(() => []),
  ]);

  const latest = weeks[weeks.length - 1] ?? null;
  const stats = summarize(lakes);
  const shares = latest ? exclusiveShares(latest) : null;

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
            <div style={{ fontSize: 58, marginTop: 16 }}>Drought conditions</div>
            {/* One text child: Satori requires display:flex for multiple children. */}
            <div style={{ fontSize: 26, color: OG.muted, marginTop: 12 }}>
              {`US Drought Monitor${latest ? ` · ${fmtDate(latest.date)}` : ""}`}
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

        {/* Single stacked bar: share of Texas in each severity, worst first. */}
        {shares ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: 56,
                borderRadius: 10,
                background: OG.border,
                overflow: "hidden",
              }}
            >
              {[...BANDS].reverse().map((band) =>
                shares[band] > 0 ? (
                  <div
                    key={band}
                    style={{
                      width: `${shares[band]}%`,
                      height: "100%",
                      background: DROUGHT_HEX[band],
                    }}
                  />
                ) : null,
              )}
            </div>
            <div style={{ fontSize: 24, color: OG.muted, marginTop: 14 }}>
              Share of Texas by drought severity, D0 through D4
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderTop: `2px solid ${OG.border}`,
            paddingTop: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Stat
            label="Any drought"
            value={latest ? fmtPercent(latest.d1, 0) : "—"}
            color={DROUGHT_HEX.d1}
          />
          <Stat
            label="Severe or worse"
            value={latest ? fmtPercent(latest.d2, 0) : "—"}
            color={DROUGHT_HEX.d3}
          />
          <Stat
            label="DSCI"
            value={latest ? String(latest.dsci) : "—"}
            color={OG.foreground}
          />
          <Stat
            label="Reservoir storage"
            value={fmtPercent(stats.percentFull, 1)}
            color={OG.accent}
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
              {`${ogHost()}/drought`}
            </div>
            <div style={{ display: "flex", color: OG.muted }}>
              Severity map · Weekly history · Reservoir storage
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 22, color: OG.muted, letterSpacing: 1 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 52, marginTop: 8, color }}>{value}</div>
    </div>
  );
}
