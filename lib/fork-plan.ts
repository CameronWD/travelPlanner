/**
 * Pure builder for the Fork-plan feature. Transforms a source Trip snapshot
 * into create-data keyed by SOURCE ids, applying the copy/keep/drop rules for
 * a Fork (a faithful copy of the live arrangement).
 *
 * Rules (compare with buildDuplicatePlan in duplicate-trip.ts):
 *   KEEP  — dates, pinned, accommodations, estimated Costs, rateToHome
 *   DROP  — paidAt, actualMinor from Costs; votes/notes/attachments (trip-wide)
 *   NULL  — sourceItemId (items) and ownerId (costs, remapped by the tx)
 *
 * No db, no id minting, no network — Task 7's server action mints ids and
 * remaps FK relationships from the `sourceId` / `source*Id` keys.
 */

// ---------------------------------------------------------------------------
// Source types
// ---------------------------------------------------------------------------

export interface ForkSourceChapter {
  id: string;
  name: string;
  colour: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

export interface ForkSourceStop {
  id: string;
  chapterId: string | null;
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
  chapterSortOrder: number;
  notes: string | null;
}

export interface ForkSourceTransport {
  id: string;
  fromStopId: string | null;
  toStopId: string | null;
  mode: string;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  depLat: number | null;
  depLng: number | null;
  arrLat: number | null;
  arrLng: number | null;
  reference: string | null;
  notes: string | null;
  sortOrder: number;
}

export interface ForkSourceAccommodation {
  id: string;
  stopId: string | null;
  name: string;
  address: string | null;
  checkIn: string;
  checkOut: string;
  confirmation: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ForkSourceItem {
  id: string;
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
  sortOrder: number;
}

export interface ForkSourceCost {
  id: string;
  estimatedMinor: number;
  actualMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  ownerType: string;
  ownerId: string | null;
  label: string | null;
  category: string | null;
}

export interface ForkSource {
  chapters: ForkSourceChapter[];
  stops: ForkSourceStop[];
  transports: ForkSourceTransport[];
  accommodations: ForkSourceAccommodation[];
  items: ForkSourceItem[];
  costs: ForkSourceCost[];
}

// ---------------------------------------------------------------------------
// Plan (output) types
// ---------------------------------------------------------------------------

export interface ForkPlan {
  chapters: Array<{
    sourceId: string;
    data: {
      name: string;
      colour: string;
      startDate: string | null;
      endDate: string | null;
      sortOrder: number;
    };
  }>;
  stops: Array<{
    sourceId: string;
    sourceChapterId: string | null;
    data: {
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
      chapterSortOrder: number;
      notes: string | null;
    };
  }>;
  transports: Array<{
    sourceFromStopId: string | null;
    sourceToStopId: string | null;
    data: {
      mode: string;
      depPlace: string | null;
      arrPlace: string | null;
      depAt: Date | null;
      arrAt: Date | null;
      depLat: number | null;
      depLng: number | null;
      arrLat: number | null;
      arrLng: number | null;
      reference: string | null;
      notes: string | null;
      sortOrder: number;
    };
  }>;
  accommodations: Array<{
    sourceStopId: string | null;
    data: {
      name: string;
      address: string | null;
      checkIn: string;
      checkOut: string;
      confirmation: string | null;
      notes: string | null;
      lat: number | null;
      lng: number | null;
    };
  }>;
  items: Array<{
    sourceStopId: string | null;
    data: {
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
      sortOrder: number;
      sourceItemId: null;
    };
  }>;
  costs: Array<{
    sourceOwnerType: string;
    sourceOwnerId: string | null;
    data: {
      estimatedMinor: number;
      actualMinor: null;
      currency: string;
      rateToHome: number | null;
      paidAt: null;
      ownerType: string;
      ownerId: null;
      label: string | null;
      category: string | null;
    };
  }>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildForkPlan(source: ForkSource): ForkPlan {
  return {
    chapters: source.chapters.map((c) => ({
      sourceId: c.id,
      data: { name: c.name, colour: c.colour, startDate: c.startDate, endDate: c.endDate, sortOrder: c.sortOrder },
    })),
    stops: source.stops.map((s) => ({
      sourceId: s.id,
      sourceChapterId: s.chapterId,
      data: {
        name: s.name, country: s.country, lat: s.lat, lng: s.lng, timezone: s.timezone,
        arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights, pinned: s.pinned,
        sortOrder: s.sortOrder, chapterSortOrder: s.chapterSortOrder, notes: s.notes,
      },
    })),
    transports: source.transports.map((t) => ({
      sourceFromStopId: t.fromStopId, sourceToStopId: t.toStopId,
      data: {
        mode: t.mode, depPlace: t.depPlace, arrPlace: t.arrPlace, depAt: t.depAt, arrAt: t.arrAt,
        depLat: t.depLat, depLng: t.depLng, arrLat: t.arrLat, arrLng: t.arrLng,
        reference: t.reference, notes: t.notes, sortOrder: t.sortOrder,
      },
    })),
    accommodations: source.accommodations.map((a) => ({
      sourceStopId: a.stopId,
      data: {
        name: a.name, address: a.address, checkIn: a.checkIn, checkOut: a.checkOut,
        confirmation: a.confirmation, notes: a.notes, lat: a.lat, lng: a.lng,
      },
    })),
    items: source.items.map((it) => ({
      sourceStopId: it.stopId,
      data: {
        title: it.title, category: it.category, date: it.date, startTime: it.startTime, endTime: it.endTime,
        lat: it.lat, lng: it.lng, address: it.address, link: it.link, booking: it.booking,
        notes: it.notes, sortOrder: it.sortOrder, sourceItemId: null,
      },
    })),
    costs: source.costs.map((c) => ({
      sourceOwnerType: c.ownerType, sourceOwnerId: c.ownerId,
      data: {
        estimatedMinor: c.estimatedMinor, actualMinor: null, currency: c.currency, rateToHome: c.rateToHome,
        paidAt: null, ownerType: c.ownerType, ownerId: null /* remapped in tx */, label: c.label, category: c.category,
      },
    })),
  };
}
