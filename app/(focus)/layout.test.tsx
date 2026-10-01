import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { auth, redirect, userFind, reconcile, headersGet } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  userFind: vi.fn(),
  reconcile: vi.fn(),
  headersGet: vi.fn<(name: string) => string | null>(() => null),
}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: userFind } } }));
vi.mock("@/lib/reconcile-invites", () => ({ reconcilePendingInvites: reconcile }));

import FocusLayout from "./layout";

describe("(focus) layout (spec C6)", () => {
  beforeEach(() => {
    redirect.mockClear();
    reconcile.mockReset();
    userFind.mockReset().mockResolvedValue({ email: "alice@example.com" });
  });

  it("sends a signed-out visitor to /", async () => {
    auth.mockResolvedValue(null);
    await expect(FocusLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("carries the requested page to the Landing as callbackUrl (spec 2026-10-01 §E)", async () => {
    auth.mockResolvedValue(null);
    headersGet.mockReturnValueOnce("/trips/new?fromShare=tok");
    await expect(FocusLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/?callbackUrl=%2Ftrips%2Fnew%3FfromShare%3Dtok");
  });
  it("sends a session with no Traveller row to /, like the app shell", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    userFind.mockResolvedValue(null);
    await expect(FocusLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("reconciles pending Invites like the app shell (ADR 0017)", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    await FocusLayout({ children: null });
    expect(reconcile).toHaveBeenCalledWith("u1", "alice@example.com");
  });
  it("renders the page with none of the app chrome", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const { container } = render(await FocusLayout({ children: <p>flow</p> }));
    expect(screen.getByText("flow")).toBeInTheDocument();
    expect(container.querySelector("[data-focus-shell]")).not.toBeNull();
    expect(screen.queryByTestId("app-main")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
