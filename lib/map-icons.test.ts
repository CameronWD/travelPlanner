import { describe, expect, it, vi } from "vitest";
import { applyLeafletIconDefaults, LEAFLET_ICON_PATHS } from "./map-icons";

function stubLeaflet() {
  const mergeOptions = vi.fn();
  const prototype: Record<string, unknown> = { _getIconUrl: () => "broken" };
  const L = { Icon: { Default: { prototype, mergeOptions } } };
  return { L, prototype, mergeOptions };
}

describe("applyLeafletIconDefaults", () => {
  it("deletes the bundler-broken _getIconUrl resolver", () => {
    const { L, prototype } = stubLeaflet();
    applyLeafletIconDefaults(L as unknown as typeof import("leaflet"));
    expect("_getIconUrl" in prototype).toBe(false);
  });

  it("repoints all three icon URLs at the self-hosted copies", () => {
    const { L, mergeOptions } = stubLeaflet();
    applyLeafletIconDefaults(L as unknown as typeof import("leaflet"));
    expect(mergeOptions).toHaveBeenCalledWith({
      iconRetinaUrl: "/leaflet/marker-icon-2x.png",
      iconUrl: "/leaflet/marker-icon.png",
      shadowUrl: "/leaflet/marker-shadow.png",
    });
  });

  it("exposes the paths so they can be asserted against public/leaflet", () => {
    expect(LEAFLET_ICON_PATHS.iconUrl).toBe("/leaflet/marker-icon.png");
    expect(LEAFLET_ICON_PATHS.iconRetinaUrl).toBe("/leaflet/marker-icon-2x.png");
    expect(LEAFLET_ICON_PATHS.shadowUrl).toBe("/leaflet/marker-shadow.png");
  });

  it("is safe to call twice (maps re-init on data change)", () => {
    const { L, mergeOptions } = stubLeaflet();
    const typed = L as unknown as typeof import("leaflet");
    applyLeafletIconDefaults(typed);
    expect(() => applyLeafletIconDefaults(typed)).not.toThrow();
    expect(mergeOptions).toHaveBeenCalledTimes(2);
  });
});
