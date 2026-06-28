import type { Metadata } from "next";
import { requireUser } from "@/lib/guards";
import { getDiscreetState } from "@/lib/discreet-server";
import { NewTripForm } from "./new-trip-form";

export async function generateMetadata(): Promise<Metadata> {
  const { discreet, label } = await getDiscreetState();
  return { title: discreet ? label : "New trip · TEEPEE" };
}

export default async function NewTripPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-lg space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          New trip
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give it a name, set your dates, and choose your home currency.
        </p>
      </div>

      <NewTripForm />
    </div>
  );
}
