import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Landing } from "./landing";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const desktop = () => document.querySelector('[data-slot="landing-desktop"]') as HTMLElement;
const phone = () => document.querySelector('[data-slot="landing-phone"]') as HTMLElement;

describe("Landing (spec 2026-09-29 collage)", () => {
  it("renders a desktop tree and a phone tree, one displayed per breakpoint (Review Focus 3)", () => {
    render(<Landing />);
    expect(desktop().className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(desktop().className).toContain("lg:grid");
    expect(phone().className).toContain("lg:hidden");
    expect(within(desktop()).getByTestId("collage-cards")).toHaveAttribute("aria-hidden", "true");
    expect(within(phone()).getByTestId("sample-cards-phone")).toHaveAttribute("aria-hidden", "true");
  });
  it("leads with the kit's hero heading in both trees, with the kit body copy", () => {
    render(<Landing />);
    expect(within(desktop()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(phone()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(desktop()).getByText(/Stops, sleeps, trains and money in one place — shared with whoever's coming\. Fork the plan when you disagree\. Count sleeps, not days\./)).toBeInTheDocument();
    expect(within(phone()).getByText("Stops, sleeps, trains and money in one place — shared with whoever's coming.")).toBeInTheDocument();
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
  it("each tree has a header Sign in button, then Sign in + Request access under the hero; no Start a trip / Sign up / Log in (C2, C3)", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      expect(within(tree).getAllByRole("button", { name: "Sign in" })).toHaveLength(2);
      expect(within(tree).getByRole("button", { name: "Request access" })).toBeInTheDocument();
      expect(within(tree).getByRole("navigation", { name: "Legal" })).toHaveTextContent("Teepee is invite-only");
    }
    expect(document.body.textContent).not.toMatch(/Start a trip|sign up|log ?in|How it works|free for up to/i);
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });
  it("the buttons follow the hero body in document order, and the phone cards follow the buttons (C5)", () => {
    render(<Landing />);
    const body = within(phone()).getByText("Stops, sleeps, trains and money in one place — shared with whoever's coming.");
    const req = within(phone()).getByRole("button", { name: "Request access" });
    const cards = within(phone()).getByTestId("sample-cards-phone");
    expect(body.compareDocumentPosition(req) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(req.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("the phone tree fills exactly one screen and never scrolls (Review Focus 3)", () => {
    render(<Landing />);
    expect(phone().className).toMatch(/h-dvh/);
    expect(phone().className).toMatch(/overflow-hidden/);
  });
  it("desktop: the collage sits on the clipped sun panel; no sign-in card or sample cards on the left (C4, C6)", () => {
    render(<Landing />);
    const collage = within(desktop()).getByTestId("collage-cards");
    const panel = collage.parentElement!;
    expect(panel.className).toContain("bg-sun");
    expect(panel.className).toContain("overflow-hidden");
    expect(desktop().className).toContain("lg:grid-cols-[1fr_0.8fr]");
    expect(within(desktop()).queryByRole("region", { name: "Come on in" })).not.toBeInTheDocument();
    expect(within(phone()).queryByRole("region", { name: "Come on in" })).not.toBeInTheDocument();
  });
  it("no dialog is open on load", () => {
    render(<Landing />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
