import { splitFileName } from "@/lib/attachment-name";

export function MiddleTruncate({ text }: { text: string }) {
  const { head, tail } = splitFileName(text);
  return (
    <span className="flex min-w-0" title={text}>
      <span className="truncate">{head}</span>
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </span>
  );
}
