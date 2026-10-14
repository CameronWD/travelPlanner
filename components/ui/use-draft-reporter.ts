"use client";

import * as React from "react";

/**
 * Booking import (Proposal mode, spec 2026-10-14 "Edit"): tells
 * `onDraftChange` the form's would-be input on mount and whenever it changes,
 * for a live preview. Keyed on the serialised input, so a parent re-render
 * that hands in a new callback never re-reports (no effect loop). Without a
 * callback the input is never built.
 */
export function useDraftReporter<T>(onDraftChange: ((input: T) => void) | undefined, buildInput: () => T): void {
  const onDraftChangeRef = React.useRef(onDraftChange);
  React.useLayoutEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  });
  const draftKey = onDraftChange ? JSON.stringify(buildInput()) : "";
  React.useEffect(() => {
    if (draftKey) onDraftChangeRef.current?.(JSON.parse(draftKey) as T);
  }, [draftKey]);
}
