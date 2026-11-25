"use client";

import * as React from "react";
import { Check, Copy, FileText, Navigation } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AttachmentLink } from "@/components/trip/attachment-link";
import { attachmentName } from "@/lib/attachment-name";
import { cn } from "@/lib/cn";
import type { DetailsView } from "@/lib/details-view";
import { directionsFromHereUrl, mapsUrl } from "@/lib/map/maps";
import type { LocalMode } from "@/lib/travel-times/hops";
import { recordUsageAction } from "@/lib/usage/client";

const LABEL = "text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground";

function Row({ row, label, children }: { row: string; label: string; children: React.ReactNode }) {
  return (
    <section data-row={row} className="flex flex-col gap-1">
      <h3 className={LABEL}>{label}</h3>
      {children}
    </section>
  );
}

function DirectionsLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordUsageAction("directions-tapped")}
      className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold underline underline-offset-2"
    >
      <Navigation className="size-4 shrink-0" aria-hidden="true" />
      Directions
    </a>
  );
}

export function DetailsSheet({
  view,
  open,
  onOpenChange,
  onEdit,
  mode,
  canEdit = true,
}: {
  view: DetailsView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  mode: LocalMode | null;
  canEdit?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);
  const reference = view.reference;
  function copyReference() {
    if (!reference) return;
    void navigator.clipboard.writeText(reference).then(() => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  const destination = view.place ?? (view.address ? { address: view.address } : null);
  const mapHref = view.address
    ? mapsUrl({ lat: view.place?.lat, lng: view.place?.lng, address: view.address, label: view.title })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...(view.subtitle ? {} : { "aria-describedby": undefined })}>
        <DialogHeader data-row="title">
          <DialogTitle>{view.title}</DialogTitle>
          {view.subtitle ? <DialogDescription>{view.subtitle}</DialogDescription> : null}
        </DialogHeader>

        {view.times.length > 0 ? (
          <dl data-row="times" className="flex flex-col gap-1.5">
            {view.times.map((t) => (
              <div key={t.label} className="flex items-baseline gap-3">
                <dt className={cn(LABEL, "w-20 shrink-0")}>{t.label}</dt>
                <dd className="text-sm font-semibold tabular-nums">{t.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {view.files.length > 0 ? (
          <div data-row="files" className="flex flex-col gap-2">
            {view.files.map((f) => (
              <AttachmentLink
                key={f.id}
                href={f.url}
                mime={f.mime}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border-2 border-border bg-card px-3.5 py-2 text-sm font-semibold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <FileText className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{attachmentName(f)}</span>
              </AttachmentLink>
            ))}
          </div>
        ) : null}

        {view.travelDetails ? (
          <Row row="travel-details" label="Details">
            <span className="min-w-0 break-words text-sm font-semibold">{view.travelDetails}</span>
          </Row>
        ) : null}

        {reference ? (
          <Row row="reference" label={view.referenceLabel}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 break-all font-mono text-sm font-semibold">{reference}</span>
              <button
                type="button"
                onClick={copyReference}
                aria-label={copied ? "Copied" : "Copy reference"}
                className="inline-grid size-11 shrink-0 place-items-center rounded-[12px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring md:size-8"
              >
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
              <span role="status" className="sr-only">
                {copied ? "Reference copied" : ""}
              </span>
            </div>
          </Row>
        ) : null}

        {view.address && mapHref && destination ? (
          <Row row="address" label="Address">
            <a href={mapHref} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-semibold underline underline-offset-2">
              {view.address}
            </a>
            <DirectionsLink href={directionsFromHereUrl(destination, mode).google} />
          </Row>
        ) : destination ? (
          <div data-row="directions">
            <DirectionsLink href={directionsFromHereUrl(destination, mode).google} />
          </div>
        ) : null}

        {view.notes ? (
          <Row row="notes" label="Notes">
            <p className="whitespace-pre-line text-sm font-medium">{view.notes}</p>
          </Row>
        ) : null}

        {view.link ? (
          <Row row="link" label="Link">
            <a href={view.link} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-semibold underline underline-offset-2">
              {view.link}
            </a>
          </Row>
        ) : null}

        {view.tryList ? (
          <Row row="try-list" label="Try list">
            <ul className="flex flex-col gap-1 text-sm font-medium">
              {view.tryList.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  {e.tried ? (
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className={cn(e.tried && "text-muted-foreground line-through")}>{e.text}</span>
                  <span className="sr-only">{e.tried ? "(tried)" : "(not tried yet)"}</span>
                </li>
              ))}
            </ul>
          </Row>
        ) : null}

        {view.openingHours ? (
          <Row row="opening-hours" label="Opening hours">
            <p className="text-sm font-semibold">{view.openingHours}</p>
          </Row>
        ) : null}

        {view.cost ? (
          <Row row="cost" label="Cost">
            <p className="flex flex-wrap items-baseline gap-2 text-sm font-semibold tabular-nums">
              <span>{view.cost.label}</span>
              <span className={view.cost.paid ? "text-teal-text" : "text-muted-foreground"}>
                {view.cost.paid ? "Paid" : "Not paid yet"}
              </span>
            </p>
          </Row>
        ) : null}

        {canEdit ? (
          <DialogFooter data-row="edit">
            <Button type="button" variant="secondary" onClick={onEdit}>
              Edit
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
