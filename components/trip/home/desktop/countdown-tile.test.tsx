import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/cover", () => ({
  setTripCover: vi.fn(),
  removeTripCover: vi.fn(),
  setCoverFocal: vi.fn(),
}));

const { CountdownTile } = await import("@/components/trip/home/desktop/countdown-tile");

type Props = Parameters<typeof CountdownTile>[0];

function renderTile(overrides: Partial<Props> = {}) {
  return render(
    <CountdownTile
      href="/trips/trip-1/plan"
      status="PLANNING"
      countdown={{ kind: "sleeps", n: 68, unit: "sleeps" }}
      firstLeg="Fri 4 Dec · Sydney → Denpasar, Bali"
      cover={null}
      tripId="trip-1"
      {...overrides}
    />,
  );
}

const COVER = { url: "/api/trips/trip-1/cover?v=k1", aspect: 0.75 };

describe("CountdownTile", () => {
  it("has a hidden Countdown h2 and reads the number as '68 sleeps to go'", () => {
    renderTile();
    const h2 = screen.getByRole("heading", { level: 2, name: "Countdown" });
    expect(h2).toHaveClass("sr-only");
    expect(screen.getByLabelText("68 sleeps to go")).toHaveTextContent("68");
    expect(screen.getByText("PLANNING")).toBeInTheDocument();
    expect(screen.getByText("Fri 4 Dec · Sydney → Denpasar, Bali")).toBeInTheDocument();
  });

  it("links the whole tile to the Plan", () => {
    renderTile();
    const link = screen.getByRole("link", { name: /68 sleeps to go/ });
    expect(link).toHaveAttribute("href", "/trips/trip-1/plan");
  });

  it("uses 'sleep' for one", () => {
    renderTile({ countdown: { kind: "sleeps", n: 1, unit: "sleep" } });
    expect(screen.getByLabelText("1 sleep to go")).toBeInTheDocument();
  });

  it("shows the polaroid photo at 176px, rotated, with a Change button, when there's a cover", () => {
    renderTile({ cover: COVER });
    const img = screen.getByRole("img", { name: "Trip cover" });
    expect(img).toHaveAttribute("sizes", "176px");
    expect(img.className).toContain("object-cover");
    const polaroid = img.closest("[data-polaroid]") as HTMLElement;
    expect(polaroid.className).toContain("rotate-[4deg]");
    expect(polaroid.className).toContain("w-[176px]");
    expect(within(polaroid).getByRole("button", { name: /Change/ })).toBeInTheDocument();
    expect(screen.queryByText("+ Add a photo")).toBeNull();
  });

  it("offers a dashed '+ Add a photo' pill instead of a placeholder with no cover", () => {
    renderTile();
    const add = screen.getByRole("button", { name: "+ Add a photo" });
    expect(add.className).toContain("border-dashed");
    expect(add.className).toContain("whitespace-nowrap");
    expect(screen.queryByRole("img", { name: "Trip cover" })).toBeNull();
  });

  it("opens the existing cover uploader from '+ Add a photo'", async () => {
    const user = userEvent.setup();
    renderTile();
    await user.click(screen.getByRole("button", { name: "+ Add a photo" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cover photo")).toBeInTheDocument();
  });

  it("shows 'Pick your dates' for a date-less trip", () => {
    renderTile({ countdown: { kind: "no-dates" }, firstLeg: null });
    expect(screen.getByText("Pick your dates")).toBeInTheDocument();
    expect(screen.queryByText(/sleeps/)).toBeNull();
  });

  it("shows 'Today' on the day", () => {
    renderTile({ countdown: { kind: "today" } });
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows the day of the trip while travelling", () => {
    renderTile({ status: "TRAVELLING", countdown: { kind: "day", n: 5, of: 36 } });
    expect(screen.getByLabelText("Day 5 of 36")).toHaveTextContent("5");
    expect(screen.getByText("TRAVELLING")).toBeInTheDocument();
  });

  it("shows 'Back home' after the trip", () => {
    renderTile({ status: "HOME", countdown: { kind: "home" } });
    expect(screen.getByText("Back home")).toBeInTheDocument();
  });
});
