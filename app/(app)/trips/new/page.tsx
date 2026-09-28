import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { NewTripForm } from "./new-trip-form";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ past?: string }>;
}): Promise<Metadata> {
  const past = (await searchParams).past === "1";
  return { title: past ? "Log a past trip" : "New trip" };
}

export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ past?: string }>;
}) {
  await requireUser();

  const past = (await searchParams).past === "1";

  return (
    <div className="mx-auto w-full max-w-[64rem] space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">
          {past ? "Log a past trip" : "New trip"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {past
            ? "Name it and say when you went. It goes on your map and counts toward your tally."
            : "Give it a name, set your dates, and choose your home currency."}
        </p>
      </div>

      <NewTripForm past={past} />
    </div>
  );
}
