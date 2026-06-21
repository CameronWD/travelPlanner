"use client";

import * as React from "react";
import { useTransition } from "react";
import { Copy, Check, Link as LinkIcon, RefreshCw, Trash2 } from "lucide-react";
import {
  createShareLink,
  rotateShareLink,
  revokeShareLink,
} from "@/server/actions/share";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A public link lets anyone view the itinerary — stops, transport, and
        activities. Budget, notes, and files are not shared.
      </p>

      {shareUrl ? (
        <div className="space-y-3">
          {/* Link display */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <LinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1 truncate font-mono text-sm text-foreground">
              {typeof window !== "undefined"
                ? `${window.location.origin}${shareUrl}`
                : shareUrl}
            </span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
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
                  Copy link
                </>
              )}
            </Button>
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
          <p className="text-xs text-muted-foreground">
            Regenerating invalidates the old link immediately. Revoking removes
            the link entirely.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            No public link active. Create one to share the itinerary.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={handleCreate}
              loading={isPending}
            >
              <LinkIcon className="size-4" aria-hidden="true" />
              Create share link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
