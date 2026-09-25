import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LegalPage, LegalSection, legalToc } from "./legal-page";

describe("legalToc", () => {
  it("builds a table of contents from its sections", () => {
    const kids = [
      <LegalSection key="a" title="What we collect">
        x
      </LegalSection>,
      <LegalSection key="b" title="Your rights">
        y
      </LegalSection>,
    ];
    expect(legalToc(kids)).toEqual([
      { id: "what-we-collect", title: "What we collect" },
      { id: "your-rights", title: "Your rights" },
    ]);
  });

  it("sees sections wrapped in a Fragment", () => {
    const kids = (
      <>
        <LegalSection title="First">a</LegalSection>
        <>
          <LegalSection title="Second">b</LegalSection>
        </>
      </>
    );
    expect(legalToc(kids)).toEqual([
      { id: "first", title: "First" },
      { id: "second", title: "Second" },
    ]);
  });

  it("ignores non-LegalSection children", () => {
    const kids = [<p key="p">Not a section</p>, null, false];
    expect(legalToc(kids)).toEqual([]);
  });
});

describe("LegalPage", () => {
  it("renders a sticky contents column beside the text on desktop", () => {
    render(
      <LegalPage title="Privacy">
        <LegalSection title="Your rights">y</LegalSection>
      </LegalPage>,
    );
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.className).toContain("lg:sticky");
    expect(screen.getByRole("link", { name: "Your rights" })).toHaveAttribute(
      "href",
      "#your-rights",
    );
  });

  // LA-054: the header's logo link and companion ("Terms"/"Privacy") link
  // each get a 44px-tall tap target.
  it("gives the header logo link and the companion link a 44px tap target", () => {
    render(
      <LegalPage title="Privacy" other={{ href: "/terms", label: "Terms" }}>
        <LegalSection title="Your rights">y</LegalSection>
      </LegalPage>,
    );
    expect(screen.getByRole("link", { name: "Teepee sign in" }).className).toContain("min-h-11");
    expect(screen.getByRole("link", { name: "Terms" }).className).toContain("min-h-11");
  });

  it("gives each LegalSection its slugged id as a scroll-margin anchor", () => {
    const { container } = render(
      <LegalPage title="Privacy">
        <LegalSection title="Your rights">y</LegalSection>
      </LegalPage>,
    );
    const section = container.querySelector("#your-rights");
    expect(section).toBeTruthy();
    expect(section?.className).toContain("scroll-mt-8");
  });

  // LA-051 / diagnosis G: 68ch (the "0" glyph's width) rendered ~92 real
  // characters per line on this body font — 38rem is a measured value that
  // actually delivers a readable line length. The grid track stays a fixed
  // rem (it sizes a column, not a glyph run); max-w-reading itself moved to
  // em in fix round 1, see the next test.
  it("caps the reading column at the corrected 38rem grid track, not the old 68ch", () => {
    const { container } = render(
      <LegalPage title="Privacy">
        <LegalSection title="Your rights">y</LegalSection>
      </LegalPage>,
    );
    const main = container.querySelector("main") as HTMLElement;
    expect(main.className).toContain("minmax(0,38rem)");
    expect(main.className).not.toContain("68ch");
  });

  // Fix round 1 (LA-051): an em-based max-w-reading only tracks the text
  // it's measured against. This wrapper inherits the body's 14px, not the
  // 15px LegalSection's prose actually renders at, so the cap has to sit on
  // the same element as that 15px — not here, and not stranded on a
  // 14px-inheriting ancestor above it.
  it("keeps max-w-reading off the 14px wrapper — it belongs on LegalSection's own 15px text", () => {
    const { container } = render(
      <LegalPage title="Privacy">
        <LegalSection title="Your rights">y</LegalSection>
      </LegalPage>,
    );
    const body = container.querySelector(".max-w-reading") as HTMLElement;
    expect(body).toBeTruthy();
    expect(body.className).toContain("text-[15px]");
  });
});
