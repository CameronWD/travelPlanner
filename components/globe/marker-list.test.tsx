import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { MarkerList } from "./marker-list";
import { MarkerFilters } from "./marker-filters";
import type { MarkerView } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mkMarker = (overrides: Partial<MarkerView> & { id: string; title: string }): MarkerView => ({
  category: "SIGHTSEEING",
  note: null,
  link: null,
  timing: null,
  lat: null,
  lng: null,
  city: null,
  country: null,
  countryCode: null,
  ...overrides,
});

const markers: MarkerView[] = [
  mkMarker({ id: "1", title: "Eiffel Tower", city: "Paris", country: "France", category: "SIGHTSEEING" }),
  mkMarker({ id: "2", title: "Louvre", city: "Paris", country: "France", category: "ACTIVITY" }),
  mkMarker({ id: "3", title: "Fushimi Inari", city: "Kyoto", country: "Japan", category: "SIGHTSEEING" }),
];

// ---------------------------------------------------------------------------
// MarkerList
// ---------------------------------------------------------------------------

describe("MarkerList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders country group headers and one row per marker", () => {
    render(<MarkerList markers={markers} onSelect={vi.fn()} />);

    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.getByText("Fushimi Inari")).toBeInTheDocument();
  });

  it("clicking a row calls onSelect with the marker id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MarkerList markers={markers} onSelect={onSelect} />);

    await user.click(screen.getByText("Louvre"));
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("shows the empty state when markers is empty", () => {
    render(<MarkerList markers={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no markers yet/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MarkerFilters
// ---------------------------------------------------------------------------

describe("MarkerFilters", () => {
  const defaultFilter = { category: null, country: null, query: "" };
  const countries = ["France", "Japan"];

  beforeEach(() => vi.clearAllMocks());

  it("changing the category select calls onChange with the new category", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    const selects = screen.getAllByRole("combobox");
    const categorySelect = selects[0];
    await user.selectOptions(categorySelect, "ACTIVITY");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: "ACTIVITY" }),
    );
  });

  it("typing in the query input calls onChange with the query string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    const queryInput = screen.getByPlaceholderText(/search markers/i);
    await user.type(queryInput, "e");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ query: "e" }),
    );
  });

  it("changing the country select calls onChange with the new country", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    const selects = screen.getAllByRole("combobox");
    const countrySelect = selects[1];
    await user.selectOptions(countrySelect, "Japan");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ country: "Japan" }),
    );
  });
});
