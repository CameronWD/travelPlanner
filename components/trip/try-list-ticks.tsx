"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { toastRefused, toastRejected } from "@/components/ui/action-failure";
import { tickTryEntry } from "@/server/actions/items";
import { triedLabel } from "@/lib/try-list";
import type { TryList } from "@/lib/try-list";

/**
 * CONTEXT.md "Try list" on the Day view and Today: tick things off as you go.
 * Shared by everyone on the Trip, so a tick shows for both. Like the
 * Checklist (components/trip/checklist.tsx) a tick shows at once and reverts
 * to the server's answer when the action settles, so a refusal rolls it back.
 */
export function TryListTicks({ itemId, itemTitle, list }: { itemId: string; itemTitle: string; list: TryList }) {
  const [shown, setShown] = React.useOptimistic(list, (state, u: { id: string; tried: boolean }) =>
    state.map((e) => (e.id === u.id ? { ...e, tried: u.tried } : e)),
  );

  function tick(id: string, tried: boolean) {
    React.startTransition(async () => {
      setShown({ id, tried });
      try {
        const r = await tickTryEntry(itemId, id, tried);
        if (!r.success) toastRefused(r.errors, "Couldn't tick that.");
      } catch {
        toastRejected("Couldn't tick that.");
      }
    });
  }

  return (
    <div data-slot="try-list" className="mt-1.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Try list · {triedLabel(shown)}</p>
      <ul aria-label={`Try list for ${itemTitle}`} className="flex flex-col">
        {shown.map((e) => (
          <li key={e.id}>
            <Checkbox label={e.text} checked={e.tried} onChange={(ev) => tick(e.id, ev.target.checked)} className="text-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}
