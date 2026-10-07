"use client";

import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { Check, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCIES, currencyName } from "@/lib/currencies";

export interface CurrencyRowProps {
  value: string;
  onChange: (code: string) => void;
  note?: React.ReactNode;
}

export function CurrencyRow({ value, onChange, note }: CurrencyRowProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const list = CURRENCIES.filter((c) => !needle || `${c.code} ${c.name}`.toLowerCase().includes(needle));

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    setQ("");
  }

  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">Show money in</p>
      <div className="island mt-2 flex min-h-14 items-center gap-3 rounded-2xl border-2 border-border bg-sun px-4 py-2 text-on-accent">
        {/* A new currency pops in as the old one fades out, so the code cross-fades (MOTION N10). */}
        <AnimatePresence mode="popLayout" initial={false}>
          <m.div key={value} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="flex min-w-0 items-center gap-3 tp-pop">
            <span data-currency-code className="shrink-0 font-display text-[22px] font-extrabold leading-none tabular-nums">{value}</span>
            <span className="min-w-0 truncate text-[15px] font-bold">{currencyName(value)}</span>
          </m.div>
        </AnimatePresence>
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`Change currency, now ${value}`} className="ml-auto min-h-11 shrink-0 whitespace-nowrap px-1 text-sm font-extrabold text-coral-text underline-offset-2 hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
              Change
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-2">
            <label className="flex h-11 items-center gap-2 rounded-[12px] border-2 border-border bg-card px-3">
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                aria-label="Search currencies"
                placeholder="Search currencies"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (list[0]) choose(list[0].code);
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none"
              />
            </label>
            <ul aria-label="Currencies" className="mt-2 max-h-64 overflow-y-auto">
              {list.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => choose(c.code)} aria-current={c.code === value ? "true" : undefined} className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left hover:bg-muted focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring">
                    <span className="w-12 shrink-0 font-display text-[15px] font-extrabold tabular-nums">{c.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                    {c.code === value ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      {note ? <p className="mt-2 text-[13px] font-medium text-muted-foreground">{note}</p> : null}
    </div>
  );
}
