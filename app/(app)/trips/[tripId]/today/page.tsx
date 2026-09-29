import { redirect } from "next/navigation";
import { tripSlugFor } from "@/lib/trip-slug-read";
import { tripPath } from "@/lib/trip-path";

/** The Today view is now the Travelling phase of the trip Home. */
export default async function TodayRedirect({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  redirect(tripPath(await tripSlugFor(tripId)));
}
