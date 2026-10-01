import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { REQUEST_PATH_HEADER, signInHref } from "@/lib/sign-in-href";

/**
 * The one signed-out exit for every guard (app and focus layouts,
 * requireUser): to the Landing, carrying the requested page so sign-in
 * returns there. Reads the path from the header proxy.ts set — a server
 * component has no URL of its own, and `referer` is never trusted.
 */
export async function signInRedirect(): Promise<never> {
  const path = (await headers()).get(REQUEST_PATH_HEADER);
  redirect(signInHref(path));
}
