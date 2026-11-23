import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: signOutMock } }));

const forgetUsageMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/usage/client", () => ({ forgetUsage: forgetUsageMock }));

import { SignOutButton, SignOutMenuItem } from "./sign-out-button";

const assignMock = vi.fn();
const postMessageMock = vi.fn();
const setOnline = (online: boolean) =>
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });

beforeEach(() => {
  signOutMock.mockReset();
  forgetUsageMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
  assignMock.mockReset();
  postMessageMock.mockReset();
  setOnline(true);
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      ready: new Promise(() => {}),
      getRegistration: async () => ({ active: { postMessage: postMessageMock } }),
    },
    configurable: true,
  });
  window.localStorage.clear();
  window.localStorage.setItem("teepee.offline.savedAt.t1", "1700000000000");
  window.localStorage.setItem("teepee.offline.savedBuild.t1", "b1");
  window.localStorage.setItem("teepee.offline.counts.t1", "{}");
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

  it("says it is working and is disabled while sign-out is unresolved, and ignores a second click", async () => {
    let release!: () => void;
    signOutMock.mockReturnValue(new Promise<void>((r) => { release = r; }));
    render(<SignOutButton />);
    const button = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
  });

  it("still redirects when no service worker is registered", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: new Promise(() => {}), getRegistration: async () => undefined },
      configurable: true,
    });
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  const savedKeys = () => Object.keys(window.localStorage).filter((key) => key.startsWith("teepee.offline."));

  it("forgets every Saved for offline record when the cache is cleared", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(savedKeys()).toEqual([]);
  });

  it("forgets the queued Usage beside the saved copy", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(forgetUsageMock).toHaveBeenCalledTimes(1);
  });

  const OFFLINE_COPY =
    "You’re offline. Signing out removes the saved copy of your trips from this phone.";

  async function cancelConfirm() {
    expect(await screen.findByText(OFFLINE_COPY)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(OFFLINE_COPY)).not.toBeInTheDocument());
    expect(postMessageMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
    expect(savedKeys()).toHaveLength(3);
  }

  async function confirmDialog() {
    await screen.findByText(OFFLINE_COPY);
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/"));
    expect(postMessageMock).toHaveBeenCalledWith({ type: "CLEAR_CACHE" });
    expect(savedKeys()).toEqual([]);
  }

  it("asks first when sign-out rejects while the browser says online, cancel keeps the copy", async () => {
    signOutMock.mockRejectedValue(new Error("network"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await cancelConfirm();
  });

  it("asks first when sign-out resolves with an error, confirm clears and redirects", async () => {
    signOutMock.mockResolvedValue({ data: null, error: { status: 500 } });
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText(OFFLINE_COPY);
    expect(postMessageMock).not.toHaveBeenCalled();
    await confirmDialog();
  });

  it("asks first when offline, and cancel does nothing", async () => {
    setOnline(false);
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await cancelConfirm();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("clears the cache and redirects when the offline confirm is accepted", async () => {
    setOnline(false);
    signOutMock.mockRejectedValue(new Error("offline"));
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await confirmDialog();
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
