import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { GoogleSignInButton, DevSignInButton } from "./signin-buttons";

const signInMock = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn: signInMock }));

beforeEach(() => {
  signInMock.mockReset();
  signInMock.mockResolvedValue(undefined);
});

const bfcacheReturn = () =>
  act(() => {
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  });

describe("GoogleSignInButton (spec 2026-10-01 §B)", () => {
  it("shows the Google G, left of the label, inside the button", () => {
    render(<GoogleSignInButton />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    const g = button.querySelector('[data-testid="google-mark"]')!;
    expect(g).not.toBeNull();
    expect(g).toHaveAttribute("aria-hidden", "true");
    expect(g.compareDocumentPosition(screen.getByText("Continue with Google")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.className).toContain("[&_svg]:size-[18px]");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toBeDisabled();
  });
  it("clicking calls signIn with the callbackUrl and shows the loading state with 'Opening Google…'", async () => {
    render(<GoogleSignInButton callbackUrl="/trips/abc/plan" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInMock).toHaveBeenCalledWith("google", { callbackUrl: "/trips/abc/plan" });
    const busy = await screen.findByRole("button", { name: "Opening Google…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();
    expect(busy.querySelector('[data-testid="google-mark"]')).toBeNull(); // the spinner replaces the G
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });
  it("defaults the callbackUrl to /trips", () => {
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInMock).toHaveBeenCalledWith("google", { callbackUrl: "/trips" });
  });
  it("resets when the page is restored from the bfcache", async () => {
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByRole("button", { name: "Opening Google…" });
    bfcacheReturn();
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toBeDisabled();
    expect(button.querySelector('[data-testid="google-mark"]')).not.toBeNull();
  });
  it("resets when signIn rejects", async () => {
    signInMock.mockRejectedValueOnce(new Error("offline"));
    render(<GoogleSignInButton />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).not.toHaveAttribute("aria-busy"));
  });
  it("keeps the variant and extra classes", () => {
    render(<GoogleSignInButton variant="secondary" className="lg:self-start" />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button.className).toContain("bg-card");
    expect(button.className).toContain("lg:self-start");
    expect(button.className).toContain("w-full");
  });
});

describe("DevSignInButton (spec 2026-10-01 §B)", () => {
  it("clicking calls signIn('dev-login') and shows 'Signing in…' with aria-busy", async () => {
    render(<DevSignInButton email="you@example.com" label="You" callbackUrl="/trips/new" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue as You" }));
    expect(signInMock).toHaveBeenCalledWith("dev-login", { email: "you@example.com", callbackUrl: "/trips/new" });
    const busy = await screen.findByRole("button", { name: "Signing in…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
  });
  it("resets on bfcache return and when signIn rejects", async () => {
    render(<DevSignInButton email="you@example.com" label="You" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue as You" }));
    await screen.findByRole("button", { name: "Signing in…" });
    bfcacheReturn();
    expect(screen.getByRole("button", { name: "Continue as You" })).not.toHaveAttribute("aria-busy");
    signInMock.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Continue as You" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue as You" })).not.toHaveAttribute("aria-busy"));
    expect(signInMock).toHaveBeenLastCalledWith("dev-login", { email: "you@example.com", callbackUrl: "/trips" });
  });
});
