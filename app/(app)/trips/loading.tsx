"use client";

import { usePathname } from "next/navigation";
import { LogoLoader } from "@/components/ui/logo-loader";
import { TripsSkeleton } from "@/components/trips/trips-skeleton";

export default function TripsLoading() {
  const pathname = usePathname();
  return pathname === "/trips" ? <TripsSkeleton /> : <LogoLoader />;
}
