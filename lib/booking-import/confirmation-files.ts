import PostalMime from "postal-mime";
import { checkBookingFile, MAX_EML_ATTACHMENTS } from "./limits";

export async function bookingConfirmationFiles(file: File): Promise<File[]> {
  const check = checkBookingFile({ name: file.name, type: file.type, size: file.size });
  if (!check.ok) return [];
  if (check.kind !== "eml") return [file];

  let email: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    email = await PostalMime.parse(await file.arrayBuffer());
  } catch {
    return [];
  }
  const files: File[] = [];
  for (const a of email.attachments) {
    if (files.length >= MAX_EML_ATTACHMENTS) break;
    if (a.related || typeof a.content === "string") continue;
    if (a.mimeType !== "application/pdf" && !/\.pdf$/i.test(a.filename ?? "")) continue;
    files.push(new File([new Uint8Array(a.content)], a.filename ?? "attachment.pdf", { type: "application/pdf" }));
  }
  return files;
}
