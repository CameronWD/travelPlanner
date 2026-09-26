import { ImageResponse } from "next/og";
import { DefaultOgCard, OG_SIZE, ogFonts } from "@/lib/og-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Teepee — plan the trip together";

/** Static at build time (no request data). */
export default async function Image() {
  return new ImageResponse(<DefaultOgCard />, { ...size, fonts: await ogFonts() });
}
