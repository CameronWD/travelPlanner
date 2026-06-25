import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TEEPEE",
    short_name: "TEEPEE",
    description: "A place to house your travel.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBF6EF",
    theme_color: "#F2674A",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
