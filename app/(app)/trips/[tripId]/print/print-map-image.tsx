"use client";

import { useState } from "react";

export function PrintMapImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="block h-auto w-full break-inside-avoid rounded-lg print:rounded-none"
    />
  );
}
