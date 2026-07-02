"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { GitBranch, Plus, Pencil, Trash2, BarChart2, Check, ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createFork, renameFork, discardFork } from "@/server/actions/forks";
import { MAX_FORKS } from "@/lib/fork-plan";
import type { TripPhase } from "@/lib/trip-phase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForkItem {
  id: string;
  name: string;
}

export interface ForkSwitcherProps {
  tripId: string;
  forks: ForkItem[];
  /** Current trip phase — controls whether fork management controls are shown. */
  phase: TripPhase;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The phases where forking is allowed. */
function canFork(phase: TripPhase): boolean {
  return phase !== "travelling" && phase !== "past";
}

// ---------------------------------------------------------------------------
// Rename dialog
// ---------------------------------------------------------------------------

interface RenameDialogProps {
  forkId: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: () => void;
}

function RenameDialogForm({
  forkId,
  currentName,
  onClose,
  onRenamed,
}: {
  forkId: string;
  currentName: string;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = React.useState(currentName);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await renameFork(forkId, name);
      if (result.success) {
        onRenamed();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="py-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Variant name"
          aria-label="Variant name"
          disabled={isPending}
        />
        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button">
            Cancel
          </Button>
        </DialogClose>
        <Button variant="primary" type="submit" disabled={isPending || !name.trim()}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RenameDialog({ forkId, currentName, open, onOpenChange, onRenamed }: RenameDialogProps) {
  // Use a key to remount the form on each open/forkId change — avoids setState-in-effect.
  const formKey = open ? `${forkId}-${String(open)}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename variant</DialogTitle>
        </DialogHeader>
        <RenameDialogForm
          key={formKey}
          forkId={forkId}
          currentName={currentName}
          onClose={() => onOpenChange(false)}
          onRenamed={onRenamed}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create / Duplicate variant dialog
// ---------------------------------------------------------------------------

function CreateVariantForm({
  tripId, defaultName, sourceForkId, onClose, onCreated,
}: {
  tripId: string; defaultName: string; sourceForkId?: string;
  onClose: () => void; onCreated: (forkId: string) => void;
}) {
  const [name, setName] = React.useState(defaultName);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createFork(tripId, name.trim() || undefined, sourceForkId);
      if (result.success) { onCreated(result.forkId); onClose(); }
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="py-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Variant name"
          aria-label="Variant name"
          disabled={isPending}
        />
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      </div>
      <DialogFooter>
        <DialogClose asChild><Button variant="outline" type="button">Cancel</Button></DialogClose>
        <Button variant="primary" type="submit" disabled={isPending}>{isPending ? "Creating…" : "Create"}</Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Discard confirm dialog
// ---------------------------------------------------------------------------

interface DiscardDialogProps {
  forkName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

function DiscardDialog({ forkName, open, onOpenChange, onConfirm, isPending }: DiscardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard &ldquo;{forkName}&rdquo;?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          This will permanently delete this variant and all its plan data. This cannot be undone.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Discarding…" : "Discard variant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Fork switcher — lives in the trip layout header.
 *
 * Shows the active plan name with a dropdown to:
 * - Switch between the real plan and fork variants
 * - Create a new variant (up to MAX_FORKS cap)
 * - Rename or discard an existing fork
 * - Navigate to the Compare page
 *
 * Hidden entirely when the trip phase is travelling or past (forking not allowed).
 * Also hidden when discreet mode is on (caller must gate before rendering).
 */
export function ForkSwitcher({ tripId, forks, phase }: ForkSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Derive the active fork from the current ?plan= search param
  const activeForkId = searchParams.get("plan") ?? null;

  const [discardPending, startDiscardTransition] = React.useTransition();

  const [renameTarget, setRenameTarget] = React.useState<ForkItem | null>(null);
  const [discardTarget, setDiscardTarget] = React.useState<ForkItem | null>(null);
  // { mode: "new" } → blank create; { mode: "duplicate", source } → duplicate an existing fork.
  const [createTarget, setCreateTarget] = React.useState<
    { mode: "new" } | { mode: "duplicate"; source: ForkItem } | null
  >(null);

  // Hidden for past/travelling trips — no forking allowed
  if (!canFork(phase)) return null;

  const atCap = forks.length >= MAX_FORKS;
  const activeFork = forks.find((f) => f.id === activeForkId) ?? null;
  const activeLabel = activeFork ? activeFork.name : "Real plan";

  /** Navigate to a plan by setting or clearing the ?plan= search param. */
  function navigateToPlan(forkId: string | null) {
    if (forkId) {
      router.push(`/trips/${tripId}/plan?plan=${forkId}`);
      return;
    }
    // Real plan — clear the param on the current page.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("plan");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  function handleDiscard() {
    if (!discardTarget) return;
    const targetId = discardTarget.id;
    startDiscardTransition(async () => {
      const result = await discardFork(targetId);
      if (result.success) {
        // If discarding the active fork, navigate back to real plan
        if (activeForkId === targetId) {
          navigateToPlan(null);
        }
        setDiscardTarget(null);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 font-medium"
            aria-label={`Active plan: ${activeLabel}. Open plan switcher`}
          >
            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="max-w-32 truncate">{activeLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Real plan option */}
          <DropdownMenuItem
            onSelect={() => navigateToPlan(null)}
            aria-current={activeForkId === null ? "true" : undefined}
          >
            {activeForkId === null && (
              <Check className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className={activeForkId === null ? "pl-0 font-medium" : "pl-6"}>
              Real plan
            </span>
          </DropdownMenuItem>

          {/* Fork entries */}
          {forks.map((fork) => (
            <DropdownMenuItem
              key={fork.id}
              onSelect={() => navigateToPlan(fork.id)}
              aria-current={activeForkId === fork.id ? "true" : undefined}
            >
              {activeForkId === fork.id && (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span className={activeForkId === fork.id ? "font-medium flex-1 truncate" : "pl-6 flex-1 truncate"}>
                {fork.name}
              </span>
              {/* Rename + duplicate + discard actions for this fork */}
              <span
                className="ml-auto flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Rename ${fork.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameTarget(fork);
                  }}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
                  aria-label={`Duplicate ${fork.name}`}
                  disabled={atCap}
                  onClick={(e) => { e.stopPropagation(); setCreateTarget({ mode: "duplicate", source: fork }); }}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Discard ${fork.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDiscardTarget(fork);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {/* New variant */}
          <DropdownMenuItem
            disabled={atCap}
            onSelect={atCap ? undefined : () => setCreateTarget({ mode: "new" })}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            {atCap ? (
              <span className="text-muted-foreground">Discard a variant first</span>
            ) : (
              <span>New variant</span>
            )}
          </DropdownMenuItem>

          {/* Compare link */}
          <DropdownMenuItem
            onSelect={() => router.push(`/trips/${tripId}/compare`)}
          >
            <BarChart2 className="size-4 shrink-0" aria-hidden="true" />
            Compare plans
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog — rendered outside the dropdown */}
      {renameTarget && (
        <RenameDialog
          forkId={renameTarget.id}
          currentName={renameTarget.name}
          open={renameTarget !== null}
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null);
          }}
          onRenamed={() => setRenameTarget(null)}
        />
      )}

      {/* Discard confirm dialog */}
      {discardTarget && (
        <DiscardDialog
          forkName={discardTarget.name}
          open={discardTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDiscardTarget(null);
          }}
          onConfirm={handleDiscard}
          isPending={discardPending}
        />
      )}

      {/* Create / Duplicate variant dialog */}
      {createTarget && (
        <Dialog open onOpenChange={(open) => { if (!open) setCreateTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createTarget.mode === "duplicate" ? "Duplicate variant" : "New variant"}</DialogTitle>
            </DialogHeader>
            <CreateVariantForm
              tripId={tripId}
              defaultName={createTarget.mode === "duplicate" ? `Copy of ${createTarget.source.name}` : `Variant ${forks.length + 1}`}
              sourceForkId={createTarget.mode === "duplicate" ? createTarget.source.id : undefined}
              onClose={() => setCreateTarget(null)}
              onCreated={(forkId) => navigateToPlan(forkId)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
