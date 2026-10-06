"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isTripHomePath } from "@/components/shell/app-paths";

/**
 * Renders its children only on a Trip's Home (/trips/:id exactly). The trip
 * layout's header is shared by every trip route; this lets it carry a
 * Home-only piece (the phone portrait cover frame, spec 2026-10-05 §I)
 * without the layout knowing the route — same pathname test as
 * TripHeaderFrame.
 */
export function TripHomeOnly({ children }: { children: ReactNode }) {
  return isTripHomePath(usePathname()) ? <>{children}</> : null;
}
