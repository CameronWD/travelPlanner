"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { formError } from "@/components/ui/action-failure";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { ConfirmationKind } from "@/lib/booking-confirmation";

const SAVE_FAILED = "Couldn't save that. Try again.";

export function NothingToAttachSwitch({
  kind,
  id,
  value,
  className,
}: {
  kind: ConfirmationKind;
  id: string;
  value: boolean;
  className?: string;
}) {
  const router = useRouter();
  const switchId = React.useId();
  const [pending, startTransition] = React.useTransition();
  const [checked, setChecked] = React.useState(value);
  const [error, setError] = React.useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      try {
        const result = await setNothingToAttach(kind, id, next);
        if (!result.success) {
          setChecked(!next);
          setError(formError(result) ?? SAVE_FAILED);
          return;
        }
        router.refresh();
      } catch {
        setChecked(!next);
        setError(SAVE_FAILED);
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-3">
        <Switch id={switchId} checked={checked} onCheckedChange={toggle} disabled={pending} />
        <label htmlFor={switchId} className="text-sm font-semibold">
          Nothing to attach
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
