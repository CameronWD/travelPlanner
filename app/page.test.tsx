import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);
const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));

import RootPage, { metadata } from "./page";

describe("RootPage", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
    findUnique.mockReset();
  });

  it("sends a signed-in Traveller to /trips", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUnique.mockResolvedValue({ id: "u1" });
    await expect(RootPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });

  it("sends a signed-in visitor to a safe callbackUrl (Use this route)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    findUnique.mockResolvedValue({ id: "u1" });
    await expect(
      RootPage({ searchParams: Promise.resolve({ callbackUrl: "/trips/new?fromShare=tok" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/trips/new?fromShare=tok");
  });

  it.each(["//evil.example", "https://evil.example/", "/\\evil.example", "/%2F%2Fevil.example"])(
    "ignores an off-site callbackUrl %j",
    async (callbackUrl) => {
      authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
      findUnique.mockResolvedValue({ id: "u1" });
      await expect(RootPage({ searchParams: Promise.resolve({ callbackUrl }) })).rejects.toThrow("NEXT_REDIRECT");
      expect(redirectMock).toHaveBeenCalledWith("/trips");
    },
  );

  it("opens the request panel for ?panel=request, and denied still wins", async () => {
    authMock.mockResolvedValue(null);
    const { unmount } = render(await RootPage({ searchParams: Promise.resolve({ panel: "request" }) }));
    expect(screen.getByRole("dialog", { name: "Ask to join" })).toBeInTheDocument();
    unmount();
    render(await RootPage({ searchParams: Promise.resolve({ panel: "request", error: "AccessDenied" }) }));
    expect(screen.getByRole("dialog", { name: "Teepee is invite-only." })).toBeInTheDocument();
  });

  it("shows a signed-out visitor the landing", async () => {
    authMock.mockResolvedValue(null);
    render(await RootPage({ searchParams: Promise.resolve({}) }));
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 1, name: /Plan it with your people/ })[0]).toBeInTheDocument();
  });

  it("shows the landing, not a redirect, when the session's user no longer exists (no /trips ↔ / loop)", async () => {
    authMock.mockResolvedValue({ user: { id: "gone", email: "a@b.c" } });
    findUnique.mockResolvedValue(null);
    render(await RootPage({ searchParams: Promise.resolve({}) }));
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 1, name: /Plan it with your people/ })[0]).toBeInTheDocument();
  });

  it("titles the page a bare 'Teepee'", () => {
    expect(metadata.title).toEqual({ absolute: "Teepee" });
  });

  it("opens the denied panel for ?error=AccessDenied and ignores other errors", async () => {
    authMock.mockResolvedValue(null);
    const { unmount } = render(await RootPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) }));
    expect(screen.getByRole("dialog", { name: "Teepee is invite-only." })).toBeInTheDocument();
    unmount();
    render(await RootPage({ searchParams: Promise.resolve({ error: "Configuration" }) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
