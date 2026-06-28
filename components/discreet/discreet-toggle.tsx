"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { DISCREET_COOKIE, DISCREET_LABEL_COOKIE, DEFAULT_DISCREET_LABEL } from "@/lib/discreet";

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function DiscreetToggle({ discreet, label }: { discreet: boolean; label: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(label);

  function toggle() {
    if (discreet) clearCookie(DISCREET_COOKIE);
    else setCookie(DISCREET_COOKIE, "1");
    router.refresh();
  }
  function saveLabel() {
    const trimmed = value.trim().slice(0, 40);
    if (trimmed === "") clearCookie(DISCREET_LABEL_COOKIE);
    else setCookie(DISCREET_LABEL_COOKIE, trimmed);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 px-2 py-1.5">
      <button type="button" onClick={toggle} className="flex items-center gap-2 text-sm text-foreground" aria-pressed={discreet}>
        {discreet ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        Discreet mode
        <span className="ml-auto text-xs text-muted-foreground">{discreet ? "On" : "Off"}</span>
      </button>
      {discreet && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Display name
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder={DEFAULT_DISCREET_LABEL}
            className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
      )}
    </div>
  );
}
