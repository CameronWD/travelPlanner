import { Paperclip } from "lucide-react";
import type { AttachmentView } from "@/components/trip/attachment-list";

export function AttachmentLinks({ attachments }: { attachments: AttachmentView[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
          <Paperclip className="size-3" aria-hidden="true" />{a.filename}
        </a>
      ))}
    </div>
  );
}
