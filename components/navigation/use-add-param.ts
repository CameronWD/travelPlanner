"use client";

import type { Route } from "next";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * `?add=<value>` opens a form (spec 2026-10-06 §F) — on arrival and on any
 * later client navigation that adds the param while mounted — then strips
 * `add` from the URL so a reload or Back doesn't reopen it. Tracked the
 * getDerivedStateFromProps way (compare during render, no setState in an
 * effect), as ItineraryManager's `?add=stop` handler does.
 */
export function useAddParam(value: string): [boolean, (open: boolean) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const addParam = searchParams?.get("add") ?? null;
  const [open, setOpen] = React.useState(false);
  const [seen, setSeen] = React.useState<string | null>(null);
  if (addParam !== seen) {
    setSeen(addParam);
    if (addParam === value) setOpen(true);
  }
  React.useEffect(() => {
    if (addParam !== value) return;
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("add");
    const qs = next.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
  }, [addParam, value, searchParams, router, pathname]);
  return [open, setOpen];
}
