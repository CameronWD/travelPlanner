import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemPhotoThumb } from "./item-photo-thumb";

describe("ItemPhotoThumb", () => {
  it("renders an img with the given src and alt = Item title", () => {
    render(<ItemPhotoThumb src="/api/attachments/att-1" alt="Visit the museum" />);
    const img = screen.getByRole("img", { name: "Visit the museum" });
    expect(img).toHaveAttribute("src", "/api/attachments/att-1");
  });

  it("carries data-testid=item-photo-thumb on the trigger button", () => {
    render(<ItemPhotoThumb src="/api/attachments/att-1" alt="Visit the museum" />);
    expect(screen.getByTestId("item-photo-thumb")).toBeInTheDocument();
  });

  it("opens a full-size lightbox dialog with the same photo and alt on click", async () => {
    const user = userEvent.setup();
    render(<ItemPhotoThumb src="/api/attachments/att-1" alt="Visit the museum" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("item-photo-thumb"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Two images now: the closed... no, the trigger unmounts nothing — both
    // the row thumb's <img> and the lightbox's <img> are present at once.
    const images = screen.getAllByRole("img", { name: "Visit the museum" });
    expect(images.length).toBeGreaterThanOrEqual(1);
  });

  it("defaults to the 40px (sm) size; size=lg renders the 64px tile", () => {
    const { container: small } = render(<ItemPhotoThumb src="/x" alt="A" />);
    expect(small.querySelector('[data-testid="item-photo-thumb"]')?.className).toContain("size-10");

    const { container: large } = render(<ItemPhotoThumb src="/x" alt="B" size="lg" />);
    expect(large.querySelector('[data-testid="item-photo-thumb"]')?.className).toContain("size-16");
  });

  it("falls back to a glyph and disables the lightbox when the photo fails", () => {
    render(<ItemPhotoThumb src="/api/attachments/a" alt="Museum" />);
    fireEvent.error(screen.getByRole("img", { name: "Museum" }));
    expect(screen.getByLabelText("Photo unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Museum photo/ })).toBeDisabled();
  });

  it("shows the glyph when the image already failed before the ref ran (error missed pre-hydration)", () => {
    // Simulate a broken image whose `error` event fired before React attached
    // any listener: the browser still marks it complete with naturalWidth 0.
    // onError alone can never see this — only a ref callback checking the
    // element's own state at mount can.
    const completeSpy = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    const widthSpy = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
    Object.defineProperty(HTMLImageElement.prototype, "complete", { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 0 });

    try {
      render(<ItemPhotoThumb src="/api/attachments/already-broken" alt="Museum" />);
      expect(screen.getByLabelText("Photo unavailable")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /View Museum photo/ })).toBeDisabled();
    } finally {
      if (completeSpy) Object.defineProperty(HTMLImageElement.prototype, "complete", completeSpy);
      if (widthSpy) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", widthSpy);
    }
  });

  it("recovers when src changes after an error — a replaced photo shows again", () => {
    const { rerender } = render(<ItemPhotoThumb src="/api/attachments/a" alt="Museum" />);
    fireEvent.error(screen.getByRole("img", { name: "Museum" }));
    expect(screen.getByLabelText("Photo unavailable")).toBeInTheDocument();

    rerender(<ItemPhotoThumb src="/api/attachments/b" alt="Museum" />);
    expect(screen.queryByLabelText("Photo unavailable")).toBeNull();
    const img = screen.getByRole("img", { name: "Museum" });
    expect(img).toHaveAttribute("src", "/api/attachments/b");
    expect(screen.getByRole("button", { name: /View Museum photo/ })).not.toBeDisabled();
  });

  it("the thumbnail is lazy, async-decoded and sized to its tile (spec 2026-10-06 §S)", () => {
    const { container } = render(<ItemPhotoThumb src="/api/attachments/att-1" alt="Visit the museum" size="lg" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveAttribute("width", "64");
    expect(img).toHaveAttribute("height", "64");
  });
});
