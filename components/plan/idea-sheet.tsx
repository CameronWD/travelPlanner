"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ItemCard, type ItemCardItem } from "@/components/trip/item-card";
import { DayPickerMenu } from "@/components/trip/day-picker-menu";
import type { AttachmentView } from "@/components/trip/attachment-list";
import type { CostRow } from "@/server/actions/costs";

export interface IdeaSheetProps {
  tripId: string;
  idea: ItemCardItem | null;
  days: string[];
  homeCurrency?: string;
  costs?: CostRow[];
  attachments?: AttachmentView[];
  onClose(): void;
  onPickDay(idea: ItemCardItem, dateISO: string): void;
  onEdit(idea: ItemCardItem): void;
}

export function IdeaSheet({ tripId, idea, days, homeCurrency, costs, attachments, onClose, onPickDay, onEdit }: IdeaSheetProps) {
  return (
    <Dialog open={idea !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined}>
        {idea ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{idea.title}</DialogTitle>
            </DialogHeader>
            <ItemCard item={idea} mode="wishlist" expanded tripId={tripId} homeCurrency={homeCurrency} costs={costs} attachments={attachments} />
            <div className="flex flex-wrap gap-2">
              {days.length > 0 && (
                <DayPickerMenu
                  days={days}
                  label={`Pick a day for ${idea.title}`}
                  onPick={(d) => {
                    onClose();
                    onPickDay(idea, d);
                  }}
                  trigger={
                    <Button type="button" variant="primary" size="md" aria-label={`Pick a day for ${idea.title}`}>
                      Pick a day
                    </Button>
                  }
                />
              )}
              <Button
                type="button"
                variant="outline"
                size="md"
                aria-label={`Edit ${idea.title}`}
                onClick={() => {
                  onClose();
                  onEdit(idea);
                }}
              >
                Edit
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
