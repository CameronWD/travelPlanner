import { z } from "zod";

/**
 * Traveller details (CONTEXT.md; spec 2026-10-02 §E). Every field is
 * optional free text — a phone number is whatever the Traveller types —
 * trimmed, with "" becoming null so a cleared field reads as "not given".
 */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const travellerDetailsSchema = z.object({
  mobile: optionalText(40),
  emergencyName: optionalText(80),
  emergencyPhone: optionalText(40),
  bankDetails: optionalText(500),
});

export type TravellerDetailsInput = z.input<typeof travellerDetailsSchema>;

export const travelNumberSchema = z.string().trim().max(40);
