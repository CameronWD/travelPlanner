import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewTripForm } from "./new-trip-form";

export const metadata = {
  title: "New trip · Trip Planner",
};

export default async function NewTripPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

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
