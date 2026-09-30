import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
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
import { setMatchMedia } from "@/test/setup";

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
    expect(nameInput()).toHaveAccessibleDescription("Give it a name to keep going");
    expect(document.getElementById(nameInput().getAttribute("aria-describedby")!)).toHaveAttribute("aria-live", "polite");
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

  it.each([
    ["isComposing", { key: "Escape", isComposing: true }],
    ["keyCode 229", { key: "Escape", keyCode: 229 }],
  ])("Esc during IME composition (%s) does not ask to leave", async (_label, init) => {
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    fireEvent.keyDown(nameInput(), init);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
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
    // The placeholder cross-fades out first (MOTION N5), so the name lands a beat later.
    expect((await within(screen.getByTestId("trip-preview")).findAllByText("Japan at Christmas")).length).toBeGreaterThan(0);
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

async function toCover(name = "Kyoto") {
  await userEvent.type(nameInput(), name);
  await clickContinue();
  await heading("When are you going?");
  await userEvent.click(screen.getByRole("radio", { name: "Not sure yet" }));
  await clickContinue();
  await heading("Leaving from?");
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
  await heading("Got a photo for it?");
}

describe("NewTripFlow — create (NEW_TRIP.md §9)", () => {
  it("skipping steps 2–4 still creates a trip with just a name", async () => {
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(createTrip).toHaveBeenCalledWith({ name: "Kyoto", homeCurrency: "AUD" }, null));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips/kyoto"));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("past mode requires the dates", async () => {
    flow({ past: true });
    await userEvent.type(nameInput(), "Bali 2024");
    await clickContinue();
    await heading("When did you go?");
    await clickContinue();
    expect(await screen.findByRole("alert")).toHaveTextContent("Add the dates you went");
    expect(screen.getByRole("heading", { level: 2, name: "When did you go?" })).toBeInTheDocument();
  });

  it("past mode: dates and a stop, then the Globe", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t9", href: "/globe?added=t9" });
    findPlaces.mockResolvedValue({ status: "ok", candidates: [{ name: "Kyoto, Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, city: "Kyoto", country: "Japan", countryCode: "jp" }] });
    flow({ past: true });
    await userEvent.type(nameInput(), "Kansai");
    await clickContinue();
    await heading("When did you go?");
    await userEvent.click(screen.getByRole("button", { name: "Sat 1 Aug 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Mon 10 Aug 2026" }));
    await clickContinue();
    await heading("Where did you stop?");
    await userEvent.type(screen.getByRole("combobox", { name: "Add a place" }), "Kyo");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await clickContinue();
    await heading("Got a photo for it?");
    await userEvent.click(screen.getByRole("button", { name: /Add trip/ }));
    await waitFor(() =>
      expect(createTrip).toHaveBeenCalledWith(
        { name: "Kansai", homeCurrency: "AUD", startDate: "2026-08-01", endDate: "2026-08-10", stops: [{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }] },
        null,
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/globe?added=t9"));
  });

  it("the currency follows the home place", async () => {
    findPlaces.mockResolvedValue({ status: "ok", candidates: [{ name: "Portland, Multnomah County, Oregon, United States", lat: 45.52, lng: -122.68, city: "Portland", country: "United States", countryCode: "us" }] });
    flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    await clickContinue();
    await heading("Leaving from?");
    await userEvent.type(screen.getByRole("combobox", { name: "Leaving from" }), "Portl");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText(/Picked from Portland\./)).toBeInTheDocument();
    await clickContinue();
    await heading("Got a photo for it?");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() =>
      expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ homeName: "Portland", homeCurrency: "USD", homeLat: 45.52, homeLng: -122.68, homeCountryCode: "us" }), null),
    );
  });

  it("Edit from the review goes back to that step, and the review is kept", async () => {
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: "Edit When" }));
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    await userEvent.click(await screen.findByRole("button", { name: "April 2027" }));
    await clickContinue();
    await heading("Leaving from?");
    await clickContinue();
    await heading("Got a photo for it?");
    const review = screen.getByRole("region", { name: "Your trip" });
    expect(within(review).getByText("Sometime in April")).toBeInTheDocument();
    expect(within(review).getByText("Kyoto")).toBeInTheDocument();
  });

  it("a server error on the name jumps back to step 1 and shows it there", async () => {
    createTrip.mockResolvedValue({ success: false, errors: { name: ["Trip name must be 120 characters or fewer"] } });
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    expect(await heading("Where to?")).toBeInTheDocument();
    expect(nameInput()).toHaveAccessibleDescription("Trip name must be 120 characters or fewer");
    expect(push).not.toHaveBeenCalled();
  });

  it("a first trip toasts once it's created", async () => {
    flow({ firstTrip: true });
    await toCover("Japan at Christmas");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Japan at Christmas is ready.", description: "Add your first stop to start the route." }));
  });

  it("a chosen cover is previewed and sent", async () => {
    URL.createObjectURL = vi.fn(() => "blob:cover");
    URL.revokeObjectURL = vi.fn();
    flow();
    await toCover();
    const f = new File(["x"], "c.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Cover photo"), f);
    expect(screen.getByRole("img", { name: "Cover photo preview" })).toHaveAttribute("src", "blob:cover");
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(createTrip.mock.calls[0][1]).toBe(f));
  });

  // Resolve the pending create before the test ends: a transition left pending
  // across tests hangs this vitest/jsdom/React 19 setup (see first-trip-card history).
  it("while creating, the pills and inputs are disabled", async () => {
    let resolve!: (v: unknown) => void;
    createTrip.mockImplementation(() => new Promise((r) => { resolve = r; }));
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Step 1: Name, done. Go back" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Edit Name" })).toBeDisabled();
    resolve({ success: false, errors: { _: ["Try again"] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  });
});

