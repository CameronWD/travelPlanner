import { ImageResponse } from "next/og";
import { DefaultOgCard, OG_SIZE, ogFonts } from "@/lib/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Teepee: your whole trip, in one place";

/** Static at build time (no request data). */
export default async function Image() {
  return new ImageResponse(<DefaultOgCard />, { ...size, fonts: await ogFonts() });
}
