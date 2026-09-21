import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelpGuide, HELP_PRINT_STYLE } from "./help-guide";
import { HelpHashOpen } from "./help-hash-open";

/**
 * The bug this guards: the `:target` CSS in HELP_PRINT_STYLE is `!important`
 * and keyed on `:target`, not on `open`. A section reached from the contents
 * nav therefore showed its body with `open` still unset — and once the reader
 * collapsed it, `open` went false while the body stayed on screen.
 *
 * jsdom applies no `:target` CSS, so asserting on the stylesheet text would
 * prove nothing either way. These test the JS behaviour that replaces it: the
 * targeted <details> really ends up `open`, and the fragment is cleared so a
 * later collapse actually sticks.
 */

function setPath(path: string) {
  window.history.replaceState(null, "", path);
}

describe("HelpHashOpen", () => {
  beforeEach(() => setPath("/help"));
  afterEach(() => setPath("/help"));

  it("opens the hash-targeted section for real, not just visually", () => {
    setPath("/help#globe");
    const { container } = render(<HelpGuide tripId="t1" />);

    const globe = container.querySelector<HTMLDetailsElement>("details#globe");
    // Before the fix this was false: only `:target` was holding it open.
    expect(globe?.open).toBe(true);
  });

  it("clears the fragment, so :target stops holding the section open", () => {
    setPath("/help#globe");
    render(<HelpGuide tripId="t1" />);

    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/help");
  });

  it("removes the fragment :target needs, and does not re-open on a later hashchange", () => {
    // HG-08. The previous version of this test set `globe.open = false` and
    // then asserted `globe.open === false` — it re-read the property it had
    // just written, so it could not fail.
    //
    // What jsdom CAN prove is the two things the component is actually
    // responsible for: the fragment is gone (so the `:target` rule below has
    // nothing to match), and a subsequent hashchange with an empty hash is a
    // no-op (so nothing re-opens the section behind the reader).
    //
    // What jsdom CANNOT prove, and what a real browser would have to: that
    // the `:target` CSS is genuinely not holding the body visible. jsdom
    // applies no `:target` styling at all, so asserting on layout here would
    // be theatre. That check needs a browser, and is the reason this item
    // was flagged rather than simply closed.
    setPath("/help#globe");
    const { container } = render(<HelpGuide tripId="t1" />);

    const globe = container.querySelector<HTMLDetailsElement>("details#globe")!;
    expect(globe.open).toBe(true);

    // The fallback rule this component exists to defuse is real and still
    // shipped. If it stops being :target-keyed, this test is guarding nothing.
    expect(HELP_PRINT_STYLE).toContain("details:target");

    // No fragment left, so `details#globe` cannot be :target for any rule.
    expect(window.location.hash).toBe("");

    globe.open = false;
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(globe.open).toBe(false);
    expect(window.location.hash).toBe("");
  });

  it("opens the section again when the hash changes after mount", async () => {
    // The contents nav is same-page navigation: no remount, only hashchange.
    render(<HelpGuide tripId="t1" />);
    const forks = document.querySelector<HTMLDetailsElement>("details#forks")!;
    expect(forks.open).toBe(false);

    window.location.hash = "#forks";

    await waitFor(() => expect(forks.open).toBe(true));
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  it("leaves the URL alone when the fragment is not a section", () => {
    // e.g. #help-legend-heading — a real anchor, but not a <details>.
    setPath("/help#help-legend-heading");
    render(<HelpGuide tripId="t1" />);

    expect(window.location.hash).toBe("#help-legend-heading");
  });

  it("survives a fragment that is not a valid escape sequence", () => {
    setPath("/help#%E0%A4%A");
    expect(() => render(<HelpHashOpen />)).not.toThrow();
  });

  it("renders nothing of its own", () => {
    const { container } = render(<HelpHashOpen />);
    expect(container.innerHTML).toBe("");
  });
});
