"use client";

import * as React from "react";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { useServerAction } from "@/components/ui/use-server-action";
import type { ActionResult } from "@/lib/action-result";

/**
 * Confirm-then-delete: opens the shared confirm dialog, and only on confirm
 * runs the delete action (via useServerAction). Render the returned `dialog`.
 */
export function useDeleteWithConfirm<TArgs extends unknown[]>(opts: {
  action: (...args: TArgs) => Promise<ActionResult>;
  buildConfirm: (...args: TArgs) => ConfirmOptions;
  onDeleted?: (...args: TArgs) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const optsRef = React.useRef(opts);

  React.useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const { run, isPending } = useServerAction(
    ((...args: TArgs) => optsRef.current.action(...args)) as (...args: TArgs) => Promise<ActionResult>,
    {
      onSuccess: (_result, ...args) => optsRef.current.onDeleted?.(...args),
    },
  );

  const requestDelete = React.useCallback(
    async (...args: TArgs) => {
      const confirmed = await confirm(optsRef.current.buildConfirm(...args));
      if (!confirmed) return;
      run(...args);
    },
    [confirm, run],
  );

  return { requestDelete, isPending, dialog };
}
