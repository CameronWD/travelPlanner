import { CURRENCY_CODES, DEFAULT_HOME_CURRENCY } from "@/lib/currencies";
import { currencyForCountry } from "@/lib/currency-for-country";
import { formatDayLabel, formatNights, nightsBetween } from "@/lib/dates";
import { formatRoughMonth, isRoughMonth } from "@/lib/rough-month";
import type { PickedPlace } from "@/lib/picked-place";
import type { CreateTripInput } from "@/lib/validations/trip";

export type Step = 1 | 2 | 3 | 4;
export type DateMode = "exact" | "rough" | "none";

interface DraftStop {
  name: string;
  lat?: number;
  lng?: number;
  countryCode?: string;
}

export interface Draft {
  past: boolean;
  step: Step;
  name: string;
  dateMode: DateMode;
  startDate?: string;
  endDate?: string;
  roughMonth?: string;
  homeName?: string;
  homePlace?: PickedPlace;
  homeCurrency: string;
  stops: DraftStop[];
  /** MOTION N6: the stamp's first-date thunk has played for this draft. */
  stamped: boolean;
}

export type DraftAction =
  | { type: "set-name"; name: string }
  | { type: "set-mode"; mode: DateMode }
  | { type: "set-range"; start?: string; end?: string }
  | { type: "set-rough-month"; ym?: string }
  | { type: "set-home-text"; text: string }
  | { type: "pick-home"; place: PickedPlace }
  | { type: "clear-home" }
  | { type: "set-currency"; code: string }
  | { type: "add-stop"; stop: DraftStop }
  | { type: "remove-stop"; index: number }
  | { type: "go"; step: Step }
  | { type: "stamped" };

export const DRAFT_KEY = "teepee:new-trip-draft";
export const MAX_NAME = 120;
export const MAX_STOPS = 30;

export function emptyDraft(past: boolean): Draft {
  return { past, step: 1, name: "", dateMode: "exact", homeCurrency: DEFAULT_HOME_CURRENCY, stops: [], stamped: false };
}

export function draftReducer(d: Draft, a: DraftAction): Draft {
  switch (a.type) {
    case "set-name":
      return { ...d, name: a.name.slice(0, MAX_NAME) };
    case "set-mode":
      return d.past ? d : { ...d, dateMode: a.mode };
    case "set-range":
      return { ...d, startDate: a.start, endDate: a.end };
    case "set-rough-month":
      return { ...d, roughMonth: a.ym };
    case "set-home-text":
      return { ...d, homeName: a.text || undefined, homePlace: undefined };
    case "pick-home": {
      const code = a.place.countryCode ? currencyForCountry(a.place.countryCode) : undefined;
      return { ...d, homeName: a.place.name, homePlace: a.place, homeCurrency: code ?? d.homeCurrency };
    }
    case "clear-home":
      return { ...d, homeName: undefined, homePlace: undefined };
    case "set-currency":
      return CURRENCY_CODES.includes(a.code) ? { ...d, homeCurrency: a.code } : d;
    case "add-stop": {
      const name = a.stop.name.trim();
      if (!name || d.stops.length >= MAX_STOPS) return d;
      return { ...d, stops: [...d.stops, { ...a.stop, name }] };
    }
    case "remove-stop":
      return { ...d, stops: d.stops.filter((_, i) => i !== a.index) };
    case "go":
      return { ...d, step: a.step };
    case "stamped":
      return d.stamped ? d : { ...d, stamped: true };
  }
}

export type StepErrors = Partial<Record<"name" | "dates" | "home" | "form", string>>;

export function validateStep(d: Draft, step: Step): StepErrors {
  if (step === 1) return d.name.trim() ? {} : { name: "Give it a name to keep going" };
  if (step === 2) {
    // Past trips are Done only by their dates (ADR: no "past" flag), so they're required.
    if (d.past) return d.startDate && d.endDate ? {} : { dates: "Add the dates you went" };
    if (d.dateMode === "exact" && d.startDate && !d.endDate) return { dates: "Pick the day you get back" };
  }
  return {};
}

function firstOwedStep(d: Draft): Step | null {
  if (Object.keys(validateStep(d, 1)).length) return 1;
  if (Object.keys(validateStep(d, 2)).length) return 2;
  return null;
}

