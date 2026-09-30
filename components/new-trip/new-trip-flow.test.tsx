import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";

const { createTrip, findPlaces, push, toast } = vi.hoisted(() => ({ createTrip: vi.fn(), findPlaces: vi.fn(), push: vi.fn(), toast: vi.fn() }));
vi.mock("@/server/actions/trips", () => ({ createTrip: (...a: unknown[]) => createTrip(...a) }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: (o: unknown) => toast(o) }));
vi.mock("@/lib/image-compress", () => ({ compressImage: async (f: File) => f }));

import { NewTripFlow } from "./new-trip-flow";
import { DRAFT_KEY } from "@/lib/new-trip/draft";

type FlowProps = React.ComponentProps<typeof NewTripFlow>;
const flow = (props: Partial<FlowProps> = {}) => render(<NewTripFlow past={false} firstTrip={false} {...props} />);
const heading = (name: string | RegExp) => screen.findByRole("heading", { level: 2, name });
const nameInput = () => screen.getByRole("textbox", { name: "Trip name" });
const clickContinue = () => userEvent.click(screen.getByRole("button", { name: /^Continue/ }));
const stepParam = () => new URLSearchParams(window.location.search).get("step");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
  createTrip.mockReset().mockResolvedValue({ success: true, tripId: "t1", href: "/trips/kyoto" });
  findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [] });
  push.mockReset();
  toast.mockReset();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/trips/new");
});
afterEach(() => vi.useRealTimers());

describe("NewTripFlow — shell and step 1", () => {
  it("opens on Where to? with the name focused", async () => {
    flow();
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(nameInput()).toHaveFocus();
    expect(screen.getByText("New trip")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "New trip progress" })).toHaveAttribute("aria-valuenow", "1");
  });

  it.each<[Partial<FlowProps>, string]>([
    [{ firstTrip: true, displayName: "Cameron" }, "Welcome, Cameron. Let's start your first trip."],
    [{ firstTrip: true, displayName: "Cameron Williams" }, "Welcome, Cameron. Let's start your first trip."],
    [{ firstTrip: true, displayName: null }, "Let's start your first trip."],
    [{ firstTrip: true, displayName: "  " }, "Let's start your first trip."],
    [{ past: true }, "Log a past trip"],
  ])("eyebrow for %o", async (props, text) => {
    flow(props);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("past mode asks Where did you go? and labels step 3 Where", async () => {
    flow({ past: true });
    expect(await heading("Where did you go?")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Steps" })).getByText("Where")).toBeInTheDocument();
  });

  it("the name is required to continue", async () => {
    flow();
    await clickContinue();
    expect(await screen.findByText("Give it a name to keep going")).toBeInTheDocument();
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(nameInput()).toHaveFocus();
    expect(screen.getByRole("heading", { level: 2, name: "Where to?" })).toBeInTheDocument();
  });

  it("Enter in the name continues to When, mirrored in the URL and announced", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto{Enter}");
    expect(await heading("When are you going?")).toBeInTheDocument();
    expect(stepParam()).toBe("2");
    expect(screen.getByText("Step 2 of 4, When")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "New trip progress" })).toHaveAttribute("aria-valuenow", "2");
  });

  it("a step change focuses the new heading, or the step's autofocused input", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto{Enter}");
    expect(await heading("When are you going?")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Previous step" }));
    await heading("Where to?");
    expect(nameInput()).toHaveFocus();
  });

  it("a done pill goes back, keeping the answer", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("button", { name: "Step 1: Name, done. Go back" }));
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(nameInput()).toHaveValue("Kyoto");
  });

  it("the phone back button steps back", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(await heading("Where to?")).toBeInTheDocument();
  });

  it("browser Back moves between steps", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    window.history.pushState(null, "", "/trips/new?step=1");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await heading("Where to?")).toBeInTheDocument();
  });

  it("cold load at ?step=3 without a name opens on step 1", async () => {
    window.history.replaceState(null, "", "/trips/new?step=3");
    flow({ initialStep: 3 });
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(stepParam()).toBe("1");
  });

  it("arriving from Where to first? opens on step 2 and drops ?name= from the URL", async () => {
    window.history.replaceState(null, "", "/trips/new?name=Japan&step=2");
    flow({ initialName: "Japan", initialStep: 2 });
    expect(await heading("When are you going?")).toBeInTheDocument();
    expect(window.location.search).toBe("?step=2");
  });

  it("the draft survives a remount", async () => {
    const { unmount } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toMatchObject({ name: "Kyoto", step: 2 });
    unmount();
    flow();
    expect(await heading("When are you going?")).toBeInTheDocument();
  });

  it("Log a past trip keeps the name", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    expect(screen.getByRole("link", { name: "Log a past trip" })).toHaveAttribute("href", "/trips/new?past=1&name=Kyoto");
  });

  it("Esc on a dirty draft asks first; Keep going stays; Leave goes to /trips and forgets the draft", async () => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await userEvent.keyboard("{Escape}");
    const dialog = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep going" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Leave" }));
    expect(push).toHaveBeenCalledWith("/trips");
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("Cancel on a clean draft leaves at once", async () => {
    flow();
    await heading("Where to?");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/trips");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the live preview beside the question", async () => {
    flow();
    await userEvent.type(nameInput(), "Japan at Christmas");
    expect(within(screen.getByTestId("trip-preview")).getAllByText("Japan at Christmas").length).toBeGreaterThan(0);
  });

  it("server-renders only a stable shell, never the draft or the clock", () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ past: false, step: 2, name: "Kyoto", dateMode: "exact", homeCurrency: "AUD", stops: [], stamped: false }));
    const html = renderToString(<NewTripFlow past={false} firstTrip={false} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/Kyoto|Where to\?|When are you going\?/);
  });

  it("uses no banned soft styles", async () => {
    const { container } = flow();
    await heading("Where to?");
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
