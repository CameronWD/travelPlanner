import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Landing } from "./landing";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const desktop = () => document.querySelector('[data-slot="landing-desktop"]') as HTMLElement;
const phone = () => document.querySelector('[data-slot="landing-phone"]') as HTMLElement;

describe("Landing (spec 2026-09-29)", () => {
  it("renders a desktop tree and a phone tree, one displayed per breakpoint (Review Focus 3)", () => {
    render(<Landing />);
    expect(desktop().className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(desktop().className).toContain("lg:grid");
    expect(phone().className).toContain("lg:hidden");
    expect(within(desktop()).getByTestId("sample-cards-desktop")).toHaveAttribute("aria-hidden", "true");
    expect(within(phone()).getByTestId("sample-cards-phone")).toHaveAttribute("aria-hidden", "true");
  });
  it("leads with the kit's hero heading in both trees, with the kit body copy", () => {
    render(<Landing />);
    expect(within(desktop()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(phone()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(desktop()).getByText(/Stops, sleeps, trains and money in one place — shared with whoever's coming\. Fork the plan when you disagree\. Count sleeps, not days\./)).toBeInTheDocument();
    expect(within(phone()).getByText("Stops, sleeps, trains and money in one place — shared with whoever's coming.")).toBeInTheDocument();
  });
  it("header has a 'Sign in' link and the hero a 'Start a trip' link, both to /signin; no 'How it works', no chip (D2, D5)", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      expect(within(tree).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    }
    expect(within(desktop()).getByRole("link", { name: "Start a trip" })).toHaveAttribute("href", "/signin");
    expect(document.body.textContent).not.toMatch(/How it works|free for up to/i);
  });
  it("the 'Come on in' card sits on a sun panel with the invite line and the honest controls; the phone sheet carries the same", () => {
    render(<Landing />);
    const card = within(desktop()).getByRole("region", { name: "Come on in" });
    expect(card.parentElement!.className).toContain("bg-sun");
    expect(card.parentElement!.className).not.toContain("bg-teal");
    expect(card.className).toContain("tp-card-pop-in");
    expect(within(card).getByText("Teepee is invite-only — sign in with the Google account you were invited with.")).toBeInTheDocument();
    expect(within(card).getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
    const sheet = within(phone()).getByRole("region", { name: "Come on in" });
    expect(sheet.className).toContain("mt-auto");
    expect(within(sheet).getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
  });
  it("has no invite form, no email field, no 'No passwords' line", () => {
    const { container } = render(<Landing />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toMatch(/No passwords|^Invite/i);
  });
  it("forces light mode on its root", () => {
    const { container } = render(<Landing />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toContain("light");
    const css = readFileSync(join(__dirname, "..", "globals.css"), "utf8");
    expect(css).toMatch(/\[data-theme="light"\],\s*:root\s*\{\s*--background: 40 100% 98%;/);
  });
  it("uses the kit's lilac-card copy and never 'hotel' or 'stay'", () => {
    const { container } = render(<Landing />);
    expect(within(desktop()).getByText("Zz Machiya near Gion")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
  });
  it("keeps the Legal links as padded tap targets under the card", () => {
    render(<Landing />);
    const privacy = within(desktop()).getByRole("link", { name: "Privacy" });
    expect(privacy.className).toContain("tap-target");
    expect(privacy.closest("nav")).toHaveAccessibleName("Legal");
  });
});
