import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currencies";

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/** A YYYY-MM-DD date that is optional: a blank string (from an empty date input) is treated as "no date". */
const optionalIsoDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  isoDateString.optional(),
);

const tripFields = {
  name: z.string().trim().min(1, "Trip name is required").max(120, "Trip name must be 120 characters or fewer"),
  startDate: optionalIsoDate,
  endDate: optionalIsoDate,
  hardEndDate: optionalIsoDate,
  homeCurrency: z.enum(CURRENCY_CODES as [string, ...string[]], { error: "Please select a valid currency" }),
  homeName: z.string().trim().max(120, "Home base must be 120 characters or fewer").optional().or(z.literal("")),
  roundTrip: z.boolean().optional(),
};

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const countryCode = z.string().regex(/^[a-zA-Z]{2}$/).transform((c) => c.toLowerCase());

const roughStopInput = z.object({
  name: z.string().trim().min(1, "Place name is required").max(120, "Place name must be 120 characters or fewer"),
  lat: latitude.optional(),
  lng: longitude.optional(),
  countryCode: countryCode.optional(),
  nights: z.number().int().min(0).max(366).optional(),
});

/** Only New trip sends these; Settings (tripSchema) never does. */
const createOnlyFields = {
  roughMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month").optional(),
  homeLat: latitude.optional(),
  homeLng: longitude.optional(),
  homeCountryCode: countryCode.optional(),
  stops: z.array(roughStopInput).max(30, "Add up to 30 places").optional(),
  fromShareToken: z.string().trim().min(1).max(200).optional(),
};

function withDateRules<T extends z.ZodType<{ startDate?: string; endDate?: string; hardEndDate?: string }>>(schema: T) {
  return schema
    .refine((d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate, {
      message: "End date must be on or after the start date",
      path: ["endDate"],
    })
    .refine((d) => d.startDate == null || d.hardEndDate == null || d.hardEndDate >= d.startDate, {
      message: "Hard end date must be on or after the start date",
      path: ["hardEndDate"],
    });
}

export const tripSchema = withDateRules(z.object(tripFields));
export type TripInput = z.infer<typeof tripSchema>;

export const createTripSchema = withDateRules(z.object({ ...tripFields, ...createOnlyFields }));
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type RoughStopInput = z.infer<typeof roughStopInput>;
