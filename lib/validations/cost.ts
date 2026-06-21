import { z } from "zod";
import { COST_OWNER_TYPES, costOwnerTypeSchema } from "@/lib/enums";
import { CURRENCY_CODES } from "@/lib/currencies";

// ---------------------------------------------------------------------------
// Cost schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for creating or updating a Cost.
 *
 * Rules:
 *  - `estimatedMinor` must be a non-negative integer (always required).
 *  - `actualMinor` is optional but must be a non-negative integer if provided.
 *  - `currency` must be a 3-letter ISO 4217 code from the supported list.
 *  - `paidAt` is optional — accepts an ISO date/datetime string and coerces to Date.
 *  - `ownerType` is one of COST_OWNER_TYPES.
 *  - `ownerId` is REQUIRED when ownerType !== 'OTHER'; ignored/absent when OTHER.
 *  - `label` is REQUIRED when ownerType === 'OTHER'; optional otherwise.
 *  - `category` is optional (used for OTHER costs, but accepted on any).
 */
export const costSchema = z
  .object({
    estimatedMinor: z
      .number()
      .int("Estimated amount must be a whole number in minor units")
      .min(0, "Estimated amount must be 0 or greater")
      // Cap at 32-bit signed max: Prisma maps Int to Postgres INTEGER, so a
      // larger value would error on insert in production (SQLite is laxer).
      .max(2_147_483_647, "Amount is too large"),

    actualMinor: z
      .number()
      .int("Actual amount must be a whole number in minor units")
      .min(0, "Actual amount must be 0 or greater")
      .max(2_147_483_647, "Amount is too large")
      .optional(),

    currency: z
      .string()
      .length(3, "Currency must be a 3-letter ISO 4217 code")
      .toUpperCase()
      .refine((c) => CURRENCY_CODES.includes(c), {
        message: "Unsupported currency code",
      }),

    paidAt: z
      .string()
      .datetime({ offset: true, message: "paidAt must be an ISO datetime string" })
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "paidAt must be YYYY-MM-DD or ISO datetime"))
      .transform((s) => new Date(s))
      .optional(),

    ownerType: costOwnerTypeSchema,

    ownerId: z.string().trim().min(1, "Owner ID must not be empty").optional(),

    label: z.string().trim().min(1, "Label must not be empty").optional(),

    category: z.string().trim().optional(),
  })
  // ownerId is required for entity costs (not OTHER)
  .refine(
    (data) => {
      if (data.ownerType !== "OTHER" && !data.ownerId) {
        return false;
      }
      return true;
    },
    {
      message: "ownerId is required for TRANSPORT, ACCOMMODATION, and ITEM costs",
      path: ["ownerId"],
    },
  )
  // label is required for OTHER costs
  .refine(
    (data) => {
      if (data.ownerType === "OTHER" && !data.label) {
        return false;
      }
      return true;
    },
    {
      message: "label is required for OTHER costs",
      path: ["label"],
    },
  );

/** The type after parsing + transforms. */
export type CostInput = z.infer<typeof costSchema>;

/** The raw input type before parsing — this is what callers pass in. */
export type CostRawInput = z.input<typeof costSchema>;

// Re-export for convenience
export { COST_OWNER_TYPES };
