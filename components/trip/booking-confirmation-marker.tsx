"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { formError } from "@/components/ui/action-failure";
import type { ConfirmationKind } from "@/lib/booking-confirmation";

const SAVE_FAILED = "Couldn't save that. Try again.";

export function BookingConfirmationMarker({ kind, id }: { kind: ConfirmationKind; id: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function nothingToAttach() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setNothingToAttach(kind, id, true);
        if (!result.success) {
          setError(formError(result) ?? SAVE_FAILED);
          return;
        }
        router.refresh();
      } catch {
        setError(SAVE_FAILED);
      }
    });
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span>No booking confirmation yet</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        disabled={pending}
        onClick={nothingToAttach}
        className="font-semibold underline underline-offset-2 hover:text-foreground disabled:opacity-60"
      >
        Nothing to attach
      </button>
      {error && (
        <span role="alert" className="basis-full text-destructive">
          {error}
        </span>
      )}
    </p>
  );
}
