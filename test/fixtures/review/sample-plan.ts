import type { McpTripPlan } from "@/lib/mcp/reads/trip-plan";

/**
 * A Review's sample plan, in get_trip_plan's shape as a Share link's null
 * viewer reads it (lib/review/input.ts): four nights in Kyoto with a museum
 * on a Monday (closed Mondays), Culture Day on Tuesday 3 November, a note
 * still waiting on a reply, a train still To book, and a Surprise (a hidden
 * Stop's shell and a hidden dinner's placeholder). Unit tests and
 * scripts/review-smoke.ts share it.
 */
export const SAMPLE_TODAY = "2026-10-18";

const KYOTO = { id: "kyoto", name: "Kyoto" };
const SURPRISE = { plannedBy: "Cam", for: ["Xanni"], youAreSurprised: true };
const dayItem = {
  address: null, link: null, booking: null, notes: null, bookingState: "NONE" as const, bookBy: null,
  slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN" as const, openingHours: null, tryList: null,
  owningStop: KYOTO, files: [], surprise: null,
};

export const SAMPLE_PLAN: McpTripPlan = {
  trip: {
    id: "sample-trip", name: "Autumn in Kyoto", startDate: "2026-11-01", endDate: "2026-11-06", hardEndDate: null,
    homeCurrency: "AUD", homeBase: "Sydney", homeTimezone: "Australia/Sydney", roundTrip: false, files: [],
  },
  stops: [
    {
      id: "kyoto", name: "Kyoto", countryCode: "jp", rough: false, nights: 4, arriveDate: "2026-11-01", departDate: "2026-11-05",
      pinned: false, chapterId: null, timezone: "Asia/Tokyo",
      notes: "Ask the ryokan if they can hold our bags on the last day. Still waiting to hear back.",
      accommodations: [
        {
          id: "ryokan", name: "Ryokan Yachiyo", address: "34 Nanzenji Fukuchicho, Sakyo Ward, Kyoto", checkIn: "2026-11-01", checkOut: "2026-11-05",
          confirmation: "YCH-55821", notes: "Late check-in after 21:00 requested, not confirmed yet.", bookingState: "BOOKED", bookBy: null, files: [],
        },
      ],
      thingsToDo: [
        {
          id: "nishiki", title: "Nishiki Market", category: "FOOD", address: "Nishiki Market, Nakagyo Ward, Kyoto", link: null, booking: null, notes: null,
          bookingState: "NONE", bookBy: null, slotTime: null, arriveByMinutes: null, refundable: "UNKNOWN", openingHours: null,
          tryList: [{ id: "tako1", text: "Tako tamago", tried: false }], files: [], surprise: null,
        },
      ],
      days: [
        { date: "2026-11-02", dayTitle: "Museums", items: [
          { ...dayItem, id: "museum", title: "Kyoto National Museum", category: "SIGHTSEEING", startTime: "10:00", endTime: "13:00", address: "527 Chayacho, Higashiyama Ward, Kyoto" },
        ] },
        { date: "2026-11-03", dayTitle: null, items: [
          { ...dayItem, id: "kiyomizu", title: "Kiyomizu-dera", category: "SIGHTSEEING", startTime: "09:00", endTime: "11:00", notes: "Go early, it gets busy." },
          { ...dayItem, id: "gift", title: "Surprise", category: "OTHER", startTime: "19:00", endTime: null, surprise: SURPRISE },
        ] },
        { date: "2026-11-04", dayTitle: null, items: [
          { ...dayItem, id: "tea", title: "Tea ceremony in Gion", category: "ACTIVITY", startTime: "14:00", endTime: "15:30", booking: "TEA-1182", bookingState: "BOOKED", slotTime: "14:00", arriveByMinutes: 10, refundable: "NO" },
        ] },
      ],
      files: [], surprise: null,
    },
    {
      id: "secret", name: "Hakone", countryCode: "jp", rough: false, nights: 1, arriveDate: "2026-11-05", departDate: "2026-11-06",
      pinned: false, chapterId: null, notes: null, timezone: "Asia/Tokyo", accommodations: [], thingsToDo: [], days: [], files: [], surprise: SURPRISE,
    },
  ],
  transports: [
    {
      id: "flight-in", mode: "FLIGHT", from: { home: true }, to: { stopId: "kyoto", name: "Kyoto" }, depPlace: "Sydney (SYD)", arrPlace: "Osaka Kansai (KIX)",
      depAt: "2026-10-31T23:00:00.000Z", arrAt: "2026-11-01T08:30:00.000Z",
      departs: { at: "2026-10-31T23:00:00.000Z", localTime: "10:00", localDate: "2026-11-01", zone: "AEDT" },
      arrives: { at: "2026-11-01T08:30:00.000Z", localTime: "17:30", localDate: "2026-11-01", zone: "JST" },
      dayDelta: 0, reference: "QF-ABC123", notes: null, bookingState: "BOOKED", bookBy: null, files: [],
    },
    {
      id: "train", mode: "TRAIN", from: { stopId: "kyoto", name: "Kyoto" }, to: { stopId: "secret", name: "Hakone" }, depPlace: "Kyoto Station", arrPlace: "Odawara",
      depAt: null, arrAt: null, departs: null, arrives: null, dayDelta: 0, reference: null, notes: null, bookingState: "TO_BOOK", bookBy: null, files: [],
    },
  ],
  chapters: [],
  unplacedDatedItems: [],
  travellers: [
    { id: "u-cam", name: "Cam", role: "owner", you: false },
    { id: "u-xanni", name: "Xanni", role: "traveller", you: false },
  ],
};
