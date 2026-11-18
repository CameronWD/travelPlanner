export interface DayThingInput {
  id: string;
  title: string;
  startTime?: string | null;
}

export interface DayThings {
  shown: { id: string; title: string; time: string | null; label: string }[];
  more: number;
}

export function dayThings(things: readonly DayThingInput[], max = 3): DayThings {
  const timed = things
    .filter((t) => t.startTime)
    .sort((a, b) => (a.startTime! < b.startTime! ? -1 : a.startTime! > b.startTime! ? 1 : 0));
  const untimed = things.filter((t) => !t.startTime);
  const ordered = [...timed, ...untimed];
  return {
    shown: ordered.slice(0, max).map((t) => ({ id: t.id, title: t.title, time: t.startTime || null, label: t.startTime ? `${t.startTime} ${t.title}` : t.title })),
    more: Math.max(0, ordered.length - max),
  };
}

export interface BandStop {
  id: string;
  name: string;
  arriveDate: string;
  departDate: string;
  sortOrder: number;
}

export interface StopBand {
  stopId: string;
  name: string;
  startCol: number;
  span: number;
}

function stopOn(dateISO: string, stops: readonly BandStop[]): BandStop | null {
  let best: BandStop | null = null;
  for (const s of stops) {
    if (s.arriveDate > dateISO || s.departDate < dateISO) continue;
    if (!best || s.arriveDate > best.arriveDate) best = s;
  }
  return best;
}

// A null day (padding, or outside the trip) gets no band; the Changeover day
// belongs to the arriving Stop, as it does for the cell tint.
export function stopBands(weekDays: readonly (string | null)[], stops: readonly BandStop[]): StopBand[] {
  const bands: StopBand[] = [];
  weekDays.forEach((dateISO, col) => {
    const stop = dateISO ? stopOn(dateISO, stops) : null;
    if (!stop) return;
    const last = bands[bands.length - 1];
    if (last && last.stopId === stop.id && last.startCol + last.span === col) last.span += 1;
    else bands.push({ stopId: stop.id, name: stop.name, startCol: col, span: 1 });
  });
  return bands;
}
