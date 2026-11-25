import type { TransportMode } from "@/lib/enum-values";

export const TRANSPORT_DETAIL_KEYS = ["carrier", "serviceNumber", "seat", "terminal", "gate", "coach", "platform"] as const;
export type TransportDetailKey = (typeof TRANSPORT_DETAIL_KEYS)[number];
export type TransportDetails = { [K in TransportDetailKey]?: string | null };
export const TRANSPORT_DETAIL_MAX = 60;

export interface TransportDetailField {
  key: TransportDetailKey;
  label: string;
}

const FIELDS: Record<TransportMode, TransportDetailField[]> = {
  FLIGHT: [
    { key: "carrier", label: "Airline" },
    { key: "serviceNumber", label: "Flight number" },
    { key: "seat", label: "Seat" },
    { key: "terminal", label: "Terminal" },
    { key: "gate", label: "Gate" },
  ],
  TRAIN: [
    { key: "carrier", label: "Operator" },
    { key: "serviceNumber", label: "Train number" },
    { key: "coach", label: "Coach" },
    { key: "seat", label: "Seat" },
    { key: "platform", label: "Platform" },
  ],
  BUS: [
    { key: "carrier", label: "Operator" },
    { key: "serviceNumber", label: "Bus number" },
    { key: "seat", label: "Seat" },
  ],
  FERRY: [
    { key: "carrier", label: "Operator" },
    { key: "serviceNumber", label: "Service number" },
    { key: "seat", label: "Seat" },
  ],
  OTHER: [
    { key: "carrier", label: "Operator" },
    { key: "serviceNumber", label: "Service number" },
    { key: "seat", label: "Seat" },
  ],
  CAR: [{ key: "carrier", label: "Hire company" }],
};

/** The fields a mode shows, in form order. */
export function transportDetailFields(mode: TransportMode): TransportDetailField[] {
  return FIELDS[mode].map((f) => ({ ...f }));
}

const LINE_ORDER: { key: TransportDetailKey; word?: string }[] = [
  { key: "carrier" },
  { key: "serviceNumber" },
  { key: "coach", word: "Coach" },
  { key: "seat", word: "Seat" },
  { key: "terminal", word: "Terminal" },
  { key: "gate", word: "Gate" },
  { key: "platform", word: "Platform" },
];

function startsWithWord(value: string, word: string): boolean {
  if (!value.toLowerCase().startsWith(word.toLowerCase())) return false;
  return !/\p{L}/u.test(value.charAt(word.length));
}

/** The one-line summary; "" when nothing applies. */
export function transportDetailsLine(mode: TransportMode, details: TransportDetails): string {
  const shown = new Set(FIELDS[mode].map((f) => f.key));
  const hasNumber = !!details.serviceNumber?.trim();
  const parts: string[] = [];
  for (const { key, word } of LINE_ORDER) {
    if (!shown.has(key)) continue;
    if (key === "carrier" && mode === "FLIGHT" && hasNumber) continue;
    const value = details[key]?.trim();
    if (!value) continue;
    parts.push(word && !startsWithWord(value, word) ? `${word} ${value}` : value);
  }
  return parts.join(" · ");
}

/** All seven keys, trimmed, blank as null. */
export function pickTransportDetails(src: TransportDetails): Record<TransportDetailKey, string | null> {
  const out = {} as Record<TransportDetailKey, string | null>;
  for (const key of TRANSPORT_DETAIL_KEYS) out[key] = src[key]?.trim() || null;
  return out;
}
