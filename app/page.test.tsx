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
    await expect(RootPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });

  it("shows a signed-out visitor the landing", async () => {
    authMock.mockResolvedValue(null);
    render(await RootPage());
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 1, name: /Plan it with your people/ })[0]).toBeInTheDocument();
  });

  it("shows the landing, not a redirect, when the session's user no longer exists (no /trips ↔ / loop)", async () => {
    authMock.mockResolvedValue({ user: { id: "gone", email: "a@b.c" } });
    findUnique.mockResolvedValue(null);
    render(await RootPage());
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 1, name: /Plan it with your people/ })[0]).toBeInTheDocument();
  });

  it("titles the page a bare 'Teepee'", () => {
    expect(metadata.title).toEqual({ absolute: "Teepee" });
  });
});
