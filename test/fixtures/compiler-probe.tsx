"use client";

import * as React from "react";

/** Counts Child renders, to prove app code runs through the React Compiler in tests (spec 2026-10-06 §I). */
export const probe = { childRenders: 0 };

function Child() {
  // eslint-disable-next-line react-hooks/immutability -- a test probe that counts its own renders
  probe.childRenders += 1;
  return <span>child</span>;
}

/** Compiled, the `<Child />` element is memoised, so a parent re-render skips Child. */
export function CompilerProbe() {
  const [n, setN] = React.useState(0);
  return (
    <>
      <button type="button" onClick={() => setN(n + 1)}>{n}</button>
      <Child />
    </>
  );
}
