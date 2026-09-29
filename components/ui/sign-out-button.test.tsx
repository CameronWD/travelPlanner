import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

import { SignOutButton, SignOutMenuItem } from "./sign-out-button";

describe("SignOutButton", () => {
  it("is a plain button labelled Sign out", () => {
    render(<SignOutButton />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("runs the shared sign-out sequence on click", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    // clearOfflineCache() resolves synchronously in jsdom (no navigator.serviceWorker),
    // so signOut is called on the same microtask flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("applies the className it's given", () => {
    render(<SignOutButton className="my-row-class" />);
    expect(screen.getByRole("button", { name: "Sign out" }).className).toContain("my-row-class");
  });
});

// SignOutMenuItem only renders inside a Radix DropdownMenu, so it's exercised
// via the pages that mount it (app/(app)/layout.test.tsx's Dock/menu tests) —
// this file just confirms the export still exists and shares the sequence.
describe("SignOutMenuItem", () => {
  it("is exported for the avatar menu to use", () => {
    expect(typeof SignOutMenuItem).toBe("function");
  });
});
