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
  targetId?: string | null;
  /** False on files Move would refuse (an Item's photo, a Journal photo); the Files page hides Move for them. */
  movable?: boolean;
}

/** What a file is attached to, as Files shows it: a name, and a link to where it lives (null when the owner is gone). */
export interface FileOwner {
  label: string;
  href: Route | null;
}
