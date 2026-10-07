import type { Route } from "next";
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { ShareTopBar } from "./share-top-bar";
import { ShareCta, ShareFooter, SHARE_FOOTER_COPY } from "./share-cta";

const hrefs = { requestAccess: "/?panel=request&ref=share&t=abc" as Route, useRoute: "/?panel=sign-in&callbackUrl=x" as Route, fromScratch: "/?panel=sign-in&callbackUrl=y" as Route };

describe("ShareTopBar (SHARE.md §2)", () => {
  it("links both pills to Become a tester and says it's a shared trip on desktop", () => {
    render(<ShareTopBar requestAccessHref={hrefs.requestAccess} />);
    expect(screen.getByRole("link", { name: "Plan your own trip" })).toHaveAttribute("href", hrefs.requestAccess);
    expect(screen.getByRole("link", { name: "Plan your own" })).toHaveAttribute("href", hrefs.requestAccess);
    expect(screen.getByText("You're viewing a shared trip")).toBeInTheDocument();
  });
});

describe("ShareCta (spec §E.2)", () => {
  it.each(["before", "during"] as const)("%s: in-testing copy and Become a tester", (stage) => {
    render(<ShareCta stage={stage} stopCount={6} hrefs={hrefs} />);
    expect(screen.getByText(/It's in testing for now\. Ask to be a tester\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Become a tester" })).toHaveAttribute("href", hrefs.requestAccess);
    expect(screen.queryByText(/free to start/i)).not.toBeInTheDocument();
  });
  it("after: Use this route with the stop count, and start from scratch", () => {
    render(<ShareCta stage="after" stopCount={6} hrefs={hrefs} />);
    expect(screen.getByRole("heading", { name: "Fancy doing this one?" })).toBeInTheDocument();
    expect(screen.getByText("Start a trip with the same 6 stops. You pick the dates.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use this route" })).toHaveAttribute("href", hrefs.useRoute);
    expect(screen.getByRole("link", { name: /start from scratch/ })).toHaveAttribute("href", hrefs.fromScratch);
  });
  it.each([
    ["after", 6, "Use this route"],
    ["before", 6, "Become a tester"],
  ] as const)("%s: the %s button pops once when the card comes into view and loads on click (S10, S11)", async (stage, stopCount, name) => {
    render(<ShareCta stage={stage} stopCount={stopCount} hrefs={hrefs} />);
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("data-cta-button");
    const reveal = link.closest("[data-slot='share-reveal']")!;
    expect(reveal.className).toMatch(/tp-reveal-pop/);
    expect(reveal).toHaveAttribute("data-revealed");
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(link);
    expect(link).toHaveAttribute("aria-busy", "true");
  });

  it("after with no stops falls back to the Become a tester card", () => {
    render(<ShareCta stage="after" stopCount={0} hrefs={hrefs} />);
    expect(screen.queryByRole("link", { name: "Use this route" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Become a tester" })).toBeInTheDocument();
  });
  it("is a sun card with a hard shadow, no banned styles", () => {
    const { container } = render(<ShareCta stage="before" stopCount={1} hrefs={hrefs} />);
    const card = container.querySelector("[data-slot='share-cta']")!;
    expect(card.className).toMatch(/\bbg-sun\b/);
    expect(card.className).toMatch(/\bshadow-hard-5\b/);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});

describe("ShareFooter", () => {
  it("is the one closing line; the old Made-with line is gone", () => {
    render(<ShareFooter />);
    expect(screen.getByText(SHARE_FOOTER_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/Made with Teepee/)).not.toBeInTheDocument();
  });
});
