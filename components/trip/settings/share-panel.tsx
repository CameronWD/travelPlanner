"use client";

import * as React from "react";
import { useTransition } from "react";
import { Copy, Check, RefreshCw, Trash2 } from "lucide-react";
import {
  createShareLink,
  rotateShareLink,
  revokeShareLink,
} from "@/server/actions/share";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface SharePanelProps {
  tripId: string;
  initialToken: string | null;
}

export function SharePanel({ tripId, initialToken }: SharePanelProps) {
  const [token, setToken] = React.useState<string | null>(initialToken);
  const [copied, setCopied] = React.useState(false);
  const [isPending, startTransition] = useTransition();

  const shareUrl = token ? `/share/${token}` : null;

  function handleCopy() {
    if (!shareUrl) return;
    const fullUrl = typeof window !== "undefined"
      ? `${window.location.origin}${shareUrl}`
      : shareUrl;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createShareLink(tripId);
      setToken(result.token);
    });
  }

  function handleRotate() {
    startTransition(async () => {
      const result = await rotateShareLink(tripId);
      setToken(result.token);
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      await revokeShareLink(tripId);
      setToken(null);
    });
  }

  return (
    <div className="space-y-5">
      {/* Header row: title + toggle */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold tracking-tight text-foreground">
          Public share link
        </h3>
        <button
          role="switch"
          aria-checked={!!token}
          aria-label="Public share link"
          disabled={isPending}
          onClick={token ? handleRevoke : handleCreate}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            token ? "bg-success" : "bg-muted",
            isPending && "opacity-50",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white transition-all",
              token ? "right-0.5" : "left-0.5",
            )}
          />
        </button>
      </div>

      {shareUrl && (
        <div className="space-y-3">
          {/* URL bar */}
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-[10px] border border-border px-3 py-2 font-mono text-xs text-muted-foreground">
              {typeof window !== "undefined"
                ? `${window.location.origin}${shareUrl}`
                : shareUrl}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={isPending}
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

          {/* Caption */}
          <p className="mt-2 text-xs text-muted-foreground">
            Read-only · hides costs, notes, confirmations.
          </p>

          {/* Regenerate + Revoke */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRotate}
              loading={isPending}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Regenerate
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRevoke}
              loading={isPending}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Revoke
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
