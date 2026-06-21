"use client";

import * as React from "react";
import { MessageCircle, Trash2, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { relativeTime } from "@/lib/relative-time";
import { addNote, deleteNote } from "@/server/actions/notes";
import type { TargetType } from "@/lib/enums";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteView {
  id: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export interface NoteThreadProps {
  tripId: string;
  targetType: TargetType;
  targetId: string;
  notes: NoteView[];
  currentUserId: string;
  /** If true, renders inline (expanded) rather than in a popover trigger. */
  inline?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ---------------------------------------------------------------------------
// Inner thread (used both inline and inside popover)
// ---------------------------------------------------------------------------

interface ThreadBodyProps {
  tripId: string;
  targetType: TargetType;
  targetId: string;
  notes: NoteView[];
  currentUserId: string;
}

function ThreadBody({
  tripId,
  targetType,
  targetId,
  notes,
  currentUserId,
}: ThreadBodyProps) {
  const [body, setBody] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const now = new Date();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);

    startTransition(async () => {
      const result = await addNote(tripId, { targetType, targetId, body: trimmed });
      if (result.success) {
        setBody("");
      } else {
        setError(result.errors.body?.[0] ?? "Failed to add note.");
      }
    });
  }

  function handleDelete(noteId: string) {
    startTransition(async () => {
      await deleteNote(noteId);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Notes list */}
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2.5" role="list">
          {notes.map((note) => (
            <li key={note.id} className="group flex gap-2">
              <Avatar className="mt-0.5 size-6 shrink-0">
                {note.author.image && (
                  <AvatarImage
                    src={note.author.image}
                    alt={note.author.name ?? ""}
                  />
                )}
                <AvatarFallback className="text-[10px]">
                  {initials(note.author.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {note.author.id === currentUserId
                      ? "You"
                      : (note.author.name ?? "Someone")}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {relativeTime(new Date(note.createdAt), now)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {note.body}
                </p>
              </div>

              {/* Delete — any trip member can tidy up */}
              <Button
                variant="ghost"
                size="icon"
                disabled={isPending}
                onClick={() => handleDelete(note.id)}
                aria-label="Delete note"
                className={cn(
                  "size-5 shrink-0 self-start text-muted-foreground/40 hover:text-destructive",
                  "opacity-0 transition-opacity group-hover:opacity-100",
                )}
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground/60 italic">No notes yet.</p>
      )}

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          disabled={isPending}
          className="min-h-16 resize-none text-xs"
          aria-label="Note body"
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={isPending || !body.trim()}
          className="self-end h-7 gap-1.5 px-3 text-xs"
        >
          <Send className="size-3" aria-hidden="true" />
          Add note
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteThread (public component)
// ---------------------------------------------------------------------------

/**
 * A collapsible note thread attached to any trip entity.
 *
 * By default renders as a "💬 N" trigger button that opens a Popover.
 * Pass `inline` to render expanded inline (e.g. in a full-page context).
 */
export function NoteThread({
  tripId,
  targetType,
  targetId,
  notes,
  currentUserId,
  inline = false,
}: NoteThreadProps) {
  if (inline) {
    return (
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes
        </h4>
        <ThreadBody
          tripId={tripId}
          targetType={targetType}
          targetId={targetId}
          notes={notes}
          currentUserId={currentUserId}
        />
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Notes"
          aria-label={`${notes.length} note${notes.length === 1 ? "" : "s"}`}
        >
          <MessageCircle className="size-3.5" aria-hidden="true" />
          {notes.length > 0 && (
            <span className="font-medium">{notes.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        align="end"
        side="bottom"
        sideOffset={6}
      >
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-foreground">Notes</h4>
          <ThreadBody
            tripId={tripId}
            targetType={targetType}
            targetId={targetId}
            notes={notes}
            currentUserId={currentUserId}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
