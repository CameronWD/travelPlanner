import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Landing } from "./landing";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const desktop = () => document.querySelector('[data-slot="landing-desktop"]') as HTMLElement;
const phone = () => document.querySelector('[data-slot="landing-phone"]') as HTMLElement;

const env = { ...process.env };
beforeEach(() => {
  process.env.AUTH_GOOGLE_ID = "id";
  process.env.AUTH_GOOGLE_SECRET = "s";
  delete process.env.ALLOW_DEV_LOGIN;
});
afterEach(() => {
  process.env = { ...env };
});

describe("Landing (spec 2026-09-29 collage)", () => {
  it("renders a desktop tree and a phone tree, one displayed per breakpoint (Review Focus 3)", () => {
    render(<Landing />);
    expect(desktop().className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(desktop().className).toContain("lg:grid");
    expect(phone().className).toContain("lg:hidden");
    expect(within(desktop()).getByTestId("collage-cards")).toHaveAttribute("aria-hidden", "true");
    expect(within(phone()).getByTestId("sample-cards-phone")).toHaveAttribute("aria-hidden", "true");
  });
  it("leads with the kit's hero heading in both trees, with the same body copy (spec 2026-09-29 body copy)", () => {
    render(<Landing />);
    expect(within(desktop()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(phone()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    const body = "Stops, trains, beds and budget all in one place. For the trip you're dreaming up, the one you're on, and everywhere you've been.";
    expect(within(desktop()).getByText(body)).toBeInTheDocument();
    expect(within(phone()).getByText(body)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sleeps|Fork the plan|whoever's coming/);
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
  it("each tree has Sign in + Request access under the hero; no Start a trip / Sign up / Log in (C2, C3)", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      expect(within(tree).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
      expect(within(tree).getByRole("button", { name: "Request access" })).toBeInTheDocument();
      expect(within(tree).getByText("Teepee is invite-only")).toBeInTheDocument();
      const legal = within(tree).getByRole("navigation", { name: "Legal" });
      expect(within(legal).getByRole("link", { name: "Privacy" })).toBeInTheDocument();
      expect(within(legal).getByRole("link", { name: "Terms" })).toBeInTheDocument();
    }
    expect(document.body.textContent).not.toMatch(/Start a trip|sign up|log ?in|How it works|free for up to/i);
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });
  it("the header is the logo alone — no Sign in button above the hero", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      const h1 = within(tree).getByRole("heading", { level: 1 });
      const signIn = within(tree).getByRole("button", { name: "Sign in" });
      expect(h1.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it("accessDenied opens the denied panel on load", () => {
    render(<Landing accessDenied />);
    expect(screen.getByRole("dialog", { name: "Teepee is invite-only." })).toBeInTheDocument();
  });
  it("the buttons follow the hero body in document order, and the phone cards follow the buttons (C5)", () => {
    render(<Landing />);
    const body = within(phone()).getByText("Stops, trains, beds and budget all in one place. For the trip you're dreaming up, the one you're on, and everywhere you've been.");
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
  it("wires a real Request access click through to the Sign in panel", async () => {
    render(<Landing />);
    const req = within(phone()).getByRole("button", { name: "Request access" });
    await userEvent.click(req);
    const dialog = screen.getByRole("dialog", { name: "Ask to join" });
    expect(within(dialog).getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
  });
});
