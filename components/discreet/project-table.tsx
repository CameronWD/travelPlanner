"use client";

import * as React from "react";
import Link from "next/link";
import { MoreVertical, Copy } from "lucide-react";
import { columnLetter } from "@/lib/discreet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { DuplicateTripDialog } from "@/components/trip/duplicate-trip-dialog";
import { cn } from "@/lib/cn";

export interface ProjectRow {
  id: string;
  name: string;
  dateRange: string;
  status: string;
  locations: number;
}

const HEADERS = ["Project", "Status", "Schedule", "Items", ""];

export function ProjectTable({ projects }: { projects: ProjectRow[] }) {
  const [duplicateState, setDuplicateState] = React.useState<{ id: string; name: string } | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left text-xs font-medium text-muted-foreground">
              {HEADERS.map((h, i) =>
                h === "" ? (
                  // Empty header for the actions column — visually hidden label for a11y
                  <th key="actions" className="border border-border px-2 py-1.5 font-mono font-normal w-8">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : (
                  <th key={h} className="border border-border px-3 py-1.5 font-mono font-normal">
                    <span className="mr-2 text-muted-foreground/60">{columnLetter(i)}</span>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="group hover:bg-accent">
                <td className="border border-border px-3 py-1.5">
                  <Link href={`/trips/${p.id}`} className="font-medium text-foreground hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="border border-border px-3 py-1.5 text-muted-foreground">{p.status}</td>
                <td className="border border-border px-3 py-1.5 font-mono text-muted-foreground">{p.dateRange}</td>
                <td className="border border-border px-3 py-1.5 font-mono text-right text-muted-foreground">{p.locations}</td>
                <td className="border border-border px-2 py-1 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${p.name}`}
                      className={cn(
                        "flex size-6 items-center justify-center rounded text-muted-foreground",
                        "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
                      )}
                    >
                      <MoreVertical className="size-3.5" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setDuplicateState({ id: p.id, name: p.name })}
                      >
                        <Copy className="size-4" aria-hidden="true" />
                        Duplicate
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Controlled duplicate dialog — rendered outside the table */}
      <DuplicateTripDialog
        tripId={duplicateState?.id ?? ""}
        tripName={duplicateState?.name ?? ""}
        open={duplicateState !== null}
        onOpenChange={(o) => { if (!o) setDuplicateState(null); }}
        disguised
      />
    </>
  );
}
