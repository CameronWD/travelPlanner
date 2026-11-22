"use client";

import * as React from "react";

const SheetDepthContext = React.createContext(0);

export function SheetDepthProvider({ children }: { children: React.ReactNode }) {
  const depth = React.useContext(SheetDepthContext);
  return <SheetDepthContext.Provider value={depth + 1}>{children}</SheetDepthContext.Provider>;
}

export function useSheetDepth(): number {
  return React.useContext(SheetDepthContext);
}
