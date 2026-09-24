"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PrintButton — client component that triggers window.print().
 * Kit Button with the kit copy (shared/together.jsx PrintView). Hidden in
 * print media so it doesn't appear in the printed output.
 */

export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Download aria-hidden="true" />
      Print or save PDF
    </Button>
  );
}
