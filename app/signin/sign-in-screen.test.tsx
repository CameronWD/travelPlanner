import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInScreen } from "./sign-in-screen";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
const env = { ...process.env };
beforeEach(() => { process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; delete process.env.ALLOW_DEV_LOGIN; });
afterEach(() => { process.env = { ...env }; });

describe("SignInScreen (spec 2026-09-29 §1.3, D7)", () => {
  it("is the kit's sign-in: heading, body with 'the Wishlist', secondary Google button, invite hint", () => {
    render(<SignInScreen accessDenied={false} />);
    expect(screen.getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
    expect(screen.getByText("One trip, everyone on it. Stops, days, money and the Wishlist.")).toBeInTheDocument();
    const g = screen.getByRole("button", { name: "Continue with Google" });
    expect(g.className).toContain("bg-card");
    expect(g.className).toContain("lg:self-start");
    expect(screen.getByText("Got an invite? Sign in with the email it was sent to and the trip will be waiting.")).toBeInTheDocument();
    expect(screen.getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/maybe-list|No passwords|Come on in/i);
  });
  it("shows the sun panel with the tilted '19 sleeps' card, animated", () => {
    render(<SignInScreen accessDenied={false} />);
    const card = screen.getByText("12 – 24 Oct · 4 stops").closest(".tp-card-in") as HTMLElement;
    expect(card.style.getPropertyValue("--tp-tilt")).toBe("-3deg");
    expect(card).toHaveTextContent("19 sleeps");
    expect(card).toHaveTextContent("Japan in Autumn");
    expect(card.parentElement!.className).toContain("bg-sun");
    expect(card.parentElement).toHaveAttribute("aria-hidden", "true");
  });
  it("access denied replaces the invite hint with the neutral explanation, once", () => {
    render(<SignInScreen accessDenied />);
    expect(screen.getByText(/recorded the attempt for the admin/)).toBeInTheDocument();
    expect(screen.queryByText(/Got an invite\?/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/invite-only/i)).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/once you(’|')?re approved/i);
    expect(document.body.textContent).toMatch(/not every request is granted/i);
  });
  it("forces light mode and keeps the Legal nav", () => {
    const { container } = render(<SignInScreen accessDenied={false} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-theme", "light");
    expect(root.className).toContain("light");
    expect(screen.getByRole("navigation", { name: "Legal" })).toContainElement(screen.getByRole("link", { name: "Privacy" }));
  });
});
