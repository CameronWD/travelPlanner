import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const m = vi.hoisted(() => ({ card: vi.fn() }));
vi.mock("./travels-map-card", () => ({
  TravelsMapCard: (props: Record<string, unknown>) => {
    m.card(props);
    return <div data-testid="map-card" />;
  },
}));

import { TravelsMapResponsive } from "./travels-map-responsive";

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: "(min-width: 768px)",
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return mql;
}

describe("TravelsMapResponsive", () => {
  const original = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  it("renders the desktop variant when the viewport matches ≥768px", () => {
    stubMatchMedia(true);
    render(<TravelsMapResponsive trips={[]} empty />);
    expect(m.card).toHaveBeenCalledWith(expect.objectContaining({ variant: "desktop" }));
  });

  it("renders the mobile variant when the viewport doesn't match", () => {
    stubMatchMedia(false);
    render(<TravelsMapResponsive trips={[]} empty />);
    expect(m.card).toHaveBeenCalledWith(expect.objectContaining({ variant: "mobile" }));
  });

  it("mounts exactly one map card, never both", () => {
    stubMatchMedia(true);
    render(<TravelsMapResponsive trips={[]} empty />);
    expect(m.card).toHaveBeenCalledTimes(1);
  });
});
