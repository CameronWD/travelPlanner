import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { Field } from "@/components/ui/field";
import { resetMapsAuthForTests } from "@/components/map/maps-auth";
import type { PlaceKind } from "@/components/places/use-place-suggestions";
import { PlaceCombobox, type PickedPlace } from "./place-combobox";

const SYD_AU = { placeId: "ChIJSydAu", mainText: "Sydney", secondaryText: "NSW, Australia", lat: -33.87, lng: 151.21, formattedAddress: "Sydney NSW, Australia", countryCode: "au", country: "Australia" };
const SYD_CA = { placeId: "ChIJSydCa", mainText: "Sydney", secondaryText: "NS, Canada", lat: 46.14, lng: -60.19, formattedAddress: "Sydney, NS, Canada", countryCode: "ca", country: "Canada" };
const HINT = "Suggestions aren't available. The place is looked up when you save.";

const submitted = vi.fn();
const outerKey = vi.fn();

function Harness({ onPick = vi.fn(), rankNear, kind }: { onPick?: (p: PickedPlace) => void; rankNear?: { lat: number; lng: number }; kind?: PlaceKind }) {
  const [v, setV] = React.useState("");
  return (
    <div onKeyDown={(e) => outerKey(e.key)}>
      <form onSubmit={(e) => { e.preventDefault(); submitted(); }}>
        <PlaceCombobox value={v} onValueChange={setV} onPick={onPick} rankNear={rankNear} kind={kind} aria-label="Leaving from" />
      </form>
      <button type="button">elsewhere</button>
    </div>
  );
}

const input = () => screen.getByRole("combobox", { name: "Leaving from" });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastRequest = () => mock.places.requests[mock.places.requests.length - 1];

