import { z } from "zod";
import { CATEGORY_VALUES } from "@/lib/categories";

/** Server-side validation of an Item/Marker category (moved out of lib/categories so its client importers don't ship zod — spec 2026-10-06 §R). */
export const categorySchema = z.enum(CATEGORY_VALUES);
