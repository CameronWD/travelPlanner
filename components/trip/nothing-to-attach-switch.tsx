"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { SOMETHING_WENT_WRONG, formError } from "@/components/ui/action-failure";
import { Switch } from "@/components/ui/switch";
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
  const switchId = React.useId();
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
          setError(formError(result) ?? SOMETHING_WENT_WRONG);
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
      <div className="flex items-center gap-3">
        <Switch id={switchId} checked={value} onCheckedChange={toggle} disabled={pending} />
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
