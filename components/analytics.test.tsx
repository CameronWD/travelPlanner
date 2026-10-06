/**
 * Tests for the Vercel Analytics redaction middleware.
 *
 * The one thing that must never regress: a /share/<token> URL must not reach
 * Vercel with the token intact. That token is the read credential for a
 * private itinerary (app/share/[token]/page.tsx is unauthenticated).
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { vi } from "vitest";

const { speedInsightsProps } = vi.hoisted(() => ({ speedInsightsProps: [] as Array<{ beforeSend?: unknown }> }));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: (props: { beforeSend?: unknown }) => {
    speedInsightsProps.push(props);
    return null;
  },
}));

import { redactShareToken, analyticsBeforeSend, VercelSpeedInsights } from "./analytics";

describe("redactShareToken", () => {
  it("strips the token from a bare share path", () => {
    expect(redactShareToken("/share/8f14e45f-ceea-467a-9a1b-0d2c3f4e5a6b")).toBe(
      "/share/[token]",
    );
  });

  it("strips the token from a full href", () => {
    expect(
      redactShareToken("https://teepee.app/share/8f14e45f-ceea-467a-9a1b"),
    ).toBe("https://teepee.app/share/[token]");
  });

  it("preserves a query string and hash around the redaction", () => {
    expect(redactShareToken("/share/abc123?utm_source=whatsapp#day-3")).toBe(
      "/share/[token]?utm_source=whatsapp#day-3",
    );
  });

  it("redacts the token but keeps any trailing path segments", () => {
    expect(redactShareToken("/share/abc123/print")).toBe(
      "/share/[token]/print",
    );
  });

  it("leaves a bare /share/ with no token alone", () => {
    expect(redactShareToken("/share/")).toBe("/share/");
  });

  it("leaves unrelated paths untouched", () => {
    expect(redactShareToken("/trips/trip-1/day/2026-12-01")).toBe(
      "/trips/trip-1/day/2026-12-01",
    );
    expect(redactShareToken("/signin")).toBe("/signin");
  });

  it("does not match a path that merely contains the word share", () => {
    expect(redactShareToken("/trips/trip-1/shared-costs")).toBe(
      "/trips/trip-1/shared-costs",
    );
  });
});

describe("analyticsBeforeSend", () => {
  it("returns a redacted copy for a share URL without mutating the input", () => {
    const event = { type: "pageview", url: "/share/secret-token" } as const;

    const result = analyticsBeforeSend({ ...event });

    expect(result).toEqual({ type: "pageview", url: "/share/[token]" });
    expect(event.url).toBe("/share/secret-token");
  });

  it("passes non-share events through unchanged, same object", () => {
    const event = {
      type: "pageview" as const,
      url: "/trips/trip-1/plan",
    };

    expect(analyticsBeforeSend(event)).toBe(event);
  });

  it("never lets a raw share token through", () => {
    const token = "8f14e45f-ceea-467a-9a1b-0d2c3f4e5a6b";

    const result = analyticsBeforeSend({
      type: "pageview",
      url: `https://teepee.app/share/${token}`,
    });

    expect(result?.url).not.toContain(token);
  });
});

describe("VercelSpeedInsights", () => {
  it("sends page timings through the same share-token redaction", () => {
    render(<VercelSpeedInsights />);
    expect(speedInsightsProps.at(-1)?.beforeSend).toBe(analyticsBeforeSend);
  });

  it("redacts a Speed Insights vital's URL too", () => {
    const vital = { type: "vital" as const, url: "/share/secret-token", route: "/share/[token]" };
    expect(analyticsBeforeSend(vital)).toEqual({ ...vital, url: "/share/[token]" });
  });
});
