"use client";
import * as React from "react";
import { Paperclip } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AttachmentList, type AttachmentView } from "@/components/trip/attachment-list";
import type { TargetType } from "@/lib/enums";

export function AttachmentPopover(props: {
  tripId?: string;
  globeId?: string;
  targetType: TargetType;
  targetId: string;
  attachments: AttachmentView[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label={
            props.attachments.length
              ? `Attachments (${props.attachments.length})`
              : "Attachments"
          }
        >
          <Paperclip className="size-3.5" aria-hidden="true" />
          {props.attachments.length > 0 && (
            <span className="font-medium">{props.attachments.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <AttachmentList
          tripId={props.tripId}
          globeId={props.globeId}
          targetType={props.targetType}
          targetId={props.targetId}
          attachments={props.attachments}
          compact
        />
      </PopoverContent>
    </Popover>
  );
}
