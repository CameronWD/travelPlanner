// The edit dialogs and the details sheet are a centred dialog from here up, a bottom sheet below.
export const DESKTOP_QUERY = "(min-width: 640px)";

// Without matchMedia the dialogs fall back to the phone layout, so this does too.
export function isPhoneViewport(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : !window.matchMedia(DESKTOP_QUERY).matches;
}
