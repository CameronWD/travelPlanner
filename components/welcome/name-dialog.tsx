"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setDisplayName } from "@/server/actions/profile";

export const NAME_DIALOG_COPY = {
  title: "What should we call you?",
  body: "This is the name the people on your Trips will see. You can change it any time on Account.",
  label: "Display name",
  button: "Save",
  blank: "Enter a name to carry on.",
  failed: "Couldn't save that — please try again.",
} as const;

/** Same ceiling as setDisplayName (server/actions/profile.ts DISPLAY_NAME_MAX). */
const MAX = 60;

/**
 * "Every Traveller has a name" (CONTEXT.md "Profile photo and display name";
 * spec 2026-10-04 §E). Mounted by the (app) layout on every signed-in page
 * while the Traveller has neither a display name nor a provider name — a
 * Sign-in link carries none. It opens on mount and cannot be dismissed: no
 * close button, and Escape and outside taps are swallowed. The only way out
 * is a saved name.
 *
 * A blank name is refused here rather than sent: setDisplayName treats ""
 * as "clear it", which would leave the Traveller nameless. Once the save
 * lands, the action's layout revalidation re-renders the page, so a gate
 * like WelcomeGate brings on whatever it was holding back if it's still
 * owed. The dialog also closes itself on success, so it never lingers
 * waiting for that re-render.
 */
export function NameDialog() {
  const [open, setOpen] = React.useState(true);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(NAME_DIALOG_COPY.blank);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await setDisplayName(trimmed);
      if (!result.success) {
        setError(result.errors.displayName?.[0] ?? result.errors._?.[0] ?? NAME_DIALOG_COPY.failed);
        return;
      }
      setOpen(false);
    } catch {
      // Offline or a dropped request: stay open with the name still typed.
      setError(NAME_DIALOG_COPY.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    // No onOpenChange: nothing Radix reports can close it.
    <Dialog open={open}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-[26px]">{NAME_DIALOG_COPY.title}</DialogTitle>
        <DialogDescription className="text-[15px] font-medium leading-[1.5] text-foreground">
          {NAME_DIALOG_COPY.body}
        </DialogDescription>
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <Field label={NAME_DIALOG_COPY.label} error={error ?? undefined}>
            <Input
              value={name}
              maxLength={MAX}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" size="lg" loading={saving}>
              {NAME_DIALOG_COPY.button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
