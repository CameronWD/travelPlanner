import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GlobeSuggestionsStrip } from "./globe-suggestions-strip";
import type { MarkerView } from "@/components/globe/types";

vi.mock("@/server/actions/items", () => ({ addMarkerToWishlist: vi.fn(async () => ({ success: true })) }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

import { addMarkerToWishlist } from "@/server/actions/items";

function marker(id: string): MarkerView {
  return {
    id, title: id, category: "SIGHTSEEING", note: null, link: null, timing: null,
    lat: null, lng: null, city: null, country: "Japan", countryCode: "jp",
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GlobeSuggestionsStrip", () => {
  it("renders nothing when there are no suggestions", () => {
    const { container } = render(
      <GlobeSuggestionsStrip tripId="t1" suggestions={[]} addedMarkerIds={[]} onSeeMore={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows at most 5 suggestions and a '+N more' control for the overflow", () => {
    const suggestions = Array.from({ length: 7 }, (_, i) => marker(`m${i}`));
    const onSeeMore = vi.fn();
    render(
      <GlobeSuggestionsStrip tripId="t1" suggestions={suggestions} addedMarkerIds={[]} onSeeMore={onSeeMore} />,
    );
    // 5 add buttons visible
    expect(screen.getAllByRole("button", { name: /^add /i })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /2 more/i }));
    expect(onSeeMore).toHaveBeenCalled();
  });

  it("adds a suggestion via the action", async () => {
    render(
      <GlobeSuggestionsStrip tripId="t1" suggestions={[marker("m0")]} addedMarkerIds={[]} onSeeMore={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add m0/i }));
    await waitFor(() => expect(addMarkerToWishlist).toHaveBeenCalledWith("m0", "t1"));
  });
});
