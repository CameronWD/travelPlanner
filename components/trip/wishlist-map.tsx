"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useTheme } from "@/components/ui/theme-provider";
import { GoogleMapFrame } from "@/components/map/google-map-frame";
import { HtmlPin } from "@/components/map/html-pin";
import { MapUnavailable } from "@/components/map/map-unavailable";
import { useFitBounds } from "@/components/map/use-fit-bounds";
import { pinHex, pinHtml } from "@/lib/map/pins";

export interface WishlistMapItem {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
}

export interface WishlistMapProps {
  items: WishlistMapItem[];
  onSelect: (id: string) => void;
}

function WishlistItemList({ items, onSelect }: WishlistMapProps) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <button type="button" onClick={() => onSelect(item.id)} className="text-left font-bold hover:underline">
            {item.title}
          </button>
        </li>
      ))}
    </ol>
  );
}

function FitItems({ items }: { items: WishlistMapItem[] }) {
  useFitBounds(items, { padding: 40 });
  return null;
}

export function WishlistMap({ items, onSelect }: WishlistMapProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No map locations yet."
        description="Add places with coordinates to see them on the map."
      />
    );
  }

  return (
    <GoogleMapFrame
      role="region"
      aria-label="Wishlist map"
      dark={isDark}
      fallback={<MapUnavailable><WishlistItemList items={items} onSelect={onSelect} /></MapUnavailable>}
      className="h-52 w-full overflow-hidden rounded-lg border-2 border-border shadow-hard-2 sm:h-[360px]"
    >
      <FitItems items={items} />
      {items.map((item) => (
        <HtmlPin
          key={item.id}
          position={{ lat: item.lat, lng: item.lng }}
          html={pinHtml({ variant: "category", fill: pinHex(item.category, isDark), dark: isDark })}
          title={item.title}
          onClick={() => {
            setOpenId(item.id);
            onSelect(item.id);
          }}
          open={openId === item.id}
          onClose={() => setOpenId(null)}
        >
          <div className="min-w-[min(140px,80vw)] max-w-[min(240px,90vw)] leading-normal">
            <strong className="text-sm">{item.title}</strong>
          </div>
        </HtmlPin>
      ))}
    </GoogleMapFrame>
  );
}
