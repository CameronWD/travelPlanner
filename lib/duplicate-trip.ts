/**
 * Pure builder for the Duplicate-trip feature. Transforms a source Trip
 * snapshot into create-data keyed by SOURCE ids, applying the copy/reset/drop
 * rules from ADR-0018. No db, no id minting, no network — the server action
 * mints ids and remaps relationships from the `sourceId` keys.
 *
 * Rules: keep the skeleton (stops as rough, chapters as rough, items as
 * unscheduled wishlist, transport connections stripped, checklist text);
 * reset every date; drop accommodations, costs, FX rates, and all history
 * (handled by simply not reading them into the source snapshot).
 */

export interface DuplicateSourceChapter {
  id: string;
  name: string;
  colour: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

export interface DuplicateSourceStop {
  id: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  sortOrder: number;
  chapterId: string | null;
  chapterSortOrder: number;
  notes: string | null;
}

export interface DuplicateSourceItem {
  stopId: string | null;
  title: string;
  category: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
}

export interface DuplicateSourceTransport {
  fromStopId: string | null;
  toStopId: string | null;
  mode: string;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  reference: string | null;
  notes: string | null;
  depLat: number | null;
  depLng: number | null;
  arrLat: number | null;
  arrLng: number | null;
}

export interface DuplicateSourceChecklistItem {
  kind: string;
  text: string;
  dueDate: string | null;
}

export interface DuplicateSource {
  name: string;
  homeCurrency: string;
  drivingWindingFactor: number;
  drivingAvgSpeedKph: number;
  chapters: DuplicateSourceChapter[];
  stops: DuplicateSourceStop[];
  items: DuplicateSourceItem[];
  transports: DuplicateSourceTransport[];
  checklistItems: DuplicateSourceChecklistItem[];
}

export interface DuplicatePlan {
  trip: { name: string; homeCurrency: string; drivingWindingFactor: number; drivingAvgSpeedKph: number };
  chapters: Array<{ sourceId: string; data: { name: string; colour: string; startDate: null; endDate: null; sortOrder: number } }>;
  stops: Array<{
    sourceId: string;
    sourceChapterId: string | null;
    data: {
      name: string; country: string | null; lat: number | null; lng: number | null; timezone: string | null;
      arriveDate: null; departDate: null; nights: number; pinned: false; sortOrder: number; chapterSortOrder: number; notes: string | null;
    };
  }>;
  items: Array<{
    sourceStopId: string | null;
    data: {
      title: string; category: string; date: null; startTime: null; endTime: null; booking: null;
      lat: number | null; lng: number | null; address: string | null; link: string | null; notes: string | null; sortOrder: number;
    };
  }>;
  transports: Array<{
    sourceFromStopId: string | null;
    sourceToStopId: string | null;
    data: {
      mode: string; depPlace: string | null; arrPlace: string | null; depAt: null; arrAt: null; reference: null; notes: null;
      depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null; sortOrder: number;
    };
  }>;
  checklistItems: Array<{ data: { kind: string; text: string; done: false; dueDate: null; assignedToId: null; sortOrder: number } }>;
}

/** Whole nights between two YYYY-MM-DD dates (UTC midnight diff). */
function nightsBetween(arrive: string, depart: string): number {
  const a = Date.parse(`${arrive}T00:00:00Z`);
  const d = Date.parse(`${depart}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(d)) return 1;
  return Math.max(1, Math.round((d - a) / 86_400_000));
}

export function buildDuplicatePlan(source: DuplicateSource, newName: string): DuplicatePlan {
  return {
    trip: {
      name: newName,
      homeCurrency: source.homeCurrency,
      drivingWindingFactor: source.drivingWindingFactor,
      drivingAvgSpeedKph: source.drivingAvgSpeedKph,
    },
    chapters: source.chapters.map((c) => ({
      sourceId: c.id,
      data: { name: c.name, colour: c.colour, startDate: null, endDate: null, sortOrder: c.sortOrder },
    })),
    stops: source.stops.map((s) => ({
      sourceId: s.id,
      sourceChapterId: s.chapterId,
      data: {
        name: s.name,
        country: s.country,
        lat: s.lat,
        lng: s.lng,
        timezone: s.timezone,
        arriveDate: null,
        departDate: null,
        nights: s.nights ?? (s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : 1),
        pinned: false,
        sortOrder: s.sortOrder,
        chapterSortOrder: s.chapterSortOrder,
        notes: s.notes,
      },
    })),
    items: source.items.map((it, idx) => ({
      sourceStopId: it.stopId,
      data: {
        title: it.title,
        category: it.category,
        date: null,
        startTime: null,
        endTime: null,
        booking: null,
        lat: it.lat,
        lng: it.lng,
        address: it.address,
        link: it.link,
        notes: it.notes,
        sortOrder: idx,
      },
    })),
    transports: source.transports.map((t, idx) => ({
      sourceFromStopId: t.fromStopId,
      sourceToStopId: t.toStopId,
      data: {
        mode: t.mode,
        depPlace: t.depPlace,
        arrPlace: t.arrPlace,
        depAt: null,
        arrAt: null,
        reference: null,
        notes: null,
        depLat: t.depLat,
        depLng: t.depLng,
        arrLat: t.arrLat,
        arrLng: t.arrLng,
        sortOrder: idx,
      },
    })),
    checklistItems: source.checklistItems.map((c, idx) => ({
      data: { kind: c.kind, text: c.text, done: false, dueDate: null, assignedToId: null, sortOrder: idx },
    })),
  };
}
