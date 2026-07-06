import { z } from "zod";
import { categorySchema } from "@/lib/categories";
import { safeWebHref } from "@/lib/url";

/** "" | undefined -> undefined; otherwise the trimmed string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v));

/**
 * Zod schema for creating/updating a Marker on the Globe.
 *
 * `title` + `category` are the only required fields. Location fields
 * (lat/lng/city/country/countryCode) are auto-derived on the client from a
 * chosen geocode candidate and passed through here; they are optional because
 * a Marker with no resolvable location is still valid (it shows in the list,
 * not on the map). `timing` is the rough free-text "when" — never a date.
 */
export const markerSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(140, "Title must be 140 characters or fewer"),
  category: categorySchema,
  note: optionalText(2000),
  link: z
    .string()
    .trim()
    .optional()
    .refine((v) => v == null || v === "" || safeWebHref(v) !== null, {
      message: "Link must be a valid web address (http/https)",
    })
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  timing: optionalText(120),
  lat: z.number().optional(),
  lng: z.number().optional(),
  city: optionalText(140),
  country: optionalText(140),
  // ISO 3166-1 alpha-2, lowercase as Nominatim returns it.
  countryCode: z
    .string()
    .trim()
    .length(2)
    .toLowerCase()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
});

/** Pre-transform input type (what callers pass). */
export type MarkerInput = z.input<typeof markerSchema>;
/** Post-parse type (internal use). */
export type MarkerOutput = z.output<typeof markerSchema>;
