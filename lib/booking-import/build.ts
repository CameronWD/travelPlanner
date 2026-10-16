/**
 * Booking import: turn Claude's report into Proposals for one Trip (spec
 * 2026-10-14 "Matching", "Duplicates", "Extraction schema"). Pure and
 * deterministic; never invents a value Claude did not report.
 */
import type { Category } from "@/lib/categories";
import { countryName } from "@/lib/countries";
import { CURRENCY_CODES } from "@/lib/currencies";
import { formatDayLabel } from "@/lib/dates";
import { decimalsFor, parseAmountToMinor } from "@/lib/money";
import { stopTimezone, timezoneForCountryOrNull } from "@/lib/tz";
import { findDuplicate, type ExistingBookings } from "./duplicates";
import { countryCodeOf, outsideStay, resolvePlace, sameCity, type MatchHome, type MatchStop, type PlaceMatch, type PlaceQuery } from "./match";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import type { BookingExtraction, ExtractedCost, ExtractedEnd, ExtractedProposal } from "./schema";
import {
  proposedRef,
  type BookingProposal,
  type Confidence,
  type Proposal,
  type ProposalBase,
  type ProposalCostFields,
  type ProposedAccommodationInput,
  type ProposedItemInput,
  type ProposedTransportInput,
  type StopProposal,
} from "./types";

export interface MatchContext {
  home: MatchHome;
  /** The plan being viewed, in plan order. */
  stops: MatchStop[];
  /** Surprise Stops the importer is surprised by (lib/surprise-visibility.ts hiddenStopIds). */
  blockedStopIds: ReadonlySet<string>;
  existing: ExistingBookings;
  /** YYYY-MM-DD in the Trip's current zone: a paid Cost's date of last resort. */
  today: string;
}

export interface BuildResult {
  proposals: Proposal[];
  /** Reported things that could not become a Proposal (a partial result). */
  dropped: number;
}

