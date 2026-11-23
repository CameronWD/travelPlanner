import { Paperclip } from "lucide-react";
import { AttachmentLink } from "@/components/trip/attachment-link";
import type { AttachmentView } from "@/components/trip/attachment-list";
import { attachmentName } from "@/lib/attachment-name";

export function AttachmentLinks({ attachments }: { attachments: AttachmentView[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-1 flex flex-col">
      {attachments.map((a) => (
        <AttachmentLink key={a.id} href={a.url} mime={a.mime}
          className="inline-flex w-full items-center gap-1 pointer-coarse:min-h-8 text-xs text-muted-foreground hover:text-foreground underline">
          <Paperclip className="size-3" aria-hidden="true" />{attachmentName(a)}
        </AttachmentLink>
      ))}
    </div>
  );
}
