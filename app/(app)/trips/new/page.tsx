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
    <div className="mx-auto w-full max-w-[64rem] space-y-8 px-0">
      {/* Page header */}
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em] lg:text-4xl">
          {past ? "Log a past trip" : "New trip"}
        </h1>
        <p className="mt-1.5 max-w-reading text-[15px] font-medium text-muted-foreground">
          {past
            ? "Name it and say when you went. It goes on your map and counts toward your tally."
            : "Name it, pick a currency, and add dates and a home base if you have them. Everything else can wait."}
        </p>
      </div>

      <NewTripForm past={past} />
    </div>
  );
}
