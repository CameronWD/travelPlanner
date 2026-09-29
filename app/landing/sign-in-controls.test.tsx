import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInControls } from "./sign-in-controls";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const env = { ...process.env };
beforeEach(() => { delete process.env.ALLOW_DEV_LOGIN; delete process.env.AUTH_GOOGLE_ID; delete process.env.AUTH_GOOGLE_SECRET; });
afterEach(() => { process.env = { ...env }; });

describe("SignInControls (spec 2026-09-29 D4)", () => {
  it("with Google configured: the Google button, no dev logins, and the on-the-way line", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s";
    render(<SignInControls />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue as/ })).not.toBeInTheDocument();
    expect(screen.getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
    expect(screen.queryByText(/^or$/)).not.toBeInTheDocument();
  });
  it("in development: a dotted 'or' divider and the You / Partner dev logins under Google", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; process.env.ALLOW_DEV_LOGIN = "true";
    render(<SignInControls />);
    const or = screen.getByText("or");
    expect(or.parentElement!.querySelector("span.border-dotted")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Continue as You" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as Partner" })).toBeInTheDocument();
  });
  it("with nothing configured: an explanatory note, never an empty block (Review Focus 5)", () => {
    render(<SignInControls />);
    expect(screen.getByText(/No sign-in method is configured yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("never renders an input, a form, or a disabled placeholder control", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; process.env.ALLOW_DEV_LOGIN = "true";
    const { container } = render(<SignInControls />);
    expect(container.querySelector("input, form, [disabled]")).toBeNull();
    expect(container.textContent).not.toMatch(/No passwords|Apple sign in$|free for up to/i);
  });
  it("passes the Google button variant through for the Sign in screen", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s";
    render(<SignInControls google="secondary" googleClassName="lg:self-start" />);
    const g = screen.getByRole("button", { name: "Continue with Google" });
    expect(g.className).toContain("bg-card");
    expect(g.className).toContain("lg:self-start");
  });
  it("afterGoogle renders between the Google button and the dev buttons", () => {
    process.env.AUTH_GOOGLE_ID = "id"; process.env.AUTH_GOOGLE_SECRET = "s"; process.env.ALLOW_DEV_LOGIN = "true";
    render(<SignInControls afterGoogle={<p>hint</p>} />);
    const hint = screen.getByText("hint");
    const devButton = screen.getByRole("button", { name: "Continue as You" });
    expect(hint.compareDocumentPosition(devButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("dev login without Google: the dev buttons alone, no dangling 'or' divider and no fallback note", () => {
    process.env.ALLOW_DEV_LOGIN = "true";
    render(<SignInControls />);
    expect(screen.getByRole("button", { name: "Continue as You" })).toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(screen.queryByText(/No sign-in method is configured yet/)).not.toBeInTheDocument();
    expect(screen.getByText("Email and Apple sign-in are on the way.")).toBeInTheDocument();
  });
});
