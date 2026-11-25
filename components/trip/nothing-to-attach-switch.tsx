"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { NOTHING_CHANGED, SOMETHING_WENT_WRONG, formError } from "@/components/ui/action-failure";
import { cn } from "@/lib/cn";
import type { ConfirmationKind } from "@/lib/booking-confirmation";

export function NothingToAttachSwitch({
  kind,
  id,
  value,
  onChange,
  className,
}: {
  kind: ConfirmationKind;
  id: string;
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    onChange(next);
    startTransition(async () => {
      try {
        const result = await setNothingToAttach(kind, id, next);
        if (!result.success) {
          onChange(!next);
          setError(formError(result) ?? NOTHING_CHANGED);
          return;
        }
        router.refresh();
      } catch {
        onChange(!next);
        setError(SOMETHING_WENT_WRONG);
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => toggle(e.target.checked)}
          disabled={pending}
          className="size-4 rounded border-input accent-primary"
        />
        No ticket or file needed
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
