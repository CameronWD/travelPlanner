import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CoverPhotoImage } from "./cover-photo-image";

vi.mock("next/image", () => ({
  default: ({ src, alt, className, onLoad, onError, style, ref, loader, ...rest }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref as React.Ref<HTMLImageElement>}
      alt={String(alt)}
      src={String(src)}
      data-small-src={typeof loader === "function" ? (loader as (a: { src: string; width: number }) => string)({ src: String(src), width: 256 }) : undefined}
      className={typeof className === "string" ? className : undefined}
      style={style as React.CSSProperties}
      onLoad={onLoad as () => void}
      onError={onError as () => void}
      data-testid={rest["data-testid"] as string | undefined}
    />
  ),
}));

describe("CoverPhotoImage", () => {
  it("fit='contain' shows the whole photo — object-contain, no focal crop (spec 2026-10-05 §I)", () => {
    const { container } = render(
      <CoverPhotoImage url="/c" alt="x" focalX={0.2} focalY={0.8} sizes="96px" fit="contain" />,
    );
    const img = container.querySelector("img")!;
    expect(img.className).toMatch(/\bobject-contain\b/);
    expect(img.className).not.toMatch(/\bobject-cover\b/);
    expect(img.style.objectPosition).toBe("");
  });

  it("defaults to object-cover at the focal point", () => {
    const { container } = render(
      <CoverPhotoImage url="/c" alt="x" focalX={0.2} focalY={0.8} sizes="96px" />,
    );
    const img = container.querySelector("img")!;
    expect(img.className).toMatch(/\bobject-cover\b/);
    expect(img.style.objectPosition).toBe("20% 80%");
  });

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

  it("recovers when url changes after an error — a re-uploaded cover shows again", () => {
    const { container, rerender } = render(
      <CoverPhotoImage url="/bad" alt="x" focalX={null} focalY={null} sizes="100px" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();

    rerender(<CoverPhotoImage url="/good" alt="x" focalX={null} focalY={null} sizes="100px" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/good");
    expect(img!.className).toMatch(/opacity-0/);
  });

  it("its loader asks the cover route for the small copy at small widths (spec 2026-10-06 §H)", () => {
    const { container } = render(<CoverPhotoImage url="/api/trips/t/cover?v=1" alt="x" focalX={null} focalY={null} sizes="96px" />);
    expect(container.querySelector("img")).toHaveAttribute("data-small-src", "/api/trips/t/cover?v=1&w=480");
  });

  it("shows an already-cached photo at once — no fade from opacity-0", () => {
    const proto = HTMLImageElement.prototype;
    const completeDesc = Object.getOwnPropertyDescriptor(proto, "complete");
    const widthDesc = Object.getOwnPropertyDescriptor(proto, "naturalWidth");
    Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
    Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => 800 });
    try {
      const { container } = render(<CoverPhotoImage url="/api/trips/t/cover?v=1" alt="x" focalX={null} focalY={null} sizes="96px" />);
      expect(container.querySelector("img")!.className).toMatch(/opacity-100/);
    } finally {
      if (completeDesc) Object.defineProperty(proto, "complete", completeDesc);
      if (widthDesc) Object.defineProperty(proto, "naturalWidth", widthDesc);
    }
  });
});
