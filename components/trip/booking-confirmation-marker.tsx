"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { SOMETHING_WENT_WRONG, formError } from "@/components/ui/action-failure";
import type { ConfirmationKind } from "@/lib/booking-confirmation";

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
          setError(formError(result) ?? SOMETHING_WENT_WRONG);
          return;
        }
        router.refresh();
      } catch {
        setError(SOMETHING_WENT_WRONG);
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
