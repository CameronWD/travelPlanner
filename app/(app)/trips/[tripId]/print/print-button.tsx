"use client";

/**
 * PrintButton — client component that triggers window.print().
 * Hidden in print media so it doesn't appear in the printed output.
 */

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
    >
      Print / Save as PDF
    </button>
  );
}
