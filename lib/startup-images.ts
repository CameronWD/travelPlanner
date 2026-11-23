export const STARTUP_SIZES = [
  { width: 440, height: 956, ratio: 3, safeTop: 62 },
  { width: 430, height: 932, ratio: 3, safeTop: 59 },
  { width: 428, height: 926, ratio: 3, safeTop: 47 },
  { width: 420, height: 912, ratio: 3, safeTop: 62 },
  { width: 414, height: 896, ratio: 3, safeTop: 44 },
  { width: 414, height: 896, ratio: 2, safeTop: 48 },
  { width: 402, height: 874, ratio: 3, safeTop: 62 },
  { width: 393, height: 852, ratio: 3, safeTop: 59 },
  { width: 390, height: 844, ratio: 3, safeTop: 47 },
  { width: 375, height: 812, ratio: 3, safeTop: 44 },
  { width: 375, height: 667, ratio: 2, safeTop: 20 },
] as const;

export type StartupSize = (typeof STARTUP_SIZES)[number];
export type StartupTheme = "light" | "dark";

export const STARTUP_THEMES = {
  light: { background: "#FFFBF3", ink: "#1D1D1B" },
  dark: { background: "#211F1B", ink: "#EDE6D8" },
} as const;

export function startupImageName(size: StartupSize, theme: StartupTheme): string {
  return `iphone-${size.width}x${size.height}@${size.ratio}x-${theme}.png`;
}

export function startupImageMedia(size: StartupSize, theme: StartupTheme): string {
  return `(device-width: ${size.width}px) and (device-height: ${size.height}px) and (-webkit-device-pixel-ratio: ${size.ratio}) and (orientation: portrait) and (prefers-color-scheme: ${theme})`;
}

export function startupImages(): { url: string; media: string }[] {
  return STARTUP_SIZES.flatMap((size) =>
    (["light", "dark"] as const).map((theme) => ({
      url: `/splash/${startupImageName(size, theme)}`,
      media: startupImageMedia(size, theme),
    })),
  );
}

export const LAUNCH_TARGET = "/";

export const LOADER_MARK_SIZE = 56;
export const LOADER_WORD_HEIGHT = 40 * 0.814;
export const LOADER_GAP = 12;
export const LOADER_TOP_BAR = 57;
export const LOADER_CENTRE_OF_VIEWPORT = 0.3;
