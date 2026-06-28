import { cookies } from "next/headers";
import { DISCREET_COOKIE, DISCREET_LABEL_COOKIE, resolveDiscreetLabel } from "@/lib/discreet";

export interface DiscreetState {
  discreet: boolean;
  label: string;
}

/** Read the device-local discreet flag + label from cookies (server-side). */
export async function getDiscreetState(): Promise<DiscreetState> {
  const store = await cookies();
  const discreet = store.get(DISCREET_COOKIE)?.value === "1";
  const label = resolveDiscreetLabel(store.get(DISCREET_LABEL_COOKIE)?.value);
  return { discreet, label };
}
