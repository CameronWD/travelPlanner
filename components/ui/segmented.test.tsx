import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Segmented, SegmentedItem } from "./segmented";

describe("Segmented", () => {
  // Ruling 13 (phase 3): the pill items are 32px tall; on touch every item gets
  // an invisible 44px hit area (vertical expansion only — neighbours sit 4px
  // apart), with no change to the drawn size.
  it("gives every item a ≥44px touch hit area on coarse pointers, without changing its size", () => {
    render(
      <Segmented type="single" aria-label="View">
        <SegmentedItem value="list">List</SegmentedItem>
        <SegmentedItem value="map">Map</SegmentedItem>
      </Segmented>,
    );
    for (const name of ["List", "Map"]) {
      const item = screen.getByRole("radio", { name });
      expect(item.className).toMatch(/\brelative\b/);
      expect(item.className).toMatch(/pointer-coarse:after:absolute/);
      expect(item.className).toMatch(/pointer-coarse:after:-inset-y-1\.5/);
      expect(item.className).toMatch(/pointer-coarse:after:inset-x-0/);
      expect(item.className).toMatch(/pointer-coarse:after:content-\[''\]/);
      expect(item.className).toMatch(/\bh-8\b/);
    }
  });

  it("does not clip the expanded hit area at the root", () => {
    render(
      <Segmented type="single" aria-label="View">
        <SegmentedItem value="list">List</SegmentedItem>
      </Segmented>,
    );
    expect(screen.getByRole("radiogroup", { name: "View" }).className).not.toMatch(/overflow-(hidden|clip)/);
  });
});