/** Claude's uncertainFields name → the card field it highlights. */
const UNCERTAIN_TO_HIGHLIGHT: Record<string, string> = {
  mode: "mode",
  carrier: "notes",
  serviceNumber: "notes",
  reference: "reference",
  depPlace: "depPlace",
  depTime: "depAt",
  arrPlace: "arrPlace",
  arrTime: "arrAt",
  seat: "notes",
  travelClass: "notes",
  name: "name",
  address: "address",
  checkIn: "checkIn",
  checkOut: "checkOut",
  checkInTime: "checkInTime",
  checkOutTime: "checkOutTime",
  confirmation: "confirmation",
  title: "title",
  category: "category",
  date: "date",
  startTime: "startTime",
  endTime: "startTime",
  booking: "booking",
  cost: "cost",
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A valid "YYYY-MM-DD" calendar date, or null (also rejects e.g. 2026-02-30). */
function normDate(v: string | null | undefined): string | null {
  const m = DATE_RE.exec((v ?? "").trim().slice(0, 10));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? m[0] : null;
}

export function normTime(v: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

export function normDateTime(v: string | null | undefined): { date: string | null; wall: string | null } {
  const s = (v ?? "").trim();
  const date = normDate(s);
  if (!date) return { date: null, wall: null };
  const sep = s.charAt(10);
  const time = sep === "T" || sep === " " ? normTime(s.slice(11)) : null;
  return { date, wall: time ? `${date}T${time}` : null };
}

const trimmed = (v: string | null | undefined): string | undefined => v?.trim() || undefined;

/** Drops undefined keys, so a Proposal's input carries only what the booking gave. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const lowest = (cs: Confidence[]): Confidence => cs.reduce<Confidence>((a, b) => (RANK[b] < RANK[a] ? b : a), "high");

/**
 * A decimal comma, European-style, read the way the printed amount means it
 * (fix round 1 finding 3d). A zero-decimal currency (JPY/KRW/ISK) never uses
 * a comma as its decimal mark, so "45,000" there is always forty-five
 * thousand, never 45.000.
 */
function normaliseAmountForParsing(raw: string, currency: string, doubleCheck: string[]): string {
  const s = raw.trim();
  if (decimalsFor(currency) === 0) return s;
  // "1.234" in a two-decimal currency: a dot before exactly three digits
  // (repeated) is a thousands separator as printed in much of Europe, never
  // a third decimal place, so read it as 1234.00 and say so (final review #7).
  if (decimalsFor(currency) === 2 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    const whole = s.replace(/\./g, "");
    const note = M.dotThousands(s, currency, `${whole}.00`);
    if (!doubleCheck.includes(note)) doubleCheck.push(note);
    return whole;
  }
  // "45,50": the sole comma, with one or two trailing digits, is the decimal mark.
  if (/^-?\d+,\d{1,2}$/.test(s)) return s.replace(",", ".");
  // "1.234,50": dot(s) as thousands separators, a trailing ",dd" as the decimal mark.
  if (s.includes(".") && /^-?[\d.]+,\d{2}$/.test(s)) return s.replace(/\./g, "").replace(/,(\d{2})$/, ".$1");
  return s;
}

function costFields(cost: ExtractedCost | null, bookedOn: string | null, today: string, doubleCheck: string[]): ProposalCostFields {
  if (!cost?.amount || !cost.currency) return {};
  const currency = cost.currency.trim().toUpperCase();
  if (!CURRENCY_CODES.includes(currency)) {
    doubleCheck.push(M.unsupportedCurrency(cost.amount.trim(), currency));
    return {};
  }
  const costMinor = parseAmountToMinor(normaliseAmountForParsing(cost.amount, currency, doubleCheck), currency);
  if (costMinor === null || costMinor < 0) {
    doubleCheck.push(M.unreadableAmount(cost.amount.trim(), currency));
    return {};
  }
  if (!cost.paidAmount) return { costMinor, currency };
  const paidMinor = parseAmountToMinor(normaliseAmountForParsing(cost.paidAmount, currency, doubleCheck), currency);
  if (paidMinor === null || paidMinor < 0) {
    doubleCheck.push(M.unreadablePaidAmount(cost.paidAmount.trim(), currency));
    return { costMinor, currency };
  }
  // A Cost can't be Paid without a paid amount (CONTEXT.md "Paid"): "0.00" paid is unpaid.
  if (paidMinor === 0) return { costMinor, currency };
  // ADR 0037: paid only when an amount paid is shown.
  return { costMinor, currency, paidMinor, paidAt: normDate(cost.paidDate) ?? normDate(bookedOn) ?? today };
}

function baseOf(src: ExtractedProposal): Omit<ProposalBase, "clientId"> {
  const highlight = new Set<string>();
  for (const field of src.uncertainFields) {
    const key = UNCERTAIN_TO_HIGHLIGHT[field];
    if (key) highlight.add(key);
  }
  return {
    confidence: src.confidence,
    doubleCheck: src.doubleCheck.map((s) => s.trim()).filter(Boolean),
    warnings: [],
    highlight: [...highlight],
    missing: [],
    duplicateOf: null,
    blocked: null,
  };
}

const NONE: PlaceMatch = { kind: "none" };

interface EndDraft { query: PlaceQuery; date: string | null; wall: string | null; layover: boolean; match: PlaceMatch }
interface TransportDraft { kind: "transport"; src: ExtractedProposal; dep: EndDraft; arr: EndDraft }
interface StayDraft { kind: "accommodation"; src: ExtractedProposal; name: string; checkIn: string; checkOut: string; query: PlaceQuery; match: PlaceMatch }
interface ItemDraft { kind: "item"; src: ExtractedProposal; title: string; date: string | null; query: PlaceQuery; match: PlaceMatch }
type Draft = TransportDraft | StayDraft | ItemDraft;

function endDraft(e: ExtractedEnd): EndDraft {
  const { date, wall } = normDateTime(e.localDateTime);
  return {
    query: { city: trimmed(e.city) ?? null, country: trimmed(e.country) ?? null, place: trimmed(e.place) ?? null },
    date,
    wall,
    layover: false,
    match: NONE,
  };
}

const hasPlace = (e: EndDraft) => Boolean(e.query.city || e.query.place || e.query.country);

function toDraft(src: ExtractedProposal): Draft | null {
  if (src.kind === "transport" && src.transport) {
    const dep = endDraft(src.transport.dep);
    const arr = endDraft(src.transport.arr);
    return hasPlace(dep) || hasPlace(arr) ? { kind: "transport", src, dep, arr } : null;
  }
  if (src.kind === "accommodation" && src.accommodation) {
    const a = src.accommodation;
    const name = trimmed(a.name);
    const checkIn = normDate(a.checkIn);
    const checkOut = normDate(a.checkOut);
    if (!name || !checkIn || !checkOut || checkOut < checkIn) return null;
    const query = { city: trimmed(a.city) ?? null, country: trimmed(a.country) ?? null, place: null };
    return { kind: "accommodation", src, name, checkIn, checkOut, query, match: NONE };
  }
  if (src.kind === "item" && src.item) {
    const i = src.item;
    const title = trimmed(i.title) ?? trimmed(i.place);
    if (!title) return null;
    const query = { city: trimmed(i.city) ?? null, country: trimmed(i.country) ?? null, place: null };
    return { kind: "item", src, title, date: normDate(i.date), query, match: NONE };
  }
  return null;
}

/** True when a Stay in this same report covers `city` on `date`: not a mere connection, a place the Traveller stops. */
function stayCoversCity(drafts: Draft[], city: string | null, date: string | null): boolean {
  if (!city || !date) return false;
  return drafts.some((d) => d.kind === "accommodation" && sameCity(city, d.query.city) && date >= d.checkIn && date <= d.checkOut);
}

/**
 * Two consecutive legs meeting in one city under 24 h apart: a connection,
 * not a Stop of its own (fix round 1 finding 1: this only suppresses
 * PROPOSING a new Stop there; a layover end still looks for a Stop that
 * already covers it, below).
 */
function markLayovers(drafts: Draft[]): void {
  const legs = drafts
    .filter((d): d is TransportDraft => d.kind === "transport" && Boolean(d.dep.wall && d.arr.wall))
    .sort((a, b) => a.dep.wall!.localeCompare(b.dep.wall!));
  const hub = (e: EndDraft) => e.query.city ?? e.query.place;
  for (let i = 0; i + 1 < legs.length; i++) {
    const a = legs[i];
    const b = legs[i + 1];
    const gapHours = (Date.parse(`${b.dep.wall}:00Z`) - Date.parse(`${a.arr.wall}:00Z`)) / 3_600_000;
    const city = hub(a.arr);
    if (
      gapHours >= 0 &&
      gapHours < 24 &&
      sameCity(city, hub(b.dep)) &&
      !stayCoversCity(drafts, city, a.arr.date) &&
      !stayCoversCity(drafts, hub(b.dep), b.dep.date)
    ) {
      a.arr.layover = true;
      b.dep.layover = true;
    }
  }
}

const TRANSPORT_END = { allowHome: true, allowNew: true, anyStopOnDate: false };
/** A layover end may still match a Stop that already covers it; it just can't propose a new one for a mere connection. */
const LAYOVER_END = { ...TRANSPORT_END, allowNew: false };

export function buildProposals(extraction: BookingExtraction, ctx: MatchContext): BuildResult {
  const drafts: Draft[] = [];
  let dropped = 0;
  for (const src of extraction.proposals) {
    const d = toDraft(src);
    if (d) drafts.push(d);
    else dropped++;
  }
  markLayovers(drafts);

  // 1. Where each place belongs.
  for (const d of drafts) {
    if (d.kind === "transport") {
      for (const end of [d.dep, d.arr]) {
        end.match = resolvePlace(end.query, { from: end.date, to: end.date }, ctx, end.layover ? LAYOVER_END : TRANSPORT_END);
      }
    } else if (d.kind === "accommodation") {
      d.match = resolvePlace(d.query, { from: d.checkIn, to: d.checkOut }, ctx, { allowHome: false, allowNew: true, anyStopOnDate: !d.query.city });
    } else {
      const placed = Boolean(d.query.city || d.query.country || d.date);
      d.match = placed
        ? resolvePlace(d.query, { from: d.date, to: d.date }, ctx, { allowHome: false, allowNew: Boolean(d.date), anyStopOnDate: true })
        : NONE;
    }
  }

  // 2. Proposed Stops: one per new city, spanning every date that needs it.
  interface NewStop { name: string; country: string | null; countryCode: string | null; dates: string[]; confidences: Confidence[] }
  const pending = new Map<string, NewStop>();
  const need = (m: PlaceMatch, dates: (string | null)[], confidence: Confidence) => {
    if (m.kind !== "new") return;
    const s = pending.get(m.key) ?? { name: m.name, country: m.country, countryCode: m.countryCode, dates: [], confidences: [] };
    s.dates.push(...dates.filter((x): x is string => x !== null));
    s.confidences.push(confidence);
    pending.set(m.key, s);
  };
  for (const d of drafts) {
    if (d.kind === "transport") {
      need(d.dep.match, [d.dep.date], d.src.confidence);
      need(d.arr.match, [d.arr.date], d.src.confidence);
    } else if (d.kind === "accommodation") need(d.match, [d.checkIn, d.checkOut], d.src.confidence);
    else need(d.match, [d.date], d.src.confidence);
  }

  const stopClientIds = new Map<string, string>();
  const stopProposals: StopProposal[] = [...pending.entries()]
    .filter(([, s]) => s.dates.length > 0)
    .map(([key, s]) => {
      const sorted = [...s.dates].sort();
      return { key, s, arriveDate: sorted[0], departDate: sorted[sorted.length - 1] };
    })
    .sort((a, b) => a.arriveDate.localeCompare(b.arriveDate) || a.s.name.localeCompare(b.s.name))
    .map(({ key, s, arriveDate, departDate }, i) => {
      const clientId = `s${i + 1}`;
      stopClientIds.set(key, clientId);
      const timezone = stopTimezone({ countryCode: s.countryCode, country: s.country });
      const proposal: StopProposal = {
        clientId,
        kind: "stop",
        confidence: lowest(s.confidences),
        doubleCheck: [],
        warnings: timezone === "UTC" ? [M.stopTimezoneUnknown] : [],
        highlight: [],
        missing: [],
        duplicateOf: null,
        blocked: null,
        input: compact({
          mode: "scheduled" as const,
          name: s.name,
          country: s.countryCode ? countryName(s.countryCode) : (s.country ?? undefined),
          countryCode: s.countryCode ?? undefined,
          timezone,
          arriveDate,
          departDate,
        }),
      };
      return proposal;
    });

  type Placed = { home?: true; stopId?: string; stop?: MatchStop };
  const placedOf = (m: PlaceMatch): Placed => {
    if (m.kind === "home") return { home: true };
    if (m.kind === "stop") return { stopId: m.stop.id, stop: m.stop };
    if (m.kind === "new") {
      const id = stopClientIds.get(m.key);
      return id ? { stopId: proposedRef(id) } : {};
    }
    return {};
  };

  const checkStop = (stop: MatchStop | undefined, b: Omit<ProposalBase, "clientId">) => {
    if (!stop) return;
    if (ctx.blockedStopIds.has(stop.id)) b.blocked = M.blocked;
    if (!stop.arriveDate) b.warnings.push(M.roughStop(stop.name));
  };

  const finish = (p: BookingProposal): BookingProposal => ({ ...p, warnings: [...new Set(p.warnings)], highlight: [...new Set(p.highlight)] });

  // 3. The Proposals themselves.
  const transportProposal = (d: TransportDraft, clientId: string): BookingProposal => {
    const t = d.src.transport!;
    const b = baseOf(d.src);
    const mode = t.mode ?? "OTHER";
    if (!t.mode) b.highlight.push("mode");
    const input: ProposedTransportInput = { mode };
    const homeHint = ctx.home.timezone ? null : timezoneForCountryOrNull(ctx.home.countryCode);
    let homeNoted = false;

    for (const which of ["dep", "arr"] as const) {
      const end = which === "dep" ? d.dep : d.arr;
      const placed = placedOf(end.match);
      let stopId: string | undefined;
      let place: string | undefined;
      let zone: string | undefined;
      if (placed.home) {
        if (!ctx.home.timezone && ctx.home.name) {
          zone = homeHint ?? undefined;
          if (!homeNoted) {
            b.doubleCheck.push(homeHint ? M.homeTimezoneGuess(ctx.home.name, homeHint) : M.homeTimezoneUnknown(ctx.home.name));
            homeNoted = true;
          }
        }
      } else if (placed.stopId) {
        stopId = placed.stopId;
        place = end.query.place ?? undefined; // the departure/arrival point within the Stop
        checkStop(placed.stop, b);
        // A rough Stop with no time zone yet still needs one, or createTransport
        // silently falls back to the other end's zone (fix round 1 finding 2).
        if (placed.stop && !placed.stop.timezone) {
          zone = timezoneForCountryOrNull(placed.stop.countryCode) ?? undefined;
        }
        if (placed.stop?.arriveDate && outsideStay(placed.stop, end.date)) {
          b.warnings.push(which === "dep" ? M.departsOutsideStay(placed.stop.name) : M.arrivesOutsideStay(placed.stop.name));
        }
      } else {
        place = end.query.place ?? end.query.city ?? undefined;
        zone = timezoneForCountryOrNull(countryCodeOf(end.query.country) ?? end.query.country) ?? undefined;
      }

      if (which === "dep") {
        if (placed.home) input.depIsHome = true;
        if (stopId) input.fromStopId = stopId;
        if (place) input.depPlace = place;
        if (zone) input.depTimezone = zone;
        if (end.wall) input.depAt = end.wall;
      } else {
        if (placed.home) input.arrIsHome = true;
        if (stopId) input.toStopId = stopId;
        if (place) input.arrPlace = place;
        if (zone) input.arrTimezone = zone;
        if (end.wall) input.arrAt = end.wall;
      }
      if (!end.wall) {
        b.missing.push(which === "dep" ? "Departure time" : "Arrival time");
        if (end.date) {
          const day = formatDayLabel(end.date);
          b.doubleCheck.push(which === "dep" ? M.onlyDepartureDate(day) : M.onlyArrivalDate(day));
        }
      }
    }

    // Seat, class and a non-flight carrier go into Notes (a flight number already names its airline).
    const carrier = mode === "FLIGHT" && t.serviceNumber ? null : t.carrier;
    const notes = [carrier, t.serviceNumber, t.seat ? `Seat ${t.seat.trim()}` : null, t.travelClass]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(" · ");
    if (notes) input.notes = notes;
    const reference = trimmed(t.reference);
    if (reference) input.reference = reference;
    Object.assign(input, costFields(d.src.cost, extraction.bookedOn, ctx.today, b.doubleCheck));

    b.duplicateOf = findDuplicate({ kind: "transport", reference, mode, date: d.dep.date ?? d.arr.date }, ctx.existing);
    if (b.duplicateOf) b.warnings.push(M.duplicate(b.duplicateOf.label));
    return finish({ ...b, clientId, kind: "transport", input });
  };

  const stayProposal = (d: StayDraft, clientId: string): BookingProposal | null => {
    const placed = placedOf(d.match);
    if (!placed.stopId) return null;
    const a = d.src.accommodation!;
    const b = baseOf(d.src);
    checkStop(placed.stop, b); // date clashes: AccommodationCard shows accommodationDateWarnings itself
    const confirmation = trimmed(a.confirmation);
    const input = compact<ProposedAccommodationInput>({
      stopId: placed.stopId,
      name: d.name,
      address: trimmed(a.address),
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      checkInTime: normTime(a.checkInTime) ?? undefined,
      checkOutTime: normTime(a.checkOutTime) ?? undefined,
      confirmation,
      ...costFields(d.src.cost, extraction.bookedOn, ctx.today, b.doubleCheck),
    });
    b.duplicateOf = findDuplicate({ kind: "accommodation", confirmation }, ctx.existing);
    if (b.duplicateOf) b.warnings.push(M.duplicate(b.duplicateOf.label));
    return finish({ ...b, clientId, kind: "accommodation", input });
  };

  const itemProposal = (d: ItemDraft, clientId: string): BookingProposal => {
    const i = d.src.item!;
    const b = baseOf(d.src);
    const placed = placedOf(d.match);
    checkStop(placed.stop, b);
    if (placed.stop?.arriveDate && d.date && outsideStay(placed.stop, d.date)) {
      b.warnings.push(M.itemOutsideStay(placed.stop.name, formatDayLabel(d.date)));
    }
    const category: Category = i.category ?? "OTHER";
    if (!i.category) b.highlight.push("category");
    const startTime = d.date ? normTime(i.startTime) : null;
    const rawEnd = d.date ? normTime(i.endTime) : null;
    const endTime = rawEnd && startTime && rawEnd >= startTime ? rawEnd : null;
    // When the title came from the place, don't repeat it in the address.
    const venue = trimmed(i.title) ? trimmed(i.place) : undefined;
    const address = [venue, trimmed(i.address)].filter(Boolean).join(", ") || undefined;
    if (!d.date) b.missing.push("Date");
    const booking = trimmed(i.booking);
    const input = compact<ProposedItemInput>({
      title: d.title,
      category,
      stopId: placed.stopId,
      date: d.date ?? undefined,
      startTime: startTime ?? undefined,
      endTime: endTime ?? undefined,
      address,
      booking,
      ...costFields(d.src.cost, extraction.bookedOn, ctx.today, b.doubleCheck),
    });
    b.duplicateOf = findDuplicate({ kind: "item", booking }, ctx.existing);
    if (b.duplicateOf) b.warnings.push(M.duplicate(b.duplicateOf.label));
    return finish({ ...b, clientId, kind: "item", input });
  };

  const bookings: BookingProposal[] = [];
  for (const d of drafts) {
    const clientId = `p${bookings.length + 1}`;
    const p = d.kind === "transport" ? transportProposal(d, clientId) : d.kind === "accommodation" ? stayProposal(d, clientId) : itemProposal(d, clientId);
    if (p) bookings.push(p);
    else dropped++;
  }
  return { proposals: [...stopProposals, ...bookings], dropped };
}
