import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: signOutMock } }));

import { SignOutButton, SignOutMenuItem } from "./sign-out-button";

const assignMock = vi.fn();
const postMessageMock = vi.fn();
const setOnline = (online: boolean) =>
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
  assignMock.mockReset();
  postMessageMock.mockReset();
  setOnline(true);
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve({ active: { postMessage: postMessageMock } }) },
    configurable: true,
  });
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: assignMock },
    writable: true,
    configurable: true,
  });
});

describe("SignOutButton", () => {
  it("is a plain button labelled Sign out", () => {
    render(<SignOutButton />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("signs out, then clears the cache, then redirects", async () => {
    const order: string[] = [];
    signOutMock.mockImplementation(async () => void order.push("signOut"));
    postMessageMock.mockImplementation(() => void order.push("clear"));
    assignMock.mockImplementation(() => void order.push("assign"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(order).toEqual(["signOut", "clear", "assign"]);
    expect(postMessageMock).toHaveBeenCalledWith({ type: "CLEAR_CACHE" });
  });

  it("keeps the saved copy when sign-out fails", async () => {
    signOutMock.mockRejectedValue(new Error("network"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("asks first when offline, and cancel does nothing", async () => {
    setOnline(false);
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByText(
        "You're offline. Signing out removes the saved copy of your trips from this phone.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("clears the cache and redirects when the offline confirm is accepted", async () => {
    setOnline(false);
    signOutMock.mockRejectedValue(new Error("offline"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText(/You're offline/);
    const confirmButtons = screen.getAllByRole("button", { name: "Sign out" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(postMessageMock).toHaveBeenCalledWith({ type: "CLEAR_CACHE" });
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
