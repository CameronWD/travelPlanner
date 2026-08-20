import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelpGuide, HELP_PRINT_STYLE } from "./help-guide";
import { HELP_SECTIONS, sectionsInGroup, type HelpGroup } from "@/lib/help-guide";

/** Minimum body text for a section to count as written rather than stubbed. */
const MIN_BODY_CHARS = 200;

describe("HelpGuide", () => {
  it("renders a heading for every section", () => {
    render(<HelpGuide tripId="t1" />);
    for (const s of HELP_SECTIONS) {
      expect(screen.getByText(s.title), `missing section: ${s.title}`).toBeTruthy();
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

  it("warns prominently that an undated thing to do stays off the calendar", () => {
    // ADR 0022: a thing to do with no date appears in NO dated view. Without
    // this callout it reads as a bug.
    render(<HelpGuide tripId="t1" />);
    const callout = screen.getByTestId("undated-callout");
    expect(callout.textContent).toMatch(/won't show up|won’t show up/i);
    expect(callout.textContent).toMatch(/calendar/i);
  });

  it("deep-links into the trip when a tripId is given", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const planLink = container.querySelector('a[href="/trips/t1/plan"]');
    expect(planLink).toBeTruthy();
  });

  it("renders no trip links at all without a tripId", () => {
    const { container } = render(<HelpGuide />);
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

  it("never mentions Discreet mode", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    expect((container.textContent ?? "").toLowerCase()).not.toContain("discreet");
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