export function clampStep(d: Draft, want: number): Step {
  const asked = (Number.isInteger(want) && want >= 1 && want <= 4 ? want : 1) as Step;
  const owed = firstOwedStep(d);
  return owed !== null && owed < asked ? owed : asked;
}

export function toCreateInput(d: Draft, extra?: { fromShareToken?: string }): CreateTripInput {
  const exact = d.past || d.dateMode === "exact";
  const home = d.homeName?.trim();
  return {
    name: d.name.trim(),
    homeCurrency: d.homeCurrency,
    ...(exact && d.startDate && d.endDate ? { startDate: d.startDate, endDate: d.endDate } : {}),
    ...(!d.past && d.dateMode === "rough" && d.roughMonth ? { roughMonth: d.roughMonth } : {}),
    ...(!d.past && home ? { homeName: home } : {}),
    ...(!d.past && home && d.homePlace
      ? { homeLat: d.homePlace.lat, homeLng: d.homePlace.lng, ...(d.homePlace.countryCode ? { homeCountryCode: d.homePlace.countryCode } : {}) }
      : {}),
    ...(d.past && d.stops.length
      ? {
          stops: d.stops.map((s) => ({
            name: s.name,
            ...(s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng } : {}),
            ...(s.countryCode ? { countryCode: s.countryCode } : {}),
          })),
        }
      : {}),
    ...(extra?.fromShareToken ? { fromShareToken: extra.fromShareToken } : {}),
  } as CreateTripInput;
}

const STEP_OF: Record<string, Step> = {
  name: 1,
  startDate: 2, endDate: 2, hardEndDate: 2, roughMonth: 2,
  homeName: 3, homeCurrency: 3, homeLat: 3, homeLng: 3, homeCountryCode: 3, stops: 3,
};
const SLOT_OF: Record<Step, keyof StepErrors> = { 1: "name", 2: "dates", 3: "home", 4: "form" };

export function errorStep(errors: Record<string, string[] | undefined>): Step {
  let best: Step = 4;
  for (const [k, v] of Object.entries(errors)) {
    const s = STEP_OF[k];
    if (v?.length && s && s < best) best = s;
  }
  return best;
}

export function stepErrorsFrom(errors: Record<string, string[] | undefined>): StepErrors {
  const out: StepErrors = {};
  for (const [k, v] of Object.entries(errors)) {
    const slot = SLOT_OF[STEP_OF[k] ?? 4];
    if (v?.[0] && !out[slot]) out[slot] = v[0];
  }
  return out;
}

export function whenLine(d: Draft, today: string): string | null {
  if ((d.past || d.dateMode === "exact") && d.startDate && d.endDate) {
    return `${formatDayLabel(d.startDate)} – ${formatDayLabel(d.endDate)} · ${formatNights(nightsBetween(d.startDate, d.endDate))}`;
  }
  if (!d.past && d.dateMode === "rough" && d.roughMonth) return `Sometime in ${formatRoughMonth(d.roughMonth, today)}`;
  return null;
}

export function isDirty(d: Draft, hasCover: boolean): boolean {
  return hasCover || d.name.trim() !== "" || !!d.startDate || !!d.roughMonth || !!d.homeName || d.stops.length > 0;
}

export function serializeDraft(d: Draft): string {
  return JSON.stringify(d);
}

export function parseDraft(raw: string | null, past: boolean): Draft | null {
  if (!raw) return null;
  let v: Partial<Draft>;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || v.past !== past || typeof v.name !== "string") return null;
  if (![1, 2, 3, 4].includes(v.step as number) || !CURRENCY_CODES.includes(v.homeCurrency as string)) return null;
  const stops = Array.isArray(v.stops) ? v.stops.filter((s) => s && typeof s.name === "string").slice(0, MAX_STOPS) : [];
  const dateMode = (["exact", "rough", "none"] as const).find((m) => m === v.dateMode) ?? "exact";
  return { ...emptyDraft(past), ...v, stops, dateMode, roughMonth: isRoughMonth(v.roughMonth) ? v.roughMonth : undefined } as Draft;
}

export function initDraft({ past, initialName, initialStep, stored }: { past: boolean; initialName?: string; initialStep?: number; stored?: Draft | null }): Draft {
  let d = emptyDraft(past);
  if (initialName !== undefined) d = { ...d, name: initialName.trim().slice(0, MAX_NAME) };
  else if (stored && stored.past === past) d = stored;
  return { ...d, step: clampStep(d, initialStep ?? d.step) };
}
