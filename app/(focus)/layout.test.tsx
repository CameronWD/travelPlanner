import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { auth, redirect, userFind, acceptInvites, acceptGlobeInvites } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  userFind: vi.fn(),
  acceptInvites: vi.fn(),
  acceptGlobeInvites: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: userFind } } }));
vi.mock("@/lib/invites", () => ({ acceptPendingInvitesForUser: acceptInvites }));
vi.mock("@/lib/globe-invites", () => ({ acceptPendingGlobeInvitesForUser: acceptGlobeInvites }));

import FocusLayout from "./layout";

describe("(focus) layout (spec C6)", () => {
  beforeEach(() => {
    redirect.mockClear();
    acceptInvites.mockReset();
    acceptGlobeInvites.mockReset();
    userFind.mockReset().mockResolvedValue({ email: "alice@example.com" });
  });

  it("sends a signed-out visitor to /", async () => {
    auth.mockResolvedValue(null);
    await expect(FocusLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("sends a session with no Traveller row to /, like the app shell", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    userFind.mockResolvedValue(null);
    await expect(FocusLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
  it("reconciles pending Invites, so a first trip is judged after joining (ADR 0017)", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    await FocusLayout({ children: null });
    expect(acceptInvites).toHaveBeenCalledWith("u1", "alice@example.com");
    expect(acceptGlobeInvites).toHaveBeenCalledWith("u1", "alice@example.com");
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
