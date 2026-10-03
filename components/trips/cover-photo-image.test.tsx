import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CoverPhotoImage } from "./cover-photo-image";

vi.mock("next/image", () => ({
  default: ({ src, alt, className, onLoad, onError, style, ...rest }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={String(alt)}
      src={String(src)}
      className={typeof className === "string" ? className : undefined}
      style={style as React.CSSProperties}
      onLoad={onLoad as () => void}
      onError={onError as () => void}
      data-testid={rest["data-testid"] as string | undefined}
    />
  ),
}));

describe("CoverPhotoImage", () => {
  it("starts invisible, shows on load, and unmounts on error", () => {
    const { container } = render(
      <CoverPhotoImage url="/api/trips/t/cover?v=1" alt="x" focalX={null} focalY={null} sizes="100px" />,
    );
    const img = container.querySelector("img")!;
    expect(img.className).toMatch(/opacity-0/);

    fireEvent.load(img);
    expect(img.className).toMatch(/opacity-100/);

    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
  });
});
