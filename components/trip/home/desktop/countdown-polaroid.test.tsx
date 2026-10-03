import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CountdownPolaroid } from "./countdown-polaroid";

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

vi.mock("@/components/trip/home/desktop/cover-uploader-dialog", () => ({
  CoverUploaderDialog: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

describe("CountdownPolaroid", () => {
  it("hides the photo on a load error, leaving the bg-muted ground visible", () => {
    const { container } = render(
      <CountdownPolaroid tripId="t1" url="/api/trips/t1/cover?v=1" aspect={0.75} />,
    );
    const ground = container.querySelector("[data-polaroid] > div") as HTMLElement;
    expect(ground.className).toContain("bg-muted");
    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();

    fireEvent.error(img);

    // CoverPhotoImage unmounts itself on error rather than rendering a
    // broken-image glyph — the bg-muted ground behind it is what shows.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-polaroid]")).not.toBeNull();
  });
});
