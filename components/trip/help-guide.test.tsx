import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpGuide, HELP_PRINT_STYLE } from "./help-guide";
import { HELP_SECTIONS, sectionsInGroup, type HelpGroup } from "@/lib/help-guide";

// trip-nav.tsx is a client component that imports next/navigation at module
// scope; stub it so the pure primaryNav/moreNav exports can be imported here
// (same defensive stub lib/help-guide.test.ts uses for the same reason).
vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/t1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/trip/nav-more-menu", () => ({ NavMoreMenu: () => null }));

import { primaryNav, moreNav } from "@/components/trip/trip-nav";

/** Minimum body text for a section to count as written rather than stubbed. */
const MIN_BODY_CHARS = 200;

describe("HelpGuide", () => {
  it("renders a heading for every section", () => {
    // Scoped to the section's own <summary>, not just "this text exists
    // somewhere" — the contents nav also links the title, so an unscoped
    // query would stay green even if a summary lost its title.
    const { container } = render(<HelpGuide tripId="t1" />);
    for (const s of HELP_SECTIONS) {
      const summary = container.querySelector(`details#${s.id} summary`);
      expect(summary?.textContent, `missing section: ${s.title}`).toContain(
        s.title,
      );
    }
  });

  it("renders each section as a native <details> with its id as the anchor", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    for (const s of HELP_SECTIONS) {
      const el = container.querySelector(`details#${s.id}`);
      expect(el, `section ${s.id} is not a <details> with that id`).toBeTruthy();
      expect(el?.querySelector("summary")).toBeTruthy();
    }
  });

  it("uses no client-side disclosure state (native details only)", () => {
    // Guards the no-new-dependency decision: no Radix accordion roles.
    const { container } = render(<HelpGuide tripId="t1" />);
    expect(container.querySelector("[data-radix-collection-item]")).toBeNull();
    expect(container.querySelectorAll("details").length).toBe(HELP_SECTIONS.length);
  });

  it("gives every section a real body, not just a summary row", () => {
    // Without this, a section could be gutted to an empty <details> and the
    // one-details-per-entry count would still pass.
    const { container } = render(<HelpGuide tripId="t1" />);
    for (const s of HELP_SECTIONS) {
      const body = container.querySelector(`details#${s.id} > summary + div`);
      const text = (body?.textContent ?? "").trim();
      expect(
        text.length,
        `section ${s.id} has a ${text.length}-char body; needs at least ${MIN_BODY_CHARS}`,
      ).toBeGreaterThanOrEqual(MIN_BODY_CHARS);
    }
  });

  it("renders the sections in HELP_SECTIONS order", () => {
    // Section order IS document order (lib/help-guide.ts) — a section moved or
    // dropped must fail here rather than silently reshuffle the page.
    const { container } = render(<HelpGuide tripId="t1" />);
    const ids = Array.from(container.querySelectorAll("details")).map((d) => d.id);
    expect(ids).toEqual(HELP_SECTIONS.map((s) => s.id));
  });

  it("puts each section inside its own group's block", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const blocks: Array<[HelpGroup, string]> = [
      ["everyday", "help-everyday-heading"],
      ["advanced", "help-advanced-heading"],
      ["reference", "help-reference-heading"],
    ];
    for (const [group, headingId] of blocks) {
      const block = container.querySelector(`section[aria-labelledby="${headingId}"]`);
      expect(block, `missing block for group ${group}`).toBeTruthy();
      const ids = Array.from(block?.querySelectorAll("details") ?? []).map((d) => d.id);
      expect(ids, `wrong sections under ${headingId}`).toEqual(
        sectionsInGroup(group).map((s) => s.id),
      );
    }
  });

  it("renders the legend above the collapsible sections", () => {
    render(<HelpGuide tripId="t1" />);
    expect(screen.getByText("Buttons you’ll tap")).toBeTruthy();
  });

  it("warns prominently that an undated thing to do stays off Days", () => {
    // ADR 0022: a thing to do with no date appears in NO dated view. Without
    // this callout it reads as a bug. "Days" is the nav tab's real label
    // (trip-nav.tsx's primaryNav) — the dated view used to be called
    // "Calendar" before task 7's Playground rail rename.
    render(<HelpGuide tripId="t1" />);
    const callout = screen.getByTestId("undated-callout");
    expect(callout.textContent).toMatch(/won't show up|won’t show up/i);
    expect(callout.textContent).toMatch(/Days/);
  });

  it("deep-links into the trip when a tripId is given", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const planLink = container.querySelector('a[href="/trips/t1/plan"]');
    expect(planLink).toBeTruthy();
  });

  it("renders no trip links at all without a tripId", () => {
    const { container } = render(<HelpGuide />);
    // /globe is account-level, not trip-scoped, so it is a valid link even
    // without a tripId. This assertion is scoped to trip hrefs only.
    expect(container.querySelector('a[href^="/trips/"]')).toBeNull();
  });

  it("still names the tab in plain text without a tripId", () => {
    render(<HelpGuide />);
    // The reader must still learn WHERE to go even with no link to tap.
    expect(screen.getAllByText("Plan").length).toBeGreaterThan(0);
  });

  it("never calls a thing to do an 'activity'", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("activities");
    // "Activity" alone is legal — it is the real name of the change-log tab.
    expect(text).not.toContain("add an activity");
  });

  it("never calls the Plan an 'itinerary'", () => {
    // Binding like the "activity" rule: the tab is called the Plan, and
    // "itinerary" is a word the UI never shows the reader. The guide is clean
    // today — this keeps it that way.
    const { container } = render(<HelpGuide tripId="t1" />);
    expect((container.textContent ?? "").toLowerCase()).not.toContain("itinerar");
  });

  it("never mentions Discreet mode", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    expect((container.textContent ?? "").toLowerCase()).not.toContain("discreet");
  });

  it("tells the reader Chapters are optional and how to switch them on", () => {
    // schema.prisma: chaptersEnabled defaults to false. A guide that teaches
    // Chapters as always-present sends a new user looking for bands that
    // aren't there.
    const { container } = render(<HelpGuide tripId="t1" />);
    const shape = container.querySelector("details#trip-shape")?.textContent ?? "";
    const chapters = container.querySelector("details#chapters")?.textContent ?? "";

    expect(shape).toContain("Group into chapters");
    expect(chapters).toContain("Group into chapters");
  });

  it("does not present Chapters as part of the shape every trip has", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const shape = container.querySelector("details#trip-shape")?.textContent ?? "";
    // The two things always present are the Stop and the Home base. Chapters
    // must be described as something you turn on, not as a third given.
    expect(shape).toMatch(/turn(ed)? (them )?on|switch (them )?on|Group into chapters/);
  });

  it("documents Search, including that Find is real-plan only", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#search")?.textContent ?? "";
    expect(body).toContain("Search or jump");
    expect(body).toContain("Go to");
    expect(body).toContain("Find");
    expect(body).toContain("connection");
    // The section's most load-bearing claim: server/actions/search.ts scopes
    // every Find query with REAL_PLAN, so nothing that lives only inside a
    // variant can come back. Without this the sentence could be deleted and
    // the test would still pass under its own name.
    expect(body).toContain("only ever searches the real plan");
    expect(body).toContain("only exists inside a variant");
  });

  it("never calls Search a command palette", () => {
    // CONTEXT.md: "command palette" is the code name, as Fork is to variant.
    const { container } = render(<HelpGuide tripId="t1" />);
    expect(container.textContent?.toLowerCase()).not.toContain("command palette");
  });

  it("documents the trip settings, including how to delete a trip", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#trip-settings")?.textContent ?? "";
    expect(body).toContain("Delete trip");
    expect(body).toContain("Add a Traveller by email");
    expect(body).toContain("New share link");
  });

  it("is honest that an invite is not emailed to anyone", () => {
    // CONTEXT.md: an Invite "is never delivered as a link or message".
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#trip-settings")?.textContent ?? "";
    expect(body).toMatch(/nothing is sent|no email|isn't emailed|not emailed/i);
  });

  it("documents the Globe as its own thing, linked to the real /globe page", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const section = container.querySelector("details#globe");
    expect(section).toBeTruthy();
    expect(section?.textContent).toContain("Marker");
    expect(section?.querySelector('a[href="/globe"]')).toBeTruthy();
  });

  it("links the Globe even with no trip in scope, since it is account-level", () => {
    const { container } = render(<HelpGuide />);
    expect(container.querySelector('a[href="/globe"]')).toBeTruthy();
  });

  it("offers a contents list linking every section by anchor", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const nav = container.querySelector('nav[aria-label="Contents"]');
    expect(nav).toBeTruthy();
    for (const s of HELP_SECTIONS) {
      expect(
        nav?.querySelector(`a[href="#${s.id}"]`),
        `contents is missing a link to ${s.id}`,
      ).toBeTruthy();
    }
  });

  it("opens the first section so the page never lands looking empty", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const all = Array.from(container.querySelectorAll("details"));
    expect(all[0].hasAttribute("open")).toBe(true);
    expect(all.slice(1).every((d) => !d.hasAttribute("open"))).toBe(true);
  });

  // ── Accuracy sweep (2026-09-15) ──
  // One test per claim the audit found to be false. Each is scoped to the
  // section that carried the claim. See
  // docs/follow-ups/2026-09-15-help-guide-audit.md for the evidence.

  it("does not claim dragging a Wishlist idea onto a day moves it", () => {
    // calendar-views.tsx handleDropItem sends EVERY wishlist-rail drag through
    // scheduleItem, whose copy-in branch leaves the idea row untouched
    // (ADR 0019). Drag and the calendar button are the same operation.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#giving-a-day")?.textContent ?? "";
    expect(body).toContain("the idea stays on the board");
    expect(body).not.toContain("it leaves the board");
  });

  it("says both routes from the Wishlist onto a day put a copy there", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#undecided")?.textContent ?? "";
    expect(body).toContain("The idea itself stays on the board");
    expect(body).not.toContain("leaves the board");
  });

  it("says how the notification count is actually cleared", () => {
    // notification-bell.tsx has no mark-read-on-open: markAllRead fires only
    // from the explicit button, or from MarkReadOnView on the Activity page.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#together")?.textContent ?? "";
    expect(body).toContain("Mark all read");
    expect(body).not.toContain("Reading it clears the count");
  });

  it("does not promise disabled Chapters come back exactly as they were", () => {
    // server/actions/trips.ts setChaptersEnabled re-runs recomputeChapterSpans
    // on re-enable, so bands self-heal to wherever member stops now sit.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#chapters")?.textContent ?? "";
    expect(body).toContain("redrawn around wherever your places have moved to");
    expect(body).not.toContain("exactly as they were");
  });

  it("describes the ripple as span-scoped, not a whole-plan shift", () => {
    // ADR 0038: a date edit ripples only on collision. lib/reorder.ts
    // collisionPush breaks as soon as existing slack absorbs the change.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#dates-and-pins")?.textContent ?? "";
    expect(body).toContain("only as far as they have to");
  });

  it("does not quote the variant banner as text the app never renders", () => {
    // variant-banner.tsx interpolates the variant name and carries a second
    // sentence; "Editing variant — not live" is never rendered as such.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#forks")?.textContent ?? "";
    expect(body).toContain("your calendar, summary and sharing still follow");
    expect(body).not.toContain("Editing variant — not live");
  });

  it("names the three screens a variant actually follows you onto", () => {
    // trip-nav.tsx appends ?plan= on plan-scoped links only; the dated screens
    // always follow the real plan.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#forks")?.textContent ?? "";
    expect(body).toContain("the Plan, Money and the Wishlist");
  });

  it("does not claim the Wishlist is a screen a variant can change", () => {
    // It contradicted the next paragraph, which says the Wishlist is shared by
    // every variant — and the paragraph is the true one: Wishlist ideas are
    // forkId: null (wishlist/page.tsx:55). Only the scheduled copies are
    // fork-scoped. What follows the variant is the screen, not the ideas.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#forks")?.textContent ?? "";
    expect(body).not.toContain("the screens a variant can change");
    expect(body).toContain("The Wishlist, the checklists and the journal are shared");
  });

  it("says a Globe appears on first visit, not that sharing is the gate", () => {
    // wishlist/page.tsx:84,270 gates Add from Globe on getUserGlobe(user.id),
    // and lib/globe.ts getOrCreateUserGlobe creates the Globe lazily on first
    // access to /globe. A solo user gets one; sharing has nothing to do with
    // it. The old wording sent them looking for a sharing arrangement.
    const { container } = render(<HelpGuide tripId="t1" />);
    const globe = container.querySelector("details#globe")?.textContent ?? "";
    expect(globe).toContain("made the first time you open it");
    expect(globe).not.toMatch(/only offers this when you/);
    // The true half survives: a Globe really can be shared.
    expect(globe).toMatch(/can also be shared/);

    // And the Wishlist section points at the same fix rather than at sharing.
    const wishlist = container.querySelector("details#undecided")?.textContent ?? "";
    expect(wishlist).toMatch(/that first visit is what creates it/);
  });

  it("uses the real field names on the accommodation and transport forms", () => {
    // accommodation-form-dialog.tsx:393 / transport-form-dialog.tsx:556.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#sleeping-moving")?.textContent ?? "";
    expect(body).toContain("Booking confirmation");
    expect(body).toContain("Booking reference / number");
  });

  it("lists the time fields on the thing-to-do form", () => {
    // item-form-dialog.tsx:465,477 — the guide told readers times were optional
    // without ever saying where a time is entered.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#things-to-do")?.textContent ?? "";
    expect(body).toContain("Start time");
    expect(body).toContain("End time");
  });

  it("is accurate about which cards carry a paperclip, and on which screen", () => {
    // Three separate facts, all of which earlier wordings got wrong:
    //  - the paperclip is desktop-only (stop-card.tsx:435 `hidden sm:block`,
    //    card-action-cluster.tsx:98); on a phone it is in the ⋯ menu's sheet;
    //  - a thing to do parked under a Stop has NO paperclip at all
    //    (stop-card.tsx:552-576 is day picker + pencil only, and
    //    item-card.tsx:122 renders the cluster in wishlist mode only) — its
    //    files go through the Attachments field on its own form;
    //  - so "every card" and "those cards each carry a paperclip" are both
    //    false. Attachments are limited to Stop, Transport, Accommodation,
    //    Item and Marker (CONTEXT.md).
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#getting-ready")?.textContent ?? "";
    expect(body).toContain("carry a paperclip button on a wide screen");
    expect(body).toContain("takes its files in its own form");
    expect(body).not.toContain("every card");
    expect(body).not.toContain("those cards each carry a paperclip");
  });

  it("lists every transport mode the app really offers", () => {
    // lib/enums.ts TRANSPORT_MODES: FLIGHT, TRAIN, BUS, CAR, FERRY, OTHER.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#word-list")?.textContent ?? "";
    expect(body).toContain("bus, car or ferry");
    expect(body).toContain("Other");
  });

  it("says Duplicate carries the transport legs over too", () => {
    // ADR 0018 / lib/duplicate-trip.ts: transport connections ARE copied,
    // stripped of times, reference and cost. The list omitted them entirely.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#trip-settings")?.textContent ?? "";
    expect(body).toContain("the legs that join the places up");
  });

  it("does not say firming up always anchors on the trip start", () => {
    // CONTEXT.md: the anchor is the trip start OR the depart date of the
    // preceding scheduled Stop — which is how a per-Chapter firm up works.
    const { container } = render(<HelpGuide tripId="t1" />);
    const body = container.querySelector("details#word-list")?.textContent ?? "";
    expect(body).toContain("or from where the place before it ends");
  });

  it("opens a section that is the current :target, without script", () => {
    render(<HelpGuide tripId="t1" />);
    // The print rules already prove why two rules are needed; the same pair is
    // required for :target, or a contents link lands on a collapsed row.
    expect(HELP_PRINT_STYLE).toContain("details:target");
    expect(HELP_PRINT_STYLE).toContain("details:target::details-content");
  });
});

