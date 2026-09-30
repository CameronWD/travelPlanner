import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { findPlaces } = vi.hoisted(() => ({ findPlaces: vi.fn() }));
vi.mock("@/server/actions/places", () => ({ findPlaces: (q: string) => findPlaces(q) }));

import { PlaceCombobox, type PickedPlace } from "./place-combobox";

const SYD_AU = { name: "Sydney, Council of the City of Sydney, New South Wales, 2000, Australia", lat: -33.87, lng: 151.21, city: "Sydney", country: "Australia", countryCode: "au" };
const SYD_CA = { name: "Sydney, Cape Breton Regional Municipality, Nova Scotia, B1P 1A1, Canada", lat: 46.14, lng: -60.19, city: "Sydney", country: "Canada", countryCode: "ca" };

const submitted = vi.fn();
const outerKey = vi.fn();

function Harness({ onPick = vi.fn(), rankNear }: { onPick?: (p: PickedPlace) => void; rankNear?: { lat: number; lng: number } }) {
  const [v, setV] = React.useState("");
  return (
    <div onKeyDown={(e) => outerKey(e.key)}>
      <form onSubmit={(e) => { e.preventDefault(); submitted(); }}>
        <PlaceCombobox value={v} onValueChange={setV} onPick={onPick} rankNear={rankNear} aria-label="Leaving from" />
      </form>
    </div>
  );
}

const input = () => screen.getByRole("combobox", { name: "Leaving from" });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("PlaceCombobox", () => {
  beforeEach(() => {
    findPlaces.mockReset().mockResolvedValue({ status: "ok", candidates: [SYD_AU, SYD_CA] });
    submitted.mockReset();
    outerKey.mockReset();
  });

  it("searches after a pause and lists name and region", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    expect(await screen.findByRole("option", { name: /Sydney.*New South Wales, Australia/ })).toBeInTheDocument();
    expect(findPlaces).toHaveBeenCalledTimes(1);
    expect(findPlaces).toHaveBeenCalledWith("Syd");
    expect(input()).toHaveAttribute("aria-expanded", "true");
  });

  it("does not search under two characters", async () => {
    render(<Harness />);
    await userEvent.type(input(), "S");
    await pause(500);
    expect(findPlaces).not.toHaveBeenCalled();
  });

  it("highlights the first result and follows the arrow keys", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    expect(input()).toHaveAttribute("aria-activedescendant", options[0].id);
    await userEvent.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter picks the highlighted result and does not submit the form", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith({ name: "Sydney", region: "New South Wales, Australia", lat: -33.87, lng: 151.21, countryCode: "au" });
    expect(submitted).not.toHaveBeenCalled();
    expect(input()).toHaveValue("Sydney");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a picked value is not searched again", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await pause(500);
    expect(findPlaces).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the list without bubbling", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(outerKey).not.toHaveBeenCalledWith("Escape");
  });

  it("a search failure falls back to what was typed", async () => {
    findPlaces.mockResolvedValue({ status: "error" });
    render(<Harness />);
    await userEvent.type(input(), "Sydney");
    expect(await screen.findByText(/isn't available right now/)).toBeInTheDocument();
    expect(input()).toHaveValue("Sydney");
  });

  it("rankNear puts the nearest result first", async () => {
    render(<Harness rankNear={{ lat: 45, lng: -63 }} />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Nova Scotia");
  });

  it("uses tokens only", async () => {
    const { container } = render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
