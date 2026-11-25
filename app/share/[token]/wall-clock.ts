import { instantToZonedDateISO, instantToZonedTime } from "@/lib/tz";

/** An instant's date and time in a zone, as one comparable string: what the server sends in place of the zone's name. */
export const wallClock = (instant: Date, zone: string) => `${instantToZonedDateISO(instant, zone)} ${instantToZonedTime(instant, zone)}`;
