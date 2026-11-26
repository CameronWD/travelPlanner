import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlobeSuggestionsStrip } from "./globe-suggestions-strip";
import type { MarkerView } from "@/components/globe/types";

function marker(id: string): MarkerView {
  return {
    id, title: id, category: "SIGHTSEEING", note: null, link: null, timing: null,
    lat: null, lng: null, city: null, country: "Japan", countryCode: "jp",
  };
}

describe("GlobeSuggestionsStrip", () => {
  it("one line and a See them button", () => {
    const onSeeMore = vi.fn();
    const { rerender } = render(
      <GlobeSuggestionsStrip suggestions={["m0", "m1", "m2"].map(marker)} addedMarkerIds={[]} onSeeMore={onSeeMore} />,
    );
    expect(screen.getByText("3 places from your Globe are on this route")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "See them" }));
    expect(onSeeMore).toHaveBeenCalledTimes(1);

    rerender(<GlobeSuggestionsStrip suggestions={[marker("m0")]} addedMarkerIds={[]} onSeeMore={onSeeMore} />);
    expect(screen.getByText("1 place from your Globe is on this route")).toBeInTheDocument();

    rerender(
      <GlobeSuggestionsStrip suggestions={["m0", "m1", "m2"].map(marker)} addedMarkerIds={["m1"]} onSeeMore={onSeeMore} />,
    );
    expect(screen.getByText("2 places from your Globe are on this route")).toBeInTheDocument();
  });

  it("renders nothing when there are no suggestions", () => {
    const { container, rerender } = render(
      <GlobeSuggestionsStrip suggestions={[]} addedMarkerIds={[]} onSeeMore={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<GlobeSuggestionsStrip suggestions={[marker("m0")]} addedMarkerIds={["m0"]} onSeeMore={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
