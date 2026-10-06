import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/trips/cover-photo-image", () => ({
  CoverPhotoImage: (p: { url: string; alt: string; fit?: string; sizes: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="cover-photo" src={p.url} alt={p.alt} data-fit={p.fit ?? "cover"} data-sizes={p.sizes} />
  ),
}));

import { PortraitCoverFrame } from "./portrait-cover-frame";

describe("PortraitCoverFrame (spec 2026-10-05 §I)", () => {
  it("is a small portrait frame, phones only, showing the whole photo", () => {
    render(<PortraitCoverFrame url="/api/trips/t/cover?v=k" name="Christmas in Europe" />);
    const frame = screen.getByTestId("portrait-cover");
    expect(frame.className.split(/\s+/)).toEqual(expect.arrayContaining(["shrink-0", "sm:hidden"]));
    const card = frame.firstElementChild as HTMLElement;
    expect(card.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-32", "w-24"]));
    const img = screen.getByRole("img", { name: "Christmas in Europe cover photo" });
    expect(img).toHaveAttribute("src", "/api/trips/t/cover?v=k");
    expect(img).toHaveAttribute("data-fit", "contain");
    expect(img).toHaveAttribute("data-sizes", "96px");
  });

  it("does nothing on tap, as the band never did", () => {
    render(<PortraitCoverFrame url="/c" name="T" />);
    const frame = screen.getByTestId("portrait-cover");
    expect(frame.querySelector("a, button")).toBeNull();
    expect(frame.closest("a, button")).toBeNull();
  });
});
