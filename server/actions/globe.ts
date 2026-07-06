"use server";

import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireGlobeAccess } from "@/lib/globe";
import { markerSchema, type MarkerInput } from "@/lib/validations/marker";
import { searchPlaces, reverseGeocode, type GeoCandidate } from "@/lib/geocode";

export type GlobeActionResult =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

function validationErrors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: z.ZodError<any>,
): GlobeActionResult {
  const flat = error.flatten();
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(flat.fieldErrors as Record<string, string[] | undefined>)) {
    fieldErrors[k] = v ?? [];
  }
  // Surface form-level errors (e.g. from a string schema) under "_" key.
  if (flat.formErrors.length > 0) {
    fieldErrors["_"] = flat.formErrors;
  }
  return { success: false, errors: fieldErrors };
}

/** Verify a marker exists and belongs to the current user's globe. */
async function requireMarkerOnGlobe(markerId: string, globeId: string) {
  const marker = await db.marker.findUnique({
    where: { id: markerId },
    select: { id: true, globeId: true },
  });
  if (!marker || marker.globeId !== globeId) notFound();
  return marker;
}

/** Map validated MarkerOutput fields to the db columns (create + update share). */
function markerData(parsed: {
  title: string;
  category: string;
  note?: string;
  link?: string;
  timing?: string;
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
  countryCode?: string;
}) {
  return {
    title: parsed.title,
    category: parsed.category,
    note: parsed.note ?? null,
    link: parsed.link ?? null,
    timing: parsed.timing ?? null,
    lat: parsed.lat ?? null,
    lng: parsed.lng ?? null,
    city: parsed.city ?? null,
    country: parsed.country ?? null,
    countryCode: parsed.countryCode ?? null,
  };
}

// --- Geocoding proxies (server-side so Nominatim gets our User-Agent) --------

export async function searchPlacesAction(query: string): Promise<GeoCandidate[]> {
  await requireGlobeAccess(); // access-gate; also lazily creates the globe
  return searchPlaces(query);
}

export async function reverseGeocodeAction(
  lat: number,
  lng: number,
): Promise<GeoCandidate | null> {
  await requireGlobeAccess();
  return reverseGeocode(lat, lng);
}

// --- Marker CRUD -------------------------------------------------------------

export async function createMarker(input: MarkerInput): Promise<GlobeActionResult> {
  const { user, globe } = await requireGlobeAccess();
  const parsed = markerSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  await db.marker.create({
    data: { ...markerData(parsed.data), globeId: globe.id, createdById: user.id },
  });
  revalidatePath("/globe");
  return { success: true };
}

export async function updateMarker(
  markerId: string,
  input: MarkerInput,
): Promise<GlobeActionResult> {
  const { globe } = await requireGlobeAccess();
  await requireMarkerOnGlobe(markerId, globe.id);
  const parsed = markerSchema.safeParse(input);
  if (!parsed.success) return validationErrors(parsed.error);

  await db.marker.update({ where: { id: markerId }, data: markerData(parsed.data) });
  revalidatePath("/globe");
  return { success: true };
}

export async function deleteMarker(markerId: string): Promise<GlobeActionResult> {
  const { globe } = await requireGlobeAccess();
  await requireMarkerOnGlobe(markerId, globe.id);
  await db.marker.delete({ where: { id: markerId } });
  revalidatePath("/globe");
  return { success: true };
}

// --- Invite ------------------------------------------------------------------

const inviteEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export async function inviteToGlobe(email: string): Promise<GlobeActionResult> {
  const { globe } = await requireGlobeAccess();
  const parsed = inviteEmailSchema.safeParse(email);
  if (!parsed.success) return validationErrors(parsed.error);

  try {
    await db.globeInvite.create({
      data: { globeId: globe.id, email: parsed.data, token: randomUUID(), role: "member" },
    });
  } catch (err) {
    // Already invited (unique [globeId, email]) — treat as success (idempotent).
    if (isUniqueConstraintError(err)) return { success: true };
    throw err;
  }
  revalidatePath("/globe");
  return { success: true };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
