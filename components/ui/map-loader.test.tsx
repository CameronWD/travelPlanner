import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMapLoader } from "./map-loader";
import { setMatchMedia } from "@/test/setup";

afterEach(() => setMatchMedia((q) => q === "(min-width: 640px)"));

function makeLoader() {
  const load = vi.fn(async () => function InnerMap({ label }: { label: string }) {
    return <div data-testid="inner-map">{label}</div>;
  });
  return { load, Loader: createMapLoader<{ label: string }>(load) };
}

describe("createMapLoader mountWhen (spec 2026-10-06 §D)", () => {
  it("mounts by default", async () => {
    const { load, Loader } = makeLoader();
    render(<Loader label="a" />);
    expect(await screen.findByTestId("inner-map")).toHaveTextContent("a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("mountWhen={false} renders nothing and never loads the map module", () => {
    const { load, Loader } = makeLoader();
    const { container } = render(<Loader label="a" mountWhen={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(load).not.toHaveBeenCalled();
  });

  it('mountWhen="desktop" below lg never loads the map module', () => {
    setMatchMedia(false);
    const { load, Loader } = makeLoader();
    render(<Loader label="a" mountWhen="desktop" />);
    expect(load).not.toHaveBeenCalled();
  });

  it('mountWhen="desktop" at lg+ loads it', async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)");
    const { Loader } = makeLoader();
    render(<Loader label="d" mountWhen="desktop" />);
    expect(await screen.findByTestId("inner-map")).toHaveTextContent("d");
  });

  it('mountWhen="phone" at lg+ never loads the map module', () => {
    setMatchMedia((q) => q === "(min-width: 1024px)");
    const { load, Loader } = makeLoader();
    render(<Loader label="a" mountWhen="phone" />);
    expect(load).not.toHaveBeenCalled();
  });
});
