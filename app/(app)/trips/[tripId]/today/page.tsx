import { redirect } from "next/navigation";

/** The Today view is now the Travelling phase of the trip Home. */
export default async function TodayRedirect({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  redirect(`/trips/${tripId}`);
}
