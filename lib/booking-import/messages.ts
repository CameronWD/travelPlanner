/**
 * Every Traveller-facing string of the Booking import (spec 2026-10-14
 * "Failures"). Zod-free: the sheet and the server share it. The spec's
 * "The reader's busy right now — try again…" and "…in this booking — check
 * it…" are split into two sentences: copy here never uses an em-dash
 * (test/copy-style.test.ts).
 */
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";

const sentence = (s: string) => s.trim().replace(/[.!\s]+$/, "");

export const BOOKING_IMPORT_MESSAGES = {
  unreadable: "We couldn't read that file. Try a screenshot of the booking instead.",
  notBooking: (reason: string | null) =>
    reason && sentence(reason) ? `This doesn't look like a booking: ${sentence(reason)}.` : "This doesn't look like a booking.",
  nothingUsable: "Nothing we could add from this booking. Add it yourself from the plan.",
  partial: "We may have missed something in this booking. Check it against the original.",
  rateLimited: (minutes: number) =>
    `You've done a lot of imports this hour. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  busy: "The reader's busy right now. Try again in a minute.",
  generic: "Something went wrong reading that booking. Try again later.",
  disabled: "Booking import isn't switched on.",
  blocked: "This belongs to a Stop you can't add to",
  heic: "HEIC photos can't be read here: share it as a screenshot or JPEG instead.",
  msg: "Outlook .msg files can't be read here: forward it or paste the text instead.",
  wrongType: "That file type can't be read. Use a PDF, a screenshot or photo, or an .eml email, or paste the text.",
  tooBig: "That file is over 10 MB. Try a smaller copy or a screenshot of the booking.",
  tooManyPages: "That PDF has more than 30 pages. Save just the pages with the booking and try again.",
  emptyText: "Paste the booking text, or choose a file.",
  textTooLong: (length: number) =>
    `That text is too long (${length.toLocaleString()} characters). Paste at most ${MAX_BOOKING_TEXT_CHARS.toLocaleString()} characters of the confirmation. Leave out the rest of the email thread.`,
  duplicate: (label: string) => `You may already have this: ${label}.`,
  unsupportedCurrency: (amount: string, currency: string) =>
    `The price is ${amount} ${currency}, a currency Teepee can't track yet. Add the cost yourself.`,
  homeTimezoneGuess: (homeName: string, zone: string) =>
    `Your Home base has no time zone set, so times at ${homeName} use ${zone}. Set it in Trip settings to be sure.`,
  homeTimezoneUnknown: (homeName: string) =>
    `Your Home base has no time zone set, so times at ${homeName} may be off. Set it in Trip settings.`,
  onlyDepartureDate: (day: string) => `Only the departure date (${day}) is printed. Add the time.`,
  onlyArrivalDate: (day: string) => `Only the arrival date (${day}) is printed. Add the time.`,
  roughStop: (stopName: string) => `${stopName} has no dates yet, so check this fits.`,
  departsOutsideStay: (stopName: string) => `This leaves on a day outside your stay in ${stopName}.`,
  arrivesOutsideStay: (stopName: string) => `This arrives on a day outside your stay in ${stopName}.`,
  itemOutsideStay: (stopName: string, day: string) => `This is on ${day}, outside your stay in ${stopName}.`,
  stopTimezoneUnknown: "We couldn't tell this Stop's time zone. Check it before you confirm.",
  attachFailed: "Added, but we couldn't attach the original file.",
} as const;
