import type { Route } from "next";

export interface AttachmentView {
  id: string;
  filename: string;
  /** A Traveller-given name (CONTEXT.md "Attachment"); shown in place of the filename when set. */
  title?: string | null;
  mime: string;
  size: number;
  url: string;
  uploadedById: string;
  createdAt: Date;
  owner?: FileOwner | null;
  /** The owner's id, when the row carries it (Files page); lets Link-to preselect the current Item. */
  targetId?: string | null;
}

/** What a file is attached to, as Files shows it: a name, and a link to where it lives (null when the owner is gone). */
export interface FileOwner {
  label: string;
  href: Route | null;
}
