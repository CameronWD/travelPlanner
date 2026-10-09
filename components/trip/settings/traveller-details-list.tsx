"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TravellerAvatar } from "@/components/ui/traveller-avatar";
import { travellerName, type TravellerLike } from "@/lib/traveller";
import { saveTravelNumber } from "@/server/actions/traveller-details";

export interface TravellerDetailsRow {
  userId: string;
  user: TravellerLike & { email: string | null };
  travelNumber: string | null;
  details: { mobile: string | null; emergencyName: string | null; emergencyPhone: string | null; bankDetails: string | null } | null;
}

function TravelNumberField({ tripId, initial }: { tripId: string; initial: string | null }) {
  const id = React.useId();
  const [value, setValue] = React.useState(initial ?? "");
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      className="mt-2 flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await saveTravelNumber(tripId, value);
          setSaved(result.success);
        });
      }}
    >
      <Label htmlFor={id}>Travel number</Label>
      <div className="flex gap-2">
        <Input id={id} value={value} inputMode="tel" maxLength={40} onChange={(e) => { setSaved(false); setValue(e.target.value); }} />
        <Button type="submit" variant="outline" size="md" loading={pending} disabled={pending} aria-label="Save travel number">
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">The number you&apos;ll have on this trip: an eSIM or local SIM.</p>
      {saved && <p role="status" className="text-xs font-semibold text-muted-foreground">Saved.</p>}
    </form>
  );
}

export function TravellerDetailsList({ tripId, rows, currentUserId }: { tripId: string; rows: TravellerDetailsRow[]; currentUserId: string }) {
  return (
    <ul className="mt-4 flex flex-col gap-4 border-t-2 border-border-soft pt-4">
      {rows.map((row) => {
        const name = travellerName(row.user);
        const mine = row.userId === currentUserId;
        const d = row.details;
        const lines: Array<[string, string]> = [];
        if (d?.mobile) lines.push(["Mobile", d.mobile]);
        if (row.travelNumber && !mine) lines.push(["Travel number", row.travelNumber]);
        if (d?.emergencyName || d?.emergencyPhone) lines.push(["Emergency contact", [d?.emergencyName, d?.emergencyPhone].filter(Boolean).join(" · ")]);
        if (d?.bankDetails) lines.push(["Bank details", d.bankDetails]);
        return (
          <li key={row.userId} aria-label={name} className="flex gap-3">
            <TravellerAvatar traveller={row.user} size={32} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{name}</p>
              {lines.length === 0 && !(mine && row.travelNumber) ? (
                <p className="text-xs text-muted-foreground">No details yet</p>
              ) : (
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                  {lines.map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
                      <dd className="whitespace-pre-wrap break-words">{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              {mine && (
                <>
                  <TravelNumberField tripId={tripId} initial={row.travelNumber} />
                  <Link href="/account" className="mt-2 inline-block text-xs font-semibold underline-offset-2 hover:underline">
                    Edit on Account
                  </Link>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
