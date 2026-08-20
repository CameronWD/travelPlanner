import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

// trip-nav.tsx is a client component that imports next/navigation at module
// scope; stub it so the pure primaryNav/moreNav exports can be imported here.
vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/t1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/trip/nav-more-menu", () => ({ NavMoreMenu: () => null }));

import {
  HELP_SECTIONS,
  GUIDE_NAV_LABELS,
  GUIDE_TRIP_SEGMENTS,
  sectionsInGroup,
  guideTripHref,
} from "./help-guide";
import { primaryNav, moreNav } from "@/components/trip/trip-nav";

describe("HELP_SECTIONS", () => {
  it("has unique ids", () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses slug-safe ids so they work as anchor targets", () => {
    for (const s of HELP_SECTIONS) {
      expect(s.id, `${s.id} is not slug-safe`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives every section a title and a blurb", () => {
    for (const s of HELP_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
    }
  });

  it("never calls a thing-to-do an 'activity' (CONTEXT.md forbids it)", () => {
    // "Activity" is the change-log nav item. Naming a thing-to-do an activity
    // sends the reader to the wrong tab.
    for (const s of HELP_SECTIONS) {
      expect(`${s.title} ${s.blurb}`.toLowerCase()).not.toContain("activit");
    }
  });

  it("never mentions Discreet mode, which was removed", () => {
    for (const s of HELP_SECTIONS) {
      expect(`${s.title} ${s.blurb}`.toLowerCase()).not.toContain("discreet");
    }
  });

  it("orders groups everyday, then advanced, then reference", () => {
    const rank = { everyday: 0, advanced: 1, reference: 2 } as const;
    const ranks = HELP_SECTIONS.map((s) => rank[s.group]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("sectionsInGroup", () => {
  it("returns only sections in the requested group, in document order", () => {
    const everyday = sectionsInGroup("everyday");
    expect(everyday.length).toBeGreaterThan(0);
    expect(everyday.every((s) => s.group === "everyday")).toBe(true);
    expect(everyday.map((s) => s.id)).toEqual(
      HELP_SECTIONS.filter((s) => s.group === "everyday").map((s) => s.id),
    );
  });

  it("returns an empty array for a group with no sections", () => {
    // Guards against sectionsInGroup throwing rather than returning empty.
    const groups = new Set(HELP_SECTIONS.map((s) => s.group));
    if (!groups.has("reference")) {
      expect(sectionsInGroup("reference")).toEqual([]);
    }
  });
});

describe("guideTripHref", () => {
  it("builds a trip-scoped path when a tripId is given", () => {
    expect(guideTripHref("t1", "plan")).toBe("/trips/t1/plan");
  });

  it("returns undefined with no tripId so the caller can render plain text", () => {
    expect(guideTripHref(undefined, "plan")).toBeUndefined();
  });

  it("encodes a tripId containing URL-unsafe characters", () => {
    expect(guideTripHref("a/b", "plan")).toBe("/trips/a%2Fb/plan");
  });
});

// ── Drift guards ──────────────────────────────────────────────────────────
// These fail when the app changes under the guide, instead of letting the
// guide quietly start lying.

describe("drift guard: nav labels", () => {
  it("every nav label the guide names still exists in the real nav", () => {
    const real = new Set(
      [...primaryNav("t1"), ...moreNav("t1")].map((i) => i.label),
    );
    for (const label of GUIDE_NAV_LABELS) {
      expect(real.has(label), `nav label "${label}" no longer exists`).toBe(true);
    }
  });
});

describe("drift guard: linked routes", () => {
  it("every trip route segment the guide links to still has a page", () => {
    for (const seg of GUIDE_TRIP_SEGMENTS) {
      const p = path.join(
        process.cwd(),
        "app",
        "(app)",
        "trips",
        "[tripId]",
        seg,
        "page.tsx",
      );
      expect(existsSync(p), `route /trips/[tripId]/${seg} is missing`).toBe(true);
    }
  });
});
