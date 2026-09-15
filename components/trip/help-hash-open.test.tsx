import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { HelpGuide } from "./help-guide";
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

  it("lets a deep-linked section be collapsed again and stay collapsed", () => {
    // The whole point. Before the fix, `open = false` left the body visible
    // because the fragment — and so `:target` — was still in the URL.
    setPath("/help#globe");
    const { container } = render(<HelpGuide tripId="t1" />);

    const globe = container.querySelector<HTMLDetailsElement>("details#globe")!;
    globe.open = false;

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
