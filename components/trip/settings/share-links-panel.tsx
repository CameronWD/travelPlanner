"use client";

import * as React from "react";
import { useTransition } from "react";
import { Copy, Check, RefreshCw, Trash2, Pencil, Plus } from "lucide-react";
import {
  createShareLink,
  updateShareLink,
  rotateShareLink,
  revokeShareLink,
  type ShareLinkView,
  type ShareScopeInput,
} from "@/server/actions/share";
import { scopeCaption } from "@/lib/share-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";

// ---------------------------------------------------------------------------
// Share links panel — one row per audience (ADR 0051).
// Label + three dials per link; money/notes/confirmations are never shared
// on any link, so no dial for them exists.
// ---------------------------------------------------------------------------

const DIALS: Array<{ key: keyof Required<ShareScopeInput>; label: string }> = [
  { key: "includeAccommodation", label: "Accommodation" },
  { key: "includeTransport", label: "Transport" },
  { key: "includeDailyPlans", label: "Daily plans" },
];

type ScopeState = Record<keyof Required<ShareScopeInput>, boolean>;

// Journal defaults off (ADR 0051 amendment) — unlike the three dials above,
// a new link doesn't get the Journal unless someone turns it on.
const FULL_SCOPE: ScopeState = {
  includeAccommodation: true,
  includeTransport: true,
  includeDailyPlans: true,
  includeJournal: false,
  showTravellers: false,
};

function shareUrl(token: string): string {
  const path = `/share/${token}`;
  return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
}

