import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listShareLinks = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/share", () => ({ listShareLinks: (id: string) => listShareLinks(id) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a>,
}));

import { toast } from "@/components/ui/use-toast";
import { ShareChooserMount, ShareTripButton } from "./share-chooser";

const LINK = { id: "l1", token: "tok-1", label: "Mum & Dad", includeAccommodation: true, includeTransport: true,
  includeDailyPlans: true, includeJournal: false, showTravellers: false, includeContacts: false, createdAt: "2026-09-20T00:00:00.000Z" };

/** matchMedia whose `(pointer: coarse)` answer is `coarse`; the Dialog also subscribes to it. */
function stubPointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : query === "(min-width: 640px)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function setup() {
  render(<><ShareChooserMount tripId="t1" /><ShareTripButton /></>);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});

// The two pick tests click with userEvent directly: userEvent.setup() swaps
// navigator.clipboard for its own stub, hiding the writeText spy (as in Task 35).
describe("Share chooser (spec 2026-10-06 §O)", () => {
  it("lists the Trip's Share links by label, plus New share link… to Settings", async () => {
    listShareLinks.mockResolvedValue([LINK]);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("button", { name: "Mum & Dad" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New share link…" })).toHaveAttribute("href", "/trips/t1/settings#sharing");
    expect(listShareLinks).toHaveBeenCalledWith("t1");
  });

  it("with no links shows only New share link…", async () => {
    listShareLinks.mockResolvedValue([]);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("link", { name: "New share link…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mum & Dad" })).toBeNull();
  });

  it("on a computer, picking a link copies its URL and says so", async () => {
    listShareLinks.mockResolvedValue([LINK]);
    stubPointer(false);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mum & Dad" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/share/tok-1`));
    expect(toast).toHaveBeenCalledWith({ title: "Link copied" });
  });

  it("on a phone, picking a link hands its URL to the OS share sheet", async () => {
    listShareLinks.mockResolvedValue([LINK]);
    stubPointer(true);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mum & Dad" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "Mum & Dad", url: `${window.location.origin}/share/tok-1` }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("never creates a link", async () => {
    listShareLinks.mockResolvedValue([]);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Share" }));
    await screen.findByRole("link", { name: "New share link…" });
    // The module imports only listShareLinks; a createShareLink call would throw on the mock.
    expect(listShareLinks).toHaveBeenCalledTimes(1);
  });
});
