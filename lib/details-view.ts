import type { AttachmentView } from "@/lib/attachment-view";
import type { LatLng } from "@/lib/geo";
import type { CostRow } from "@/lib/money/cost-row";
import { formatMoney } from "@/lib/money/money";
import type {
  AccommodationCardAccommodation,
  DayEntryEditor,
  ItemCardItem,
  TransportCardTransport,
} from "@/lib/plan-entity-views";
import type { TryList } from "@/lib/try-list";
import { formatDayLabel } from "@/lib/dates";
import { endpointLabel } from "@/lib/home-base";
import { isEmptyOpeningHours, type OpeningHours } from "@/lib/opening-hours";
import { openingHoursSummary, openingLine } from "@/lib/opening-hours-display";
import { slotLabel } from "@/lib/slot-time";
import { shortDate, transportTimeDisplay } from "@/lib/time-display";
import { TRANSPORT_MODE_META } from "@/lib/transport";
import { safeWebHref } from "@/lib/url";

export interface DetailsView {
  title: string;
  subtitle: string | null;
  times: Array<{ label: string; value: string }>;
  files: AttachmentView[];
  reference: string | null;
  referenceLabel: "Reference" | "Confirmation";
  address: string | null;
  place: LatLng | null;
  notes: string | null;
  link: string | null;
  tryList: TryList | null;
  openingHours: string | null;
  cost: { label: string; paid: boolean } | null;
}

export type DetailsContext = Partial<Pick<DayEntryEditor, "homeBaseName" | "homeTimezone">> & {
  stops?: ReadonlyArray<{ id: string; name: string }>;
  attachments: AttachmentView[];
  costs: CostRow[];
};

function text(s: string | null | undefined): string | null {
  return s?.trim() || null;
}

function point(lat: number | null | undefined, lng: number | null | undefined): LatLng | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

function stopName(ctx: DetailsContext, stopId: string | null | undefined): string | null {
  return text(ctx.stops?.find((s) => s.id === stopId)?.name);
}

/** CONTEXT.md "Cost": one current number per Cost (the paid amount once Paid), summed per currency. */
function costSummary(costs: CostRow[]): DetailsView["cost"] {
  if (costs.length === 0) return null;
  const byCurrency = new Map<string, number>();
  for (const c of costs) {
    const shown = c.paidAt ? (c.paidMinor ?? c.costMinor) : c.costMinor;
    byCurrency.set(c.currency, (byCurrency.get(c.currency) ?? 0) + shown);
  }
  return {
    label: [...byCurrency].map(([currency, minor]) => formatMoney(minor, currency)).join(" + "),
    paid: costs.every((c) => c.paidAt),
  };
}

function hoursText(hours: OpeningHours | null | undefined, date: string | null | undefined): string | null {
  if (!hours) return null;
  const line = date ? openingLine(hours, date) : null;
  if (line) return line.text;
  return isEmptyOpeningHours(hours) ? null : openingHoursSummary(hours);
}

function bare(title: string): DetailsView {
  return {
    title, subtitle: null, times: [], files: [], reference: null, referenceLabel: "Reference", address: null, place: null,
    notes: null, link: null, tryList: null, openingHours: null, cost: null,
  };
}

export function transportDetails(t: TransportCardTransport, ctx: DetailsContext): DetailsView {
  const mode = TRANSPORT_MODE_META[t.mode].label;
  const home = ctx.homeBaseName ?? "Home";
  const from = t.depIsHome ? home : endpointLabel(t.fromStopName, t.depPlace);
  const to = t.arrIsHome ? home : endpointLabel(t.toStopName, t.arrPlace);
  const title = from && to ? `${from} → ${to}` : (from ?? to ?? mode);
  const td = transportTimeDisplay({
    depAt: t.depAt, arrAt: t.arrAt, fromTimezone: t.fromStopTimezone, toTimezone: t.toStopTimezone,
    depIsHome: t.depIsHome, arrIsHome: t.arrIsHome, homeTimezone: ctx.homeTimezone,
  });
  const times: DetailsView["times"] = [];
  if (td.dep) times.push({ label: "Departs", value: `${shortDate(td.dep.dateISO)} ${td.dep.time} ${td.dep.zone}` });
  if (td.arr) times.push({ label: "Arrives", value: `${shortDate(td.arr.dateISO)} ${td.arr.time} ${td.arr.zone}` });
  return {
    ...bare(title),
    subtitle: title === mode ? null : mode,
    times,
    files: ctx.attachments,
    reference: text(t.reference),
    notes: text(t.notes),
    cost: costSummary(ctx.costs),
  };
}

export function accommodationDetails(a: AccommodationCardAccommodation, ctx: DetailsContext): DetailsView {
  const at = (date: string, time: string | null | undefined) => (time ? `${formatDayLabel(date)} ${time}` : formatDayLabel(date));
  return {
    ...bare(a.name),
    subtitle: stopName(ctx, a.stopId),
    times: [
      { label: "Check-in", value: at(a.checkIn, a.checkInTime) },
      { label: "Check-out", value: at(a.checkOut, a.checkOutTime) },
    ],
    files: ctx.attachments,
    reference: text(a.confirmation),
    referenceLabel: "Confirmation",
    address: text(a.address),
    place: point(a.lat, a.lng),
    notes: text(a.notes),
    cost: costSummary(ctx.costs),
  };
}

export function itemDetails(i: ItemCardItem, ctx: DetailsContext): DetailsView {
  // CONTEXT.md "Surprise": the masked placeholder never gains anything from its context.
  if (i.surprise?.youAreSurprised) return bare(i.title);
  const times: DetailsView["times"] = [];
  if (i.date) {
    const span = i.startTime ? ` ${i.startTime}${i.endTime ? `–${i.endTime}` : ""}` : "";
    times.push({ label: "When", value: `${formatDayLabel(i.date)}${span}` });
  }
  const slot = slotLabel(i);
  if (slot) times.push({ label: "Ticket", value: slot });
  return {
    ...bare(i.title),
    subtitle: text(i.stopName) ?? stopName(ctx, i.stopId),
    times,
    files: ctx.attachments,
    reference: text(i.booking),
    address: text(i.address),
    place: point(i.lat, i.lng),
    notes: text(i.notes),
    link: safeWebHref(i.link),
    tryList: i.tryList?.length ? i.tryList : null,
    openingHours: hoursText(i.openingHours, i.date),
    cost: costSummary(ctx.costs),
  };
}
