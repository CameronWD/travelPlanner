"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

export function CopyConfirmationButton({ confirmation }: { confirmation: string }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    void navigator.clipboard.writeText(confirmation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy confirmation number"}
      className="inline-grid size-11 shrink-0 place-items-center rounded-[12px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
    </button>
  );
}
