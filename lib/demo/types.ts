import type { FlagStop, FlagTransport, FlagItem, FlagAccommodation, DetectFlagsInput } from "@/lib/flags";
import type { ProjectionStop } from "@/lib/firm-up";
import type { HomeBase } from "@/lib/home-base";

export type Key = string;                 // stable cross-ref key, e.g. "eu:stop:paris"
export type Who = "you" | "partner";

export interface DemoVote { user: Who; level: "MUST" | "KEEN" | "MEH"; }
export interface DemoInlineCost { estimatedMinor: number; actualMinor?: number | null; currency: string; paid?: boolean; category?: string | null; }
export interface DemoCost extends DemoInlineCost { ownerType: "TRANSPORT" | "ACCOMMODATION" | "ITEM" | "OTHER"; ownerKey?: Key | null; label?: string | null; }

export interface DemoStop {
  key: Key; name: string; country?: string | null; countryCode?: string | null;
  lat?: number | null; lng?: number | null; timezone?: string | null;
  arriveDate?: string | null; departDate?: string | null; nights?: number | null;
  pinned?: boolean; chapterKey?: Key | null; chapterSortOrder?: number; notes?: string | null; sortOrder: number;
}
export interface DemoChapter { key: Key; name: string; colour: string; startDate?: string | null; endDate?: string | null; sortOrder: number; }
export interface DemoTransport {
  key: Key; mode: "FLIGHT" | "TRAIN" | "BUS" | "CAR" | "FERRY" | "OTHER";
  fromStopKey?: Key | null; toStopKey?: Key | null; depIsHome?: boolean; arrIsHome?: boolean;
  depPlace?: string | null; arrPlace?: string | null; depAt?: string | null; arrAt?: string | null;
  depLat?: number | null; depLng?: number | null; arrLat?: number | null; arrLng?: number | null;
  reference?: string | null; notes?: string | null; sortOrder: number; cost?: DemoInlineCost | null;
}
export interface DemoAccommodation { key: Key; stopKey: Key; name: string; address?: string | null; checkIn: string; checkOut: string; confirmation?: string | null; notes?: string | null; lat?: number | null; lng?: number | null; cost?: DemoInlineCost | null; }
export interface DemoItem {
  key: Key; title: string; category: string; stopKey?: Key | null; date?: string | null;
  startTime?: string | null; endTime?: string | null; lat?: number | null; lng?: number | null;
  address?: string | null; link?: string | null; booking?: string | null; notes?: string | null;
  sourceItemKey?: Key | null; sourceMarkerKey?: Key | null; votes?: DemoVote[]; cost?: DemoInlineCost | null; sortOrder?: number;
}
export interface DemoPlan { stops: DemoStop[]; chapters: DemoChapter[]; transports: DemoTransport[]; accommodations: DemoAccommodation[]; items: DemoItem[]; costs: DemoCost[]; }
export interface DemoFork extends DemoPlan { key: Key; name: string; sortOrder: number; createdBy: Who; }

export interface DemoNote { author: Who; targetType: "STOP" | "ITEM" | "ACCOMMODATION" | "TRANSPORT" | "TRIP"; targetKey: Key | "TRIP"; body: string; }
export interface DemoChecklistItem { kind: "PRETRIP" | "PACKING"; text: string; done: boolean; dueDate?: string | null; assignedTo?: Who | null; }
export interface DemoReminder { title: string; fireAt: string; targetType?: "ITEM" | "TRANSPORT" | null; targetKey?: Key | null; sent?: boolean; }
export interface DemoJournalEntry { date: string; author: Who; body: string; }
export interface DemoAttachment { targetType: "TRIP" | "TRANSPORT" | "ACCOMMODATION" | "ITEM" | "MARKER"; targetKey?: Key | "TRIP" | null; filename: string; mime: string; body: string; }
export interface DemoActivity { actor: Who; verb: "CREATED" | "UPDATED" | "DELETED" | "NOTED" | "PROMOTED"; entityType: string; entityKey?: Key | null; entityLabel: string; changes?: unknown; at?: string; daysAgo?: number; }
export interface DemoInvite { email: string; role: "owner" | "member"; }