describe("HELP_PRINT_STYLE", () => {
  it("forces every collapsed section open when printing", () => {
    expect(HELP_PRINT_STYLE).toContain("@media print");
    expect(HELP_PRINT_STYLE).toContain("details");
    expect(HELP_PRINT_STYLE).toContain("display: block");
  });

  it("is actually rendered into the page, not just exported", () => {
    // Deleting <style>{HELP_PRINT_STYLE}</style> from the component left the
    // two assertions below green, because they only inspect the string.
    const { container } = render(<HelpGuide tripId="t1" />);
    const style = container.querySelector("style");
    expect(style, "the guide renders no <style> element at all").not.toBeNull();
    expect(style?.textContent).toContain("@media print");
  });

  it("also opens sections in engines that hide ::details-content", () => {
    // Chromium >= 131 / Safari >= 18.4 / Firefox >= 139 put a closed <details>
    // content in a ::details-content box with content-visibility: hidden, where
    // overriding the children's `display` is a no-op. Both rules are required.
    expect(HELP_PRINT_STYLE).toContain("::details-content");
    expect(HELP_PRINT_STYLE).toContain("content-visibility: visible");
  });
});

describe("drift guard: <Go> link text matches the real nav label", () => {
  // lib/help-guide.test.ts's nav-label guard checks primaryNav/moreNav's
  // OWN output against GUIDE_NAV_LABELS — it never reads this file's prose,
  // so a rename that renamed the data source correctly (as task 7's Days/
  // Money rename did) could still leave a stale label sitting inside a <Go>
  // here, and nothing would fail. This guard reads the actual rendered
  // <Go> links instead: every one of them is a real navigable link into the
  // trip (guideTripHref), so its visible text SHOULD be exactly whatever
  // primaryNav/moreNav currently calls that route. A structural check on
  // <Go>'s own children, rather than a scan of the whole file's prose for
  // risky words — deliberately, so it can never flag "calendar feed", a
  // lowercase "calendar button", or CalendarSkeleton: none of those are
  // inside a <Go>.
  it("every <Go> link's visible text matches primaryNav/moreNav's current label for that route", () => {
    const bySegment = new Map<string, string>();
    for (const item of [...primaryNav("t1"), ...moreNav("t1")]) {
      const path = item.href.split("?")[0];
      bySegment.set(path.split("/").pop()!, item.label);
    }

    const { container } = render(<HelpGuide tripId="t1" />);
    const tripLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="/trips/t1/"]'),
    );
    // If this is ever 0, the guard below is vacuously true — guard the guard.
    expect(tripLinks.length).toBeGreaterThan(0);

    for (const link of tripLinks) {
      const segment = link.getAttribute("href")!.split("?")[0].split("/").pop()!;
      const expected = bySegment.get(segment);
      if (!expected) continue; // a route <Go> doesn't cover (none today) — not this guard's job
      expect(
        link.textContent,
        `<Go segment="${segment}"> says "${link.textContent}" but the real nav calls this route "${expected}"`,
      ).toBe(expected);
    }
  });
});
