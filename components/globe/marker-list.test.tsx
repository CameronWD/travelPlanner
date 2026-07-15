import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

// Prevent the next-auth crash: AttachmentPopover → AttachmentList → server actions
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

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

// Default no-op props for tests that don't care about the new callbacks
const noop = vi.fn();
const defaultListProps = { selectedId: null as string | null, onSelect: noop, onEdit: noop, onDelete: noop };

// ---------------------------------------------------------------------------
// MarkerList
// ---------------------------------------------------------------------------

describe("MarkerList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders country group headers and one row per marker", () => {
    render(<MarkerList markers={markers} {...defaultListProps} />);

    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByText("Eiffel Tower")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.getByText("Fushimi Inari")).toBeInTheDocument();
  });

  it("clicking a row calls onSelect with the marker id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MarkerList markers={markers} {...defaultListProps} onSelect={onSelect} />);

    await user.click(screen.getByText("Louvre"));
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("shows the empty state when markers is empty", () => {
    render(<MarkerList markers={[]} {...defaultListProps} />);
    expect(screen.getByText(/no markers yet/i)).toBeInTheDocument();
  });

  it("selects on row click, and edit/delete are separate buttons", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(), onEdit = vi.fn(), onDelete = vi.fn();
    const singleMarker = [mkMarker({ id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING" })];
    render(
      <MarkerList
        markers={singleMarker as never}
        selectedId={null}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    // Row click → select, NOT edit
    const rowButton = screen.getByTestId("marker-row-m1");
    await user.click(rowButton);
    expect(onSelect).toHaveBeenCalledWith("m1");
    expect(onEdit).not.toHaveBeenCalled();

    // Edit button → onEdit
    await user.click(screen.getByRole("button", { name: /edit tokyo tower/i }));
    expect(onEdit).toHaveBeenCalledWith("m1");
  });

  it("clicking the Delete button calls onDelete with the marker id", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const singleMarker = [mkMarker({ id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING" })];
    render(
      <MarkerList
        markers={singleMarker}
        selectedId={null}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete tokyo tower/i }));
    expect(onDelete).toHaveBeenCalledWith("m1");
  });

  it("applies aria-current to the selected row", () => {
    const singleMarker = [mkMarker({ id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING" })];
    render(
      <MarkerList
        markers={singleMarker as never}
        selectedId="m1"
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const rowButton = screen.getByTestId("marker-row-m1");
    expect(rowButton).toHaveAttribute("aria-current", "true");
  });

  it("renders a paperclip badge with the attachment count when globeId and attachmentsByMarkerId are provided", () => {
    const singleMarker = [mkMarker({ id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING" })];
    const attachment = {
      id: "att-1",
      filename: "photo.jpg",
      mime: "image/jpeg",
      size: 1024,
      url: "https://example.com/photo.jpg",
      uploadedById: "user-1",
      createdAt: new Date(),
    };
    render(
      <MarkerList
        markers={singleMarker}
        selectedId={null}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        globeId="globe-1"
        attachmentsByMarkerId={{ "m1": [attachment] }}
      />,
    );

    // The AttachmentPopover button should show count "1" and be labelled "Attachments (1)"
    const attachBtn = screen.getByRole("button", { name: /attachments \(1\)/i });
    expect(attachBtn).toBeInTheDocument();
    expect(attachBtn).toHaveTextContent("1");
  });
});

// ---------------------------------------------------------------------------
// MarkerFilters
// ---------------------------------------------------------------------------

describe("MarkerFilters", () => {
  const defaultFilter = { category: null, country: null, query: "" };
  const countries = ["France", "Japan"];

  beforeEach(() => vi.clearAllMocks());

  it("clicking a category chip calls onChange with the new category", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    await user.click(screen.getByRole("button", { name: /food/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: "FOOD" }),
    );
  });

  it("clicking the All chip calls onChange with category null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={{ ...defaultFilter, category: "FOOD" }} countries={countries} onChange={onChange} />,
    );

    await user.click(screen.getByRole("button", { name: /^all$/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: null }),
    );
  });

  it("typing in the query input calls onChange with the query string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MarkerFilters filter={defaultFilter} countries={countries} onChange={onChange} />,
    );

    const queryInput = screen.getByPlaceholderText(/search places/i);
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

    const countrySelect = screen.getByRole("combobox");
    await user.selectOptions(countrySelect, "Japan");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ country: "Japan" }),
    );
  });
});