export interface DemoTrip extends DemoPlan {
  key: Key; name: string; createdBy: Who; startDate: string | null; endDate: string | null;
  hardEndDate?: string | null; homeCurrency: string; home?: HomeBase | null; roundTrip?: boolean;
  coverGradient?: [string, string] | null; drivingWindingFactor?: number; drivingAvgSpeedKph?: number;
  exchangeRates?: { base: string; quote: string; rate: number; manual: boolean; fetchedAt: string }[];
  forks?: DemoFork[]; notes?: DemoNote[]; checklist?: DemoChecklistItem[]; reminders?: DemoReminder[];
  journal?: DemoJournalEntry[]; attachments?: DemoAttachment[]; activities?: DemoActivity[]; invites?: DemoInvite[];
  shareLink?: boolean; calendarFeed?: { includeTransport?: boolean; includeAccommodation?: boolean; includeActivities?: boolean } | null;
  packingTemplates?: { name: string; items: string[]; owner: Who }[]; unreadFor?: Who | null;
}
export interface DemoMarker { key: Key; title: string; category: string; note?: string | null; link?: string | null; timing?: string | null; lat?: number | null; lng?: number | null; city?: string | null; country?: string | null; countryCode?: string | null; createdBy: Who; attachments?: DemoAttachment[]; }
export interface DemoGlobe { createdBy: Who; members: { user: Who; role: "owner" | "member" }[]; markers: DemoMarker[]; invites?: DemoInvite[]; }
export interface DemoDataset { globe: DemoGlobe; trips: DemoTrip[]; }

// --- Adapters to the pure engines -----------------------------------------
export function toFlagStop(s: DemoStop): FlagStop | null {
  if (!s.arriveDate || !s.departDate || !s.timezone) return null; // rough stops are not flagged directly
  return { id: s.key, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate, timezone: s.timezone, lat: s.lat ?? null, lng: s.lng ?? null, sortOrder: s.sortOrder };
}
export function toFlagTransport(t: DemoTransport): FlagTransport {
  return { id: t.key, fromStopId: t.fromStopKey ?? null, toStopId: t.toStopKey ?? null, depAt: t.depAt ?? null, arrAt: t.arrAt ?? null, mode: t.mode, depIsHome: t.depIsHome ?? false, arrIsHome: t.arrIsHome ?? false };
}
export function toFlagItem(i: DemoItem): FlagItem {
  return { id: i.key, stopId: i.stopKey ?? null, date: i.date ?? null, startTime: i.startTime ?? null, endTime: i.endTime ?? null, lat: i.lat ?? null, lng: i.lng ?? null };
}
export function toFlagAccommodation(a: DemoAccommodation): FlagAccommodation {
  return { id: a.key, stopId: a.stopKey, checkIn: a.checkIn, checkOut: a.checkOut, name: a.name };
}
export function toProjectionStop(s: DemoStop): ProjectionStop {
  return { id: s.key, arriveDate: s.arriveDate ?? null, departDate: s.departDate ?? null, nights: s.nights ?? null, pinned: s.pinned ?? false, sortOrder: s.sortOrder };
}

export interface PlanFlagOpts {
  tripStart: string; tripEnd: string; hardEndDate?: string | null; projectedEnd?: string | null;
  home?: HomeBase | null; roundTrip?: boolean; drivingWindingFactor?: number; drivingAvgSpeedKph?: number;
}
export function planFlagInput(plan: DemoPlan, opts: PlanFlagOpts): DetectFlagsInput {
  const flagStops = plan.stops.map(toFlagStop).filter((s): s is FlagStop => s !== null);
  const roughStopCount = plan.stops.length - flagStops.length;
  const ordered = [...plan.stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = ordered[0]; const last = ordered[ordered.length - 1];
  return {
    stops: flagStops,
    transports: plan.transports.map(toFlagTransport),
    accommodations: plan.accommodations.map(toFlagAccommodation),
    items: plan.items.map(toFlagItem),
    tripStart: opts.tripStart, tripEnd: opts.tripEnd,
    roughStopCount, projectedEnd: opts.projectedEnd ?? null, hardEndDate: opts.hardEndDate ?? null,
    drivingWindingFactor: opts.drivingWindingFactor, drivingAvgSpeedKph: opts.drivingAvgSpeedKph,
    home: opts.home ?? null, roundTrip: opts.roundTrip,
    homeFirstStop: first ? { id: first.key, name: first.name } : null,
    homeLastStop: last ? { id: last.key, name: last.name } : null,
  };
}
