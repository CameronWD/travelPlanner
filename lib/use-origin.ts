import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

// "" on the server and in the hydration pass, so markup that prints an absolute
// URL matches what the server sent; the real origin follows straight after.
export function useOrigin(): string {
  return useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
}
