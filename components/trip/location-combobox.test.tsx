import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { LocationCombobox } from "./location-combobox";

const HAKONE = { placeId: "ChIJHakone", mainText: "Hakone", secondaryText: "Kanagawa, Japan", lat: 35.23, lng: 139.1, countryCode: "jp", country: "Japan" };

function renderCombo(onChange = vi.fn()) {
  render(<LocationCombobox label="To" value={{ kind: "none" }} onChange={onChange} stops={[{ id: "s1", name: "Tokyo" }]} homeBaseName="Sydney" />);
  return onChange;
}

describe("LocationCombobox", () => {
  beforeEach(() => {
    mock.reset();
    mock.places.predictions = [HAKONE];
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lists existing stops and selects one", async () => {
    const onChange = renderCombo();
    await userEvent.click(screen.getByRole("button", { name: /^To/ }));
    await userEvent.click(await screen.findByText("Tokyo"));
    expect(onChange).toHaveBeenCalledWith({ kind: "stop", stopId: "s1", name: "Tokyo" });
  });

  it("a Google pick selects a place with its ID and coordinates", async () => {
    const onChange = renderCombo();
    await userEvent.click(screen.getByRole("button", { name: /^To/ }));
    await userEvent.type(screen.getByRole("textbox"), "Hakone");
    await userEvent.click(await screen.findByRole("button", { name: /Kanagawa/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: "place", name: "Hakone", placeId: "ChIJHakone", lat: 35.23, lng: 139.1 });
  });

  it("the typed text can be used as a place with no pick", async () => {
    const onChange = renderCombo();
    await userEvent.click(screen.getByRole("button", { name: /^To/ }));
    await userEvent.type(screen.getByRole("textbox"), "Hakone");
    await userEvent.click(screen.getByRole("button", { name: /Use .Hakone. as a place/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: "place", name: "Hakone" });
  });

  it("keyless, Stops, Home and typed text remain and a hint explains the lookup", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    const onChange = renderCombo();
    await userEvent.click(screen.getByRole("button", { name: /^To/ }));
    expect(screen.getByText("Suggestions aren't available. The place is looked up when you save.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Sydney/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: "home" });
  });
});
