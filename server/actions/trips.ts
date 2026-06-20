"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { createTripSchema, type CreateTripInput } from "@/lib/validations/trip";

export type CreateTripResult =
  | { success: true; tripId: string }
  | { success: false; errors: Record<string, string[]> };

/**
 * Server action: validate input, create a Trip and an owner TripMember for the
 * current user in a transaction, then redirect to the new trip overview.
 *
 * Returns a typed error result on validation failure so the form can show
 * errors inline. On success it redirects (Next.js redirect throws, so it never
 * actually returns the success object in production — but it's typed for test
 * purposes).
 */
export async function createTrip(
  input: CreateTripInput,
): Promise<CreateTripResult> {
  const user = await requireUser();

  const parsed = createTripSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, msgs] of Object.entries(
      parsed.error.flatten().fieldErrors,
    )) {
      fieldErrors[key] = msgs ?? [];
    }
    return { success: false, errors: fieldErrors };
  }

  const { name, startDate, endDate, homeCurrency } = parsed.data;

  const trip = await db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        name,
        startDate,
        endDate,
        homeCurrency,
        createdById: user.id,
      },
    });

    await tx.tripMember.create({
      data: {
        tripId: newTrip.id,
        userId: user.id,
        role: "owner",
      },
    });

    return newTrip;
  });

  redirect(`/trips/${trip.id}`);

  // TypeScript: redirect() throws, but the return type still needs to match.
  // This line is unreachable in practice.
  return { success: true, tripId: trip.id };
}
