import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/money/currencies";
import { isValidTimeZone } from "@/lib/tz";
import { isoDate, placeId } from "@/lib/validations/primitives";

/** A YYYY-MM-DD date that is optional: a blank string (from an empty date input) is treated as "no date". */
const optionalIsoDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  isoDate.optional(),
);

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const countryCode = z.string().regex(/^[a-zA-Z]{2}$/).transform((c) => c.toLowerCase());

const region = z.string().trim().min(1).max(120);

const tripFields = {
  name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
  startDate: optionalIsoDate,
  endDate: optionalIsoDate,
  hardEndDate: optionalIsoDate,
  homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Select a valid currency." }),
  homeName: z.string().trim().max(120, "Home base must be 120 characters or fewer").optional().or(z.literal("")),
  homePlaceId: placeId.optional(),
  homeLat: latitude.optional(),
  homeLng: longitude.optional(),
  homeCountryCode: countryCode.optional(),
  homeRegion: region.optional(),
  homeTimezone: z.string().trim()
    .refine((zone) => zone === "" || isValidTimeZone(zone), "Pick a timezone from the list.")
    .optional(),
  roundTrip: z.boolean().optional(),
};

const roughStopInput = z
  .object({
    name: z.string().trim().min(1, "Place name is required").max(120, "Place name must be 120 characters or fewer"),
    lat: latitude.optional(),
    lng: longitude.optional(),
    countryCode: countryCode.optional(),
    region: region.optional(),
    placeId: placeId.optional(),
    nights: z.number().int().min(0).max(366).optional(),
  })
  .refine((d) => d.placeId != null || (d.lat === undefined && d.lng === undefined), {
    message: "Coordinates only come with a picked place",
    path: ["lat"],
  });

/** The most Stops New trip creates — typed places, or a Route copy's. */
export const MAX_NEW_TRIP_STOPS = 30;

/** Only New trip sends these; Settings (tripSchema) never does. */
const createOnlyFields = {
  roughMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month").optional(),
  stops: z.array(roughStopInput).max(MAX_NEW_TRIP_STOPS, `Add up to ${MAX_NEW_TRIP_STOPS} places`).optional(),
  fromShareToken: z.string().trim().min(1).max(200).optional(),
};

function withTripRules<
  T extends z.ZodType<{ startDate?: string; endDate?: string; hardEndDate?: string; homePlaceId?: string; homeLat?: number; homeLng?: number }>,
>(schema: T) {
  return schema
    .refine((d) => d.homePlaceId != null || (d.homeLat === undefined && d.homeLng === undefined), {
      message: "Coordinates only come with a picked place",
      path: ["homeLat"],
    })
    .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
      message: "End date must be on or after the start date",
      path: ["endDate"],
    })
    .refine((d) => d.startDate == null || d.hardEndDate == null || d.hardEndDate >= d.startDate, {
      message: "Hard end date must be on or after the start date",
      path: ["hardEndDate"],
    });
}

export const tripSchema = withTripRules(z.object(tripFields));
export type TripInput = z.infer<typeof tripSchema>;

export const createTripSchema = withTripRules(z.object({ ...tripFields, ...createOnlyFields }));
export type CreateTripInput = z.infer<typeof createTripSchema>;
