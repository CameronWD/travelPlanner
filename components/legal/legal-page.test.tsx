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
});
