/**
 * Pin de-overlap for the desktop Home's Route map (spec 2026-09-27-desktop-home
 * §6: "At the fitted zoom, pins must not overlap"). After fitBounds the map
 * projects each Stop to container pixels; any pins closer than `minPx` (the pin
 * size plus a little air) are merged into one count pin at their centre.
 *
 * Single-linkage, so a chain of close pins becomes one group. Groups come back
 * in the order of their first member; ids inside a group keep input order.
 * PURE — no Leaflet.
 */
export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

export interface MergedPin {
  ids: string[];
  x: number;
  y: number;
}

export function mergeOverlapping(points: ScreenPoint[], minPx: number): MergedPin[] {
  const n = points.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (Math.hypot(dx, dy) < minPx) {
        const a = find(i);
        const b = find(j);
        // Root at the lower index so group order follows the first member.
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }

  const groups = new Map<number, ScreenPoint[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(points[i]);
    else groups.set(root, [points[i]]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, members]) => ({
      ids: members.map((p) => p.id),
      x: members.reduce((s, p) => s + p.x, 0) / members.length,
      y: members.reduce((s, p) => s + p.y, 0) / members.length,
    }));
}
