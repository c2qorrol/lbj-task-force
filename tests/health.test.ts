import { describe, expect, it } from "vitest";
import { deriveStatus, type HealthCheck } from "@/lib/health";

const check = (over: Partial<HealthCheck>): HealthCheck => ({
  source: "s",
  ok: true,
  critical: false,
  detail: "",
  ms: 1,
  ...over,
});

describe("deriveStatus", () => {
  it("is ok when everything passes", () => {
    expect(deriveStatus([check({ critical: true }), check({})])).toBe("ok");
  });

  it("is degraded when only an enrichment feed fails", () => {
    // The pages still stand up without rainfall or drought.
    expect(deriveStatus([check({ critical: true }), check({ ok: false })])).toBe("degraded");
  });

  it("is down when a critical feed fails", () => {
    expect(deriveStatus([check({ ok: false, critical: true })])).toBe("down");
  });

  it("reports down, not degraded, when both kinds fail", () => {
    // The worst state wins; a critical failure must not hide behind a minor one.
    const status = deriveStatus([
      check({ ok: false, critical: true }),
      check({ ok: false }),
    ]);
    expect(status).toBe("down");
  });

  it("treats an empty check list as ok rather than inventing a failure", () => {
    expect(deriveStatus([])).toBe("ok");
  });
});
