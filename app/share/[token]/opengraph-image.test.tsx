import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

const { shareFindFirstMock, stopFindManyMock } = vi.hoisted(() => ({
  shareFindFirstMock: vi.fn(),
  stopFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { shareLink: { findFirst: shareFindFirstMock }, stop: { findMany: stopFindManyMock } },
}));
// Capture the element instead of running Satori.
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(public element: ReactElement, public options: unknown) {}
  },
}));

import Image, { size, dynamic } from "./opengraph-image";
import { OG_SIZE } from "@/lib/og-card";

const STOPS = [
  { id: "s1", name: "Munich", country: "Germany", lat: 48.1, lng: 11.6, timezone: "Europe/Berlin", arriveDate: "2020-12-06", departDate: "2020-12-08", sortOrder: 0, notes: "secret stop note" },
  { id: "s2", name: "London", country: "United Kingdom", lat: 51.5, lng: -0.1, timezone: "Europe/London", arriveDate: "2020-12-08", departDate: "2020-12-09", sortOrder: 1 },
];

async function html(token = "tok") {
  const res = (await Image({ params: Promise.resolve({ token }) })) as unknown as { element: ReactElement };
  return renderToStaticMarkup(res.element);
}

beforeEach(() => {
  vi.clearAllMocks();
  stopFindManyMock.mockResolvedValue(STOPS);
});

describe("Share link OG image (SHARE.md §3)", () => {
  it("is 1200×630 and rendered per request, so a revoked link stops previewing at once", () => {
    expect(size).toEqual(OG_SIZE);
    expect(dynamic).toBe("force-dynamic");
  });

  it("a revoked or unknown token gets the site card and no trip data", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    const out = await html("gone");
    expect(out).toContain("Plan the trip together.");
    expect(stopFindManyMock).not.toHaveBeenCalled();
  });

  it("a live link draws the hero: name, After month span, route sketch — nothing private", async () => {
    shareFindFirstMock.mockResolvedValue({
      id: "link-1",
      showTravellers: true,
      trip: { id: "t1", name: "EU Christmas", startDate: "2020-12-06", endDate: "2020-12-09", homeCurrency: "EUR" },
    });
    const out = await html();
    expect(out).toContain("EU Christmas");
    expect(out).toContain("Dec 2020");
    expect(out).toContain("<polyline");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("EUR");
    expect(out).not.toContain("<img");
  });
});
