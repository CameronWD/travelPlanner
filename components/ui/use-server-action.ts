"use client";

import * as React from "react";
import type { ActionResult, FieldErrors } from "@/lib/action-result";

export interface UseServerActionOptions<
  TArgs extends unknown[],
  TSuccess extends object,
> {
  /** Runs after a successful result. Receives the success result + the run() args. */
  onSuccess?: (result: { success: true } & TSuccess, ...args: TArgs) => void;
  /** Runs after a failure result. Receives the field errors + the run() args. */
  onError?: (errors: FieldErrors, ...args: TArgs) => void;
}

/**
 * Wraps a server action in `useTransition`, routing its `ActionResult` into
 * `errors` state (for field display) or the `onSuccess`/`onError` callbacks.
 * `run` is stable across renders; the latest `action`/`options` are read via refs.
 */
export function useServerAction<
  TArgs extends unknown[],
  TSuccess extends object = Record<never, never>,
>(
  action: (...args: TArgs) => Promise<ActionResult<TSuccess>>,
  options?: UseServerActionOptions<TArgs, TSuccess>,
) {
  const [isPending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const actionRef = React.useRef(action);
  const optionsRef = React.useRef(options);

  React.useLayoutEffect(() => {
    actionRef.current = action;
    optionsRef.current = options;
  }, [action, options]);

  const clearErrors = React.useCallback(() => setErrors({}), []);

  const run = React.useCallback((...args: TArgs) => {
    setErrors({});
    startTransition(async () => {
      const result = await actionRef.current(...args);
      if (!result.success) {
        setErrors(result.errors);
        optionsRef.current?.onError?.(result.errors, ...args);
        return;
      }
      optionsRef.current?.onSuccess?.(result, ...args);
    });
  }, []);

  return { run, isPending, errors, clearErrors };
}
