# The "Globe" renders as a flat Leaflet map, not a 3D globe

## Context

The new feature is called the **Globe** and was described as "basically a globe
you can pin places to." The obvious reading of that name is a spinning 3D globe
(the kind `react-globe.gl`/three.js or a lightweight WebGL globe like `cobe`
produce). A future reader seeing a *flat* map behind something named "Globe" will
reasonably wonder whether that was a mistake.

It isn't. We weighed it explicitly.

What we already have:

- **Leaflet** is a dependency and is used in several places
  (`components/trip/route-map.tsx`, `wishlist-map.tsx`, `day-map.tsx`). We know
  its interaction model, its client-only dynamic-import pattern, and its
  category-coloured `divIcon` marker style.
- `components/trip/wishlist-map.tsx` is *already* a map of a collection of
  located, category-coloured items with click-to-select — almost exactly the
  Globe's map, one Trip narrower.

Alternatives considered:

1. **True 3D globe (`react-globe.gl` on three.js).** Matches the name and the
   mental image; clickable points are first-class; the earth texture can bundle
   for offline. But it's a **new, heavy WebGL dependency**, must be strictly
   client-only, and duplicates map capability we already have and maintain.
2. **Lightweight WebGL globe (`cobe`).** Tiny and pretty, but interactive,
   individually-clickable pins are fiddly — better as decoration than as the
   primary click-target surface the Globe needs.
3. **Flat Leaflet world map (chosen).** Zero new dependencies, consistent with
   the rest of the app, and a near-exact generalisation of `wishlist-map`.

## Decision

Render the Globe as a **flat, interactive Leaflet world map** — a generalisation
of the existing `wishlist-map` component (category-coloured pins, click a pin to
open its Marker, fit-bounds to all Markers) — paired with a list view.

**"Globe" is the name of the concept and the feature, not a description of the
rendering.** We are not adding a 3D globe library in v1.

## Consequences

- **Zero new rendering dependencies.** We reuse Leaflet and its established
  client-only loader pattern; the Globe map is largely `wishlist-map` widened to
  the whole world and pointed at `Marker`s instead of trip `Item`s.
- **The name/rendering mismatch is deliberate.** This ADR exists so nobody
  "corrects" the flat map into a 3D globe assuming it was an oversight.
- **Offline is via tiles, not a bundled texture.** Leaflet uses network OSM
  tiles; a bundled 3D earth texture would have been more offline-friendly. If the
  Globe ever needs to work fully offline, tile-caching (or revisiting a bundled
  globe) is the place to look — not a v1 requirement.
- **Reversible.** Because the map lives behind a small component boundary (a
  loader + a map component, as `wishlist-map` already does), swapping in a 3D
  globe later is a contained change if the "globe should be a globe" itch ever
  wins.
