import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const authMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import RootPage, { metadata } from "./page";

describe("RootPage", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
  });

  it("sends a signed-in Traveller to /trips", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    await expect(RootPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });

  it("shows a signed-out visitor the landing", async () => {
    authMock.mockResolvedValue(null);
    render(await RootPage());
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: /Plan it with your people/ })).toBeInTheDocument();
  });

  it("titles the page a bare 'Teepee'", () => {
    expect(metadata.title).toEqual({ absolute: "Teepee" });
  });
});
