import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/actions/transport", () => ({
  searchPlacesAction: vi.fn(),
}));

import { searchPlacesAction } from "@/server/actions/transport";
import { LocationCombobox } from "./location-combobox";

describe("LocationCombobox", () => {
  it("lists existing stops and selects one", async () => {
    const onChange = vi.fn();
    render(
      <LocationCombobox
        label="From"
        value={{ kind: "none" }}
        onChange={onChange}
        stops={[{ id: "s1", name: "Tokyo" }]}
        tripId="t1"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /From/i }));
    await userEvent.click(await screen.findByText("Tokyo"));
    expect(onChange).toHaveBeenCalledWith({ kind: "stop", stopId: "s1", name: "Tokyo" });
  });

  it("searches places and selects a candidate", async () => {
    vi.mocked(searchPlacesAction).mockResolvedValue({
      status: "ok",
      candidates: [
        {
          name: "Hakone, Japan",
          lat: 1,
          lng: 2,
          city: "Hakone",
          country: "Japan",
          countryCode: "jp",
        },
      ],
    });
    const onChange = vi.fn();
    render(
      <LocationCombobox
        label="To"
        value={{ kind: "none" }}
        onChange={onChange}
        stops={[]}
        tripId="t1"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /To/i }));
    await userEvent.type(screen.getByRole("textbox"), "Hakone");
    await userEvent.click(screen.getByRole("button", { name: /Search/i }));
    await userEvent.click(await screen.findByText("Hakone, Japan"));
    expect(onChange).toHaveBeenCalledWith({ kind: "place", name: "Hakone, Japan" });
  });
});
