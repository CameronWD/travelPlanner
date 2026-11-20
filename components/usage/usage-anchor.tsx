"use client";

import * as React from "react";
import { recordUsageAction } from "@/lib/usage/client";
import type { UsageAction } from "@/lib/usage/lists";

export function UsageAnchor({
  action,
  onClick,
  ...props
}: React.ComponentProps<"a"> & { action: UsageAction }) {
  return (
    <a
      {...props}
      onClick={(e) => {
        recordUsageAction(action);
        onClick?.(e);
      }}
    />
  );
}