describe("NewTripFlow — motion hooks (MOTION N1–N4)", () => {
  it("the bar drops in, the question rises, the preview card drops in", async () => {
    const { container } = flow();
    await heading("Where to?");
    expect(container.querySelector("header")?.className).toMatch(/\btp-bar-drop\b/);
    expect(container.querySelector("main > .tp-rise-in")).not.toBeNull();
    expect(screen.getByTestId("trip-preview").className).toMatch(/\btp-drop-in\b/);
  });

  it("forward and back set the slide direction", async () => {
    const { container } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    expect(container.querySelector("[data-step='2']")).toHaveAttribute("data-direction", "forward");
    await userEvent.click(screen.getByRole("button", { name: "Step 1: Name, done. Go back" }));
    await heading("Where to?");
    expect(container.querySelector("[data-step='1']")).toHaveAttribute("data-direction", "back");
  });

  it("a done pill's check pops; the phone bar fills by scale", async () => {
    const { container } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    const doneDot = within(screen.getByRole("button", { name: "Step 1: Name, done. Go back" })).getByText((_, el) => el?.hasAttribute("data-step-dot") ?? false);
    expect(doneDot.className).toMatch(/\btp-pop\b/);
    const fill = container.querySelector("[data-segment='done'] [data-segment-fill]") as HTMLElement;
    expect(fill.style.transform).toBe("scaleX(1)");
    expect((container.querySelector("[data-segment='upcoming'] [data-segment-fill]") as HTMLElement).style.transform).toBe("scaleX(0)");
  });

  it("after the slide, a step with no autofocus gets its heading focused and announced", async () => {
    flow();
    await toCover();
    expect(screen.getByRole("heading", { level: 2, name: "Got a photo for it?" })).toHaveFocus();
    expect(screen.getByText("Step 4 of 4, Cover")).toBeInTheDocument();
  });

  it("a double Continue steps once: the leaving step is inert and pushes no second entry", async () => {
    const { container } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    const before = window.history.length;
    const cont = screen.getByRole("button", { name: /^Continue/ });
    await userEvent.click(cont);
    expect(container.querySelector("[data-step='1'] [inert]")).not.toBeNull();
    await userEvent.click(cont);
    await heading("When are you going?");
    expect(window.history.length).toBe(before + 1);
    expect(stepParam()).toBe("2");
  });
});

describe("NewTripFlow — create motion (MOTION N13, spec C5)", () => {
  it("marks trip home for the countdown drop-in, then navigates", async () => {
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips/kyoto"));
    expect(sessionStorage.getItem("teepee:trip-arrival")).toBe("t1");
  });
  it("on desktop the preview card pops and lifts before the navigation", async () => {
    setMatchMedia((q) => q === "(min-width: 640px)" || q === "(min-width: 768px)");
    try {
      flow();
      await toCover();
      await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
      const lift = screen.getByTestId("trip-preview").parentElement!;
      await waitFor(() => expect(lift).toHaveAttribute("data-lifted"));
      expect(lift.className).toMatch(/\bgroup\/lift\b/);
      expect(screen.getByTestId("trip-preview").querySelector("article")!.className).toMatch(/md:group-data-\[lifted\]\/lift:shadow-hard-5/);
      await waitFor(() => expect(push).toHaveBeenCalledWith("/trips/kyoto"));
      expect(lift.style.transform).toMatch(/scale\(1\.04\)/);
    } finally {
      setMatchMedia((q) => q === "(min-width: 640px)");
    }
  });
  it("a past trip bound for the Globe is not marked", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t9", href: "/globe?added=t9" });
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/globe?added=t9"));
    expect(sessionStorage.getItem("teepee:trip-arrival")).toBeNull();
  });
  it("a landing other than trip home (e.g. /plan) is not marked either", async () => {
    createTrip.mockResolvedValue({ success: true, tripId: "t1", href: "/trips/kyoto/plan" });
    flow();
    await toCover();
    await userEvent.click(screen.getByRole("button", { name: /Create trip/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/trips/kyoto/plan"));
    expect(sessionStorage.getItem("teepee:trip-arrival")).toBeNull();
  });
  it("the first date set presses the stamp once per draft (MOTION N6)", async () => {
    const { container } = flow();
    await userEvent.type(nameInput(), "Kyoto");
    await clickContinue();
    await heading("When are you going?");
    const preview = () => container.querySelector("[data-testid='trip-preview']")!;
    expect(preview().querySelector(".tp-stamp-thunk")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Thu 15 Oct 2026" }));
    const pressed = preview().querySelector(".tp-stamp-thunk");
    expect(pressed).not.toBeNull();
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).stamped).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Tue 20 Oct 2026" }));
    expect(preview().querySelector(".tp-stamp-thunk")).toBe(pressed);
  });
  it("a restored draft that was already stamped does not press again", async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ past: false, step: 2, name: "Kyoto", dateMode: "exact", homeCurrency: "AUD", stops: [], stamped: true }));
    window.history.replaceState(null, "", "/trips/new?step=2");
    const { container } = flow();
    await heading("When are you going?");
    await userEvent.click(screen.getByRole("button", { name: "Thu 15 Oct 2026" }));
    expect(container.querySelector("[data-testid='trip-preview'] .tp-stamp-thunk")).toBeNull();
  });
  it("the stamp follows the name after a 250ms pause (MOTION N5)", async () => {
    flow();
    await heading("Where to?");
    const stamp = () => screen.getByTestId("trip-preview").querySelector("[data-stamp-pop]")!.textContent;
    await userEvent.type(nameInput(), "Kyoto");
    expect(stamp()).toContain("TRIP");
    await waitFor(() => expect(stamp()).toContain("Kyoto"));
  });
});
