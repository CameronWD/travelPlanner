import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  GUIDE_UI_STRINGS,
  sectionsInGroup,
  guideTripHref,
  guideLabelOnScreen,
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

  it("never calls the Plan an 'itinerary' (CONTEXT.md forbids it)", () => {
    // The nav item is "Plan". "Itinerary" is internal vocabulary
    // (ItineraryManager) that the reader never sees on screen.
    for (const s of HELP_SECTIONS) {
      expect(`${s.title} ${s.blurb}`.toLowerCase()).not.toContain("itinerar");
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

// ── Drift guard: quoted control labels ───────────────────────────────────────
// The guide tells the reader to tap specific buttons by name. This walks the
// real UI source and proves each of those names is still on screen somewhere.
//
// The guide's own files are excluded on purpose: help-guide.tsx quotes every
// one of these strings, so scanning it would make the guard self-satisfying and
// unable to fail. Tests are excluded for the same reason.
const UI_SOURCE_ROOTS = ["components", "app"];
const EXCLUDED_SOURCE = /help-guide|help-legend|\.test\./;

/** Entities used in JSX text, so a label reads the same as it renders. */
function decodeEntities(source: string): string {
  return source
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&rsquo;", "’")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) collectSourceFiles(p, out);
    else if (/\.tsx?$/.test(p) && !EXCLUDED_SOURCE.test(p)) out.push(p);
  }
  return out;
}

describe("guideLabelOnScreen", () => {
  it("matches a label that ends at a quote", () => {
    expect(guideLabelOnScreen('aria-label="Add transport"', "Add transport")).toBe(true);
  });

  it("matches a label that ends at a JSX tag", () => {
    expect(guideLabelOnScreen("<span>Start time</span>", "Start time")).toBe(true);
  });

  it("matches a label that ends at sentence punctuation", () => {
    expect(guideLabelOnScreen("nothing in this plan.", "in this plan")).toBe(true);
  });

  it("does NOT match a label that is only the head of a longer phrase", () => {
    // The whole bug: "Booking reference" passed on the strength of
    // "Booking reference / number", and "Editing variant" passed on the
    // strength of the banner's interpolated string.
    expect(guideLabelOnScreen('"Booking reference / number"', "Booking reference")).toBe(false);
  });

  it("does NOT match a label the source merely starts a word with", () => {
    expect(guideLabelOnScreen("Add transported goods", "Add transport")).toBe(false);
  });

  it("matches the last of several occurrences when only that one terminates", () => {
    expect(
      guideLabelOnScreen('Booking reference / number and "Booking reference"', "Booking reference"),
    ).toBe(true);
  });

  it("is false for a label that never appears", () => {
    expect(guideLabelOnScreen("nothing here", "Add transport")).toBe(false);
  });
});

describe("drift guard: the list itself", () => {
  it("has no entry that is a substring of another entry", () => {
    // An entry contained in a longer entry is unfailable by construction: the
    // longer one's own occurrence satisfies it, so the shorter one can never
    // catch a rename. Delete the shorter one instead (HG-09).
    const shadowed = GUIDE_UI_STRINGS.filter((a) =>
      GUIDE_UI_STRINGS.some((b) => b !== a && b.includes(a)),
    );
    expect(shadowed).toEqual([]);
  });
});

describe("drift guard: quoted control labels", () => {
  const files = UI_SOURCE_ROOTS.flatMap((root) =>
    collectSourceFiles(path.join(process.cwd(), root)),
  );
  const sources = files.map((f) => ({
    file: path.relative(process.cwd(), f),
    text: decodeEntities(readFileSync(f, "utf8")),
  }));

  it("scans a real body of UI source", () => {
    // If the walk silently returned nothing, every assertion below would be
    // vacuous rather than failing.
    expect(files.length).toBeGreaterThan(50);
    expect(sources.some((s) => s.file.includes("stop-card.tsx"))).toBe(true);
    expect(sources.every((s) => !s.file.includes("help-guide"))).toBe(true);
  });

  it.each(GUIDE_UI_STRINGS)(
    "the guide quotes %s, and it is still on screen as a whole phrase",
    (label) => {
      // Curly apostrophes render identically; accept either form.
      const curly = label.replaceAll("'", "’");
      const found = sources.some(
        (s) => guideLabelOnScreen(s.text, label) || guideLabelOnScreen(s.text, curly),
      );
      expect(
        found,
        `the guide quotes "${label}" but no file under components/ or app/ contains it as a complete phrase — either the control was renamed, the guide is quoting only part of the real label, or the guide should stop quoting it`,
      ).toBe(true);
    },
  );
});
