import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");
const name = z.string().trim().min(1, "Stop name is required").max(120, "Stop name must be 120 characters or fewer");

const roughStopSchema = z.object({
  mode: z.literal("rough"),
  name,
  country: z.string().trim().optional(),
  nights: z.number().int().min(0, "Nights cannot be negative").max(366),
  chapterId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().trim().optional(),
});

const scheduledStopSchema = z
  .object({
    mode: z.literal("scheduled"),
    name,
    country: z.string().trim().optional(),
    timezone: z.string().trim().min(1, "Timezone is required"),
    arriveDate: isoDate,
    departDate: isoDate,
    lat: z.number().optional(),
    lng: z.number().optional(),
    notes: z.string().trim().optional(),
  })
  .refine((d) => d.departDate >= d.arriveDate, {
    message: "Depart date must be on or after arrive date",
    path: ["departDate"],
  });

export const stopSchema = z.discriminatedUnion("mode", [roughStopSchema, scheduledStopSchema]);
export type StopInput = z.infer<typeof stopSchema>;
export type RoughStopInput = z.infer<typeof roughStopSchema>;
export type ScheduledStopInput = z.infer<typeof scheduledStopSchema>;
