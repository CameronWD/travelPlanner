"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTripCover, removeTripCover } from "@/server/actions/cover";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

export function CoverImageField({ tripId, hasCover }: { tripId: string; hasCover: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("tripId", tripId);
    fd.set("file", file);
    startTransition(async () => {
      const r = await setTripCover(fd);
      if (!r.success) toast({ variant: "destructive", title: r.error });
      else router.refresh();
    });
  }

  function onRemove() {
    startTransition(async () => {
      const r = await removeTripCover(tripId);
      if (!r.success) toast({ variant: "destructive", title: r.error });
      else router.refresh();
    });
  }

  return (
    <Field
      label="Cover photo"
      description="Shown on your trips list and the trip's home. Leave empty to use the auto route render."
    >
      <div className="flex items-center gap-3">
        <Input type="file" accept="image/*" onChange={onFile} disabled={isPending} />
        {hasCover && (
          <Button type="button" variant="ghost" onClick={onRemove} disabled={isPending}>
            Remove
          </Button>
        )}
      </div>
    </Field>
  );
}
