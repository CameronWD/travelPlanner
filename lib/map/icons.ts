/**
 * Leaflet's default marker icon URLs are derived from the CSS file's own path
 * and break under every JS bundler. The fix is to delete the resolver and point
 * at self-hosted copies in `public/leaflet/` (sourced from
 * `node_modules/leaflet/dist/images/`).
 *
 * All real pins are `divIcon`s, so in practice this stops a broken-image icon
 * ever appearing rather than being load-bearing — but it is two lines and it
 * removes a whole class of bug. Call once per map init, after the dynamic
 * `import("leaflet")` resolves.
 *
 * The Leaflet import here is a TYPE-only reference, erased at compile time, so
 * this module adds no runtime Leaflet dependency to `lib/`.
 */
export const LEAFLET_ICON_PATHS = {
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
} as const;

export function applyLeafletIconDefaults(L: typeof import("leaflet")): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({ ...LEAFLET_ICON_PATHS });
}
