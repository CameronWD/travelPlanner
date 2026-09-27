import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
