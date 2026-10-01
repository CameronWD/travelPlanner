import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnThisPage } from "./on-this-page";

describe("OnThisPage", () => {
  it("renders nothing when there is nothing to link to", () => {
    const { container } = render(<OnThisPage groups={[{ entries: [] }, { label: "Later", entries: [] }]} />);
    expect(container.innerHTML).toBe("");
  });

  it("links every entry by anchor, grouped under its label, in order", () => {
    render(
      <OnThisPage
        groups={[
          { entries: [{ id: "walk", title: "The walkthrough" }] },
          { label: "Going deeper", entries: [{ id: "chapters", title: "Chapters, in depth" }] },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.textContent).toContain("On this page");
    expect(screen.getByRole("link", { name: "The walkthrough" })).toHaveAttribute("href", "#walk");
    expect(screen.getByRole("link", { name: "Chapters, in depth" })).toHaveAttribute("href", "#chapters");
    expect(screen.getByText("Going deeper")).toBeInTheDocument();
    const texts = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent);
    expect(texts).toEqual(["The walkthrough", "Chapters, in depth"]);
  });

  it("skips a group with no entries but keeps the others", () => {
    render(
      <OnThisPage
        groups={[
          { label: "Empty", entries: [] },
          { label: "Full", entries: [{ id: "a", title: "A" }] },
        ]}
      />,
    );
    expect(screen.queryByText("Empty")).toBeNull();
    expect(screen.getByText("Full")).toBeInTheDocument();
  });

  it("is hidden below lg, then sticky with its own scroll (the What's new column)", () => {
    render(<OnThisPage groups={[{ entries: [{ id: "a", title: "A" }] }]} className="help-print-hide" />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(nav.className).toContain("lg:block");
    expect(nav.className).toContain("lg:sticky");
    expect(nav.className).toContain("lg:top-6");
    expect(nav.className).toContain("lg:self-start");
    expect(nav.className).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(nav.className).toContain("lg:overflow-y-auto");
    expect(nav.className).toContain("help-print-hide");
  });

  it("styles links as 13px muted text that darkens on hover (legal-page style)", () => {
    render(<OnThisPage groups={[{ entries: [{ id: "a", title: "A" }] }]} />);
    const link = screen.getByRole("link", { name: "A" });
    expect(link.className).toContain("text-[13px]");
    expect(link.className).toContain("text-muted-foreground");
    expect(link.className).toContain("hover:text-foreground");
  });
});
