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
  delete process.env.AUTH_RESEND_KEY;
  delete process.env.AUTH_RESEND_FROM;
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
    expect(within(desktop()).getByTestId("collage-cards")).not.toHaveAttribute("aria-hidden");
    expect(within(phone()).getByTestId("sample-cards-phone")).not.toHaveAttribute("aria-hidden");
  });
  it("leads with the kit's hero heading in both trees, with the same body copy (spec 2026-09-29 body copy)", () => {
    render(<Landing />);
    expect(within(desktop()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(within(phone()).getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    const body = "Stops, trains, beds and budget all in one place. For the trip you're dreaming up, the one you're on, and everywhere you've been.";
    expect(within(desktop()).getByText(body)).toBeInTheDocument();
    expect(within(phone()).getByText(body)).toBeInTheDocument();
    expect(within(desktop()).queryByText(/Fork the plan|Count sleeps|whoever's coming/)).toBeNull();
    expect(within(phone()).queryByText(/Fork the plan|Count sleeps|whoever's coming/)).toBeNull();
  });
  it("without the Sign-in link configured: no invite form, no email field, no 'No passwords' line", () => {
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
    expect(within(desktop()).getByText("Machiya near Gion")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bhotel\b|\bstay\b|staying/i);
  });
  it("each tree has Sign in + Become a tester under the hero; no Start a trip / Sign up / Log in (C2, C3)", () => {
    render(<Landing />);
    for (const tree of [desktop(), phone()]) {
      expect(within(tree).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
      expect(within(tree).getByRole("button", { name: "Become a tester" })).toBeInTheDocument();
      expect(within(tree).getByText("Teepee is in testing")).toBeInTheDocument();
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
    expect(screen.getByRole("dialog", { name: "Teepee is in testing." })).toBeInTheDocument();
  });
  it("the buttons follow the hero body in document order, and the phone cards follow the buttons (C5)", () => {
    render(<Landing />);
    const body = within(phone()).getByText("Stops, trains, beds and budget all in one place. For the trip you're dreaming up, the one you're on, and everywhere you've been.");
    const req = within(phone()).getByRole("button", { name: "Become a tester" });
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
  it("wires a real Become a tester click through to the Sign in panel", async () => {
    render(<Landing />);
    const req = within(phone()).getByRole("button", { name: "Become a tester" });
    await userEvent.click(req);
    const dialog = screen.getByRole("dialog", { name: "Want to test it?" });
    expect(within(dialog).getByText("Apple sign-in is on the way.")).toBeInTheDocument();
  });
  it("with the Sign-in link configured, the Sign in panel holds the email field in both modes (spec 2026-10-01 §B3)", async () => {
    process.env.AUTH_RESEND_KEY = "re_x"; process.env.AUTH_RESEND_FROM = "f";
    render(<Landing />);
    await userEvent.click(within(desktop()).getByRole("button", { name: "Sign in" }));
    expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await userEvent.click(within(desktop()).getByRole("button", { name: "Become a tester" }));
    expect(within(screen.getByRole("dialog", { name: "Want to test it?" })).getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });
  it("phone: the hero is centred and the legal row sits centred on one line; desktop keeps start alignment (LANDING.md §2.1)", () => {
    render(<Landing />);
    expect(phone().className).toContain("items-center");
    expect(phone().className).toContain("text-center");
    expect(within(phone()).getByRole("heading", { level: 1 }).className).toContain("text-balance");
    const phoneLegal = within(phone()).getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(phoneLegal.className).toContain("justify-center");
    expect(phoneLegal.className).toContain("whitespace-nowrap");
    const desktopLegal = within(desktop()).getByRole("navigation", { name: "Legal" }).parentElement!;
    expect(desktopLegal.className).not.toContain("justify-center");
    expect(desktopLegal.className).toContain("whitespace-nowrap");
  });
  it("linkExpired opens the panel in link-expired mode; accessDenied still wins when both are set (Review Focus 4)", () => {
    const { unmount } = render(<Landing linkExpired />);
    expect(screen.getByRole("dialog", { name: "That link didn't work" })).toBeInTheDocument();
    unmount();
    render(<Landing linkExpired accessDenied />);
    expect(screen.getByRole("dialog", { name: "Teepee is in testing." })).toBeInTheDocument();
  });
});