describe("PlaceCombobox", () => {
  beforeEach(() => {
    mock.reset();
    mock.places.predictions = [SYD_AU, SYD_CA];
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
    resetMapsAuthForTests();
    delete window.gm_authFailure;
    submitted.mockReset();
    outerKey.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("is a plain input with the hint when there is no browser key", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    render(<Harness />);
    expect(screen.queryByRole("combobox")).toBeNull();
    const field = screen.getByRole("textbox", { name: "Leaving from" });
    expect(field).toHaveAccessibleDescription(HINT);
    await userEvent.type(field, "Sydney");
    await pause(400);
    expect(field).toHaveValue("Sydney");
    expect(mock.places.fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    expect(mock.providers).toHaveLength(0);
  });

  it("is a plain input with the hint after Google refuses the key", async () => {
    render(<Harness />);
    const el = input();
    await userEvent.type(el, "Syd");
    act(() => window.gm_authFailure?.());
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Leaving from" })).toBe(el);
    expect(el).toHaveFocus();
    expect(el).toHaveValue("Syd");
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("renders its own APIProvider with the browser key", () => {
    render(<Harness />);
    expect(mock.providers.at(-1)).toEqual({ apiKey: "k" });
  });

  it("asks for suggestions after 3 characters and 350 ms, not before", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "Sy" } });
    act(() => vi.advanceTimersByTime(1000));
    expect(mock.places.fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "Syd" } });
    act(() => vi.advanceTimersByTime(349));
    expect(mock.places.fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(mock.places.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(lastRequest().input).toBe("Syd");
  });

  it.each([
    [undefined, ["(regions)"]],
    ["area", ["(regions)"]],
    ["venue", undefined],
    ["any", undefined],
  ] as const)("area kind asks for (regions); venue and any kinds don't filter (%s)", async (kind, types) => {
    render(<Harness kind={kind} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    if (types) expect(lastRequest().includedPrimaryTypes).toEqual(types);
    else expect(lastRequest()).not.toHaveProperty("includedPrimaryTypes");
  });

  it("lists name and subtitle, and highlights the first", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("SydneyNSW, Australia");
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(input()).toHaveAttribute("aria-activedescendant", options[0].id);
    await userEvent.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("a pick fetches exactly the location mask and returns placeId, coordinates, address, country code and the prediction's main text as name", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(mock.places.fetchFields).toHaveBeenCalledTimes(1);
    expect(mock.places.fetchFields).toHaveBeenCalledWith({ fields: ["id", "location", "formattedAddress", "addressComponents"] });
    expect(onPick).toHaveBeenCalledWith({ name: "Sydney", subtitle: "NSW, Australia", lat: -33.87, lng: 151.21, country: "Australia", countryCode: "au", placeId: "ChIJSydAu", address: "Sydney NSW, Australia" });
    expect(submitted).not.toHaveBeenCalled();
    expect(input()).toHaveValue("Sydney");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clicking an option picks it", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    await userEvent.click(options[1]);
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ placeId: "ChIJSydCa" })));
  });

  it("a failed pick keeps the typed text and returns no place", async () => {
    mock.places.fetchFields.mockRejectedValueOnce(new Error("quota"));
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(mock.places.fetchFields).toHaveBeenCalled());
    await pause(0);
    expect(onPick).not.toHaveBeenCalled();
    expect(input()).toHaveValue("Syd");
  });

  it("typing while a pick loads drops the pick", async () => {
    let finish: () => void = () => {};
    mock.places.fetchFields.mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await userEvent.type(input(), "x");
    await act(async () => finish());
    expect(onPick).not.toHaveBeenCalled();
    expect(input()).toHaveValue("Sydx");
  });

  it("Enter while a pick loads neither submits the form nor picks twice", async () => {
    let finish: () => void = () => {};
    mock.places.fetchFields.mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(submitted).not.toHaveBeenCalled();
    expect(outerKey).not.toHaveBeenCalledWith("Enter");
    await act(async () => finish());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue("Sydney");
  });

  it("a rejected suggestions call degrades to a plain input with the hint", async () => {
    mock.places.fetchAutocompleteSuggestions.mockRejectedValue(new Error("OVER_QUERY_LIMIT"));
    render(<Harness />);
    const el = input();
    await userEvent.type(el, "Syd");
    expect(await screen.findByText(HINT)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(el).toHaveValue("Syd");
    await userEvent.type(el, "ney");
    await pause(400);
    expect(mock.places.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(el).toHaveValue("Sydney");
  });

  it("one session token per focus; a pick ends it", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.type(input(), "n");
    await waitFor(() => expect(mock.places.requests).toHaveLength(2));
    expect(mock.places.requests[1].sessionToken).toBe(mock.places.requests[0].sessionToken);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(input()).toHaveValue("Sydney"));

    await userEvent.type(input(), " Harbour");
    await waitFor(() => expect(mock.places.requests).toHaveLength(3));
    expect(mock.places.requests[2].sessionToken).not.toBe(mock.places.requests[1].sessionToken);

    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    await userEvent.type(input(), "s");
    await waitFor(() => expect(mock.places.requests).toHaveLength(4));
    expect(mock.places.requests[3].sessionToken).not.toBe(mock.places.requests[2].sessionToken);
    expect(mock.places.tokens).toHaveLength(3);
  });

  it("the list footer says Google Maps", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    const footer = screen.getByText("Google Maps");
    expect(screen.getByRole("listbox")).not.toContainElement(footer);
  });

  it("a picked value is not searched again", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(input()).toHaveValue("Sydney"));
    await pause(500);
    expect(mock.places.fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the list without bubbling", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(outerKey).not.toHaveBeenCalledWith("Escape");
  });

  it("says when nothing matched", async () => {
    mock.places.predictions = [];
    render(<Harness />);
    await userEvent.type(input(), "Zzzq");
    expect(await screen.findByText("No places found. Keep typing, or use it as written.")).toBeInTheDocument();
  });

  it("rankNear biases the suggestions", async () => {
    render(<Harness rankNear={{ lat: 45, lng: -63 }} />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    expect(lastRequest().locationBias).toEqual({ center: { lat: 45, lng: -63 }, radius: 50000 });
  });

  it("uses tokens only", async () => {
    const { container } = render(<Harness />);
    await userEvent.type(input(), "Syd");
    await screen.findAllByRole("option");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });

  it("the highlight is one shared element that follows the keys (MOTION N10)", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Syd");
    const options = await screen.findAllByRole("option");
    expect(document.querySelectorAll("[data-place-hl]")).toHaveLength(1);
    expect(options[0].querySelector("[data-place-hl]")).not.toBeNull();
    await userEvent.keyboard("{ArrowDown}");
    expect(options[1].querySelector("[data-place-hl]")).not.toBeNull();
    expect(document.querySelectorAll("[data-place-hl]")).toHaveLength(1);
  });

  it("does not search for the value it mounts with (an existing Stop's name)", async () => {
    function Seeded() {
      const [v, setV] = React.useState("Paris");
      return <PlaceCombobox value={v} onValueChange={setV} onPick={vi.fn()} aria-label="Leaving from" />;
    }
    render(<Seeded />);
    await pause(500);
    expect(mock.places.fetchAutocompleteSuggestions).not.toHaveBeenCalled();
  });

  it("wires id and aria-invalid from a surrounding Field", () => {
    render(
      <Field label="Place name" error="Stop name is required">
        <PlaceCombobox value="" onValueChange={vi.fn()} onPick={vi.fn()} aria-label="Place name" />
      </Field>,
    );
    expect(screen.getByRole("combobox", { name: "Place name" })).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the Field wiring as a plain input", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    render(
      <Field label="Place name" error="Stop name is required">
        <PlaceCombobox value="" onValueChange={vi.fn()} onPick={vi.fn()} aria-label="Place name" />
      </Field>,
    );
    const field = screen.getByRole("textbox", { name: "Place name" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(`Stop name is required ${HINT}`);
  });

  it("never gives up its height inside a bounded flex column (Add a stop sheet on phones, spec 2026-10-12 W6)", () => {
    render(<Harness />);
    const root = input().parentElement as HTMLElement;
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).toContain("shrink-0");
  });
});