function DialChecks({
  scope,
  onChange,
  idPrefix,
}: {
  scope: ScopeState;
  onChange: (next: ScopeState) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {DIALS.map(({ key, label }) => (
        <label key={key} htmlFor={`${idPrefix}-${key}`} className="flex items-center gap-2 text-sm text-foreground">
          <input
            id={`${idPrefix}-${key}`}
            type="checkbox"
            className="size-4 accent-primary"
            checked={scope[key]}
            onChange={(e) => onChange({ ...scope, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/**
 * The Journal dial (ADR 0051 amendment): a Switch, not a checkbox, because
 * it needs helper copy under it explaining what it shares — unlike the
 * three plain-checkbox dials in `DialChecks`, which are self-explanatory.
 */
function JournalDial({
  checked,
  onChange,
  idPrefix,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-includeJournal`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm text-foreground">
          Include journal
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground">
        Each day&apos;s notes and photos, by first name
      </p>
    </div>
  );
}

/**
 * The "Show who's going" dial (ADR 0051 amendment 2026-09-30): matches
 * `JournalDial`'s markup exactly — a Switch plus helper copy, because it
 * shares the same need to explain what it exposes before someone flips it.
 */
function TravellersDial({
  checked,
  onChange,
  idPrefix,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-showTravellers`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-sm text-foreground">
          Show who&apos;s going
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground">
        Names and photos of everyone on the trip
      </p>
    </div>
  );
}

function CopyUrlBar({ token }: { token: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate rounded-[10px] border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
        {shareUrl(token)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(shareUrl(token)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? (
          <>
            <Check className="size-4" aria-hidden="true" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="size-4" aria-hidden="true" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}

function LinkRow({
  tripId,
  link,
  onChanged,
  onRevoked,
}: {
  tripId: string;
  link: ShareLinkView;
  onChanged: (link: ShareLinkView) => void;
  onRevoked: (id: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [label, setLabel] = React.useState(link.label);
  const [scope, setScope] = React.useState<ScopeState>({
    includeAccommodation: link.includeAccommodation,
    includeTransport: link.includeTransport,
    includeDailyPlans: link.includeDailyPlans,
    includeJournal: link.includeJournal,
    showTravellers: link.showTravellers,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = React.useState<"rotate" | "revoke" | "save" | null>(null);

  function handleSave() {
    setPendingAction("save");
    startTransition(async () => {
      try {
        const result = await updateShareLink(tripId, link.id, { label, ...scope });
        if (result.success) {
          onChanged(result.link);
          setEditing(false);
          setError(null);
        } else {
          setError(result.errors.label?.[0] ?? result.errors.form?.[0] ?? "Something went wrong.");
        }
      } catch {
        // A rejected action (network, thrown server error) must behave like a
        // failed one: report via toast and leave the edit form open with
        // nothing changed, rather than crashing or hanging.
        toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleRotate() {
    setPendingAction("rotate");
    startTransition(async () => {
      const result = await rotateShareLink(tripId, link.id);
      if (result.success) {
        onChanged(result.link);
        setError(null);
      } else {
        setError(result.errors.form?.[0] ?? "Something went wrong.");
      }
    });
  }

  function handleRevoke() {
    setPendingAction("revoke");
    startTransition(async () => {
      const result = await revokeShareLink(tripId, link.id);
      if (result.success) {
        onRevoked(link.id);
      } else {
        setError(result.errors.form?.[0] ?? "Something went wrong.");
      }
    });
  }

  return (
    <li className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{link.label}</p>
          <p className="text-xs text-muted-foreground">
            {scopeCaption(link)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} disabled={isPending}>
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleRotate} loading={isPending && pendingAction === "rotate"} disabled={isPending}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Regenerate
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRevoke}
            loading={isPending && pendingAction === "revoke"}
            disabled={isPending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Revoke
          </Button>
        </div>
      </div>

      <CopyUrlBar token={link.token} />

      {!editing && error && <p className="text-xs text-destructive">{error}</p>}

      {editing && (
        <div className="space-y-3 rounded-xl bg-muted/30 p-3">
          <div className="space-y-1">
            <label htmlFor={`label-${link.id}`} className="text-xs font-medium text-muted-foreground">
              Label
            </label>
            <Input
              id={`label-${link.id}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
            />
          </div>
          <DialChecks idPrefix={`edit-${link.id}`} scope={scope} onChange={setScope} />
          <JournalDial
            idPrefix={`edit-${link.id}`}
            checked={scope.includeJournal}
            onChange={(v) => setScope({ ...scope, includeJournal: v })}
          />
          <TravellersDial
            idPrefix={`edit-${link.id}`}
            checked={scope.showTravellers}
            onChange={(v) => setScope({ ...scope, showTravellers: v })}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleSave} loading={isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ShareLinksPanel({
  tripId,
  initialLinks,
}: {
  tripId: string;
  initialLinks: ShareLinkView[];
}) {
  const [links, setLinks] = React.useState<ShareLinkView[]>(initialLinks);
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newScope, setNewScope] = React.useState<ScopeState>(FULL_SCOPE);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      try {
        const result = await createShareLink(tripId, { label: newLabel, ...newScope });
        if (result.success) {
          setLinks((prev) => [...prev, result.link]);
          setCreating(false);
          setNewLabel("");
          setNewScope(FULL_SCOPE);
          setCreateError(null);
        } else {
          setCreateError(result.errors.label?.[0] ?? "Something went wrong.");
        }
      } catch {
        // A rejected action (network, thrown server error) must behave like a
        // failed one: report via toast and leave the create form open with
        // nothing changed, rather than crashing or hanging.
        toast({ variant: "destructive", title: "Something went wrong — nothing was changed. Try again." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold tracking-tight text-foreground">
          Share links
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" aria-hidden="true" />
          New share link
        </Button>
      </div>

      <p className="max-w-reading text-xs text-muted-foreground">
        One link per audience — each read-only, each scoped. Costs, notes and
        booking confirmations are never shared, whatever the dials.
      </p>

      {creating && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
          <div className="space-y-1">
            <label htmlFor="new-link-label" className="text-xs font-medium text-muted-foreground">
              Label
            </label>
            <Input
              id="new-link-label"
              placeholder="e.g. Mum & Dad"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={60}
            />
          </div>
          <DialChecks idPrefix="new-link" scope={newScope} onChange={setNewScope} />
          <JournalDial
            idPrefix="new-link"
            checked={newScope.includeJournal}
            onChange={(v) => setNewScope({ ...newScope, includeJournal: v })}
          />
          <TravellersDial
            idPrefix="new-link"
            checked={newScope.showTravellers}
            onChange={(v) => setNewScope({ ...newScope, showTravellers: v })}
          />
          {createError && <p className="text-xs text-destructive">{createError}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleCreate} loading={isPending}>
              Create
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {links.length === 0 && !creating ? (
        <p className="max-w-reading text-sm text-muted-foreground">
          No share links yet. Create one to give family or friends a read-only
          view of the itinerary.
        </p>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              tripId={tripId}
              link={link}
              onChanged={(next) => setLinks((prev) => prev.map((l) => (l.id === next.id ? next : l)))}
              onRevoked={(id) => setLinks((prev) => prev.filter((l) => l.id !== id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
