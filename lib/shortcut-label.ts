/**
 * The platform's Search shortcut, as shown in tooltips: "⌘K" on Apple
 * platforms, "Ctrl K" everywhere else (and on the server, where there is no
 * navigator — callers that render it should read it after hydration).
 */
export function shortcutLabel(): "⌘K" | "Ctrl K" {
  if (typeof navigator === "undefined") return "Ctrl K";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘K" : "Ctrl K";
}
