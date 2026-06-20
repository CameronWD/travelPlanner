import { z } from "zod";

/** YYYY-MM-DD date string regex */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/**
 * Zod schema for creating or updating a Stop.
 *
 * Validates:
 *   - name: non-empty, trimmed, max 120 chars
 *   - country: optional string
 *   - timezone: non-empty IANA timezone string
 *   - arriveDate / departDate: YYYY-MM-DD; departDate must be >= arriveDate
 *   - lat / lng: optional numbers
 *   - notes: optional string
 */
export const stopSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Stop name is required")
      .max(120, "Stop name must be 120 characters or fewer"),
    country: z.string().trim().optional(),
    timezone: z
      .string()
      .trim()
      .min(1, "Timezone is required"),
    arriveDate: isoDate,
    departDate: isoDate,
    lat: z.number().optional(),
    lng: z.number().optional(),
    notes: z.string().trim().optional(),
  })
  .refine((data) => data.departDate >= data.arriveDate, {
    message: "Depart date must be on or after arrive date",
    path: ["departDate"],
  });

export type StopInput = z.infer<typeof stopSchema>;
