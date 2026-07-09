"use client";

import * as React from "react";
import { useServerAction } from "@/components/ui/use-server-action";
import type { ActionResult } from "@/lib/action-result";

/**
 * The shared submit cycle for an entity create/edit form: prevent default,
 * clear errors, run the (create|update) thunk, then close + notify on success
 * or surface field errors on failure. Pair with `<FormDialog>`.
 */
export function useEntityForm<TSuccess extends object = Record<never, never>>(opts: {
  /** Builds the input and dispatches create OR update; returns the ActionResult. */
  submit: () => Promise<ActionResult<TSuccess>>;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const optsRef = React.useRef(opts);

  React.useLayoutEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const { run, isPending, errors } = useServerAction(
    () => optsRef.current.submit(),
    {
      onSuccess: () => {
        optsRef.current.onClose?.();
        optsRef.current.onSaved?.();
      },
    },
  );

  const onSubmit = React.useCallback((e: React.FormEvent) => {
    e.preventDefault();
    run();
  }, [run]);

  return { errors, isPending, onSubmit };
}
