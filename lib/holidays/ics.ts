export type FeedHoliday = {
  date: string;
  name: string;
  kind: "public" | "observance";
  regions: string[] | null;
  halfDay: boolean;
};

function unfold(ics: string): string[] {
  return ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function unescapeText(s: string): string {
  return s.replace(/\\([,;nN\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

function classify(firstLine: string): Pick<FeedHoliday, "kind" | "regions"> | null {
  const m = /^(Public holiday|Observance)(?: in (.+))?$/.exec(firstLine.trim());
  if (!m) return null;
  const regions = m[2] ? m[2].split("\\,").map((r) => unescapeText(r).trim()).filter(Boolean) : null;
  return { kind: m[1] === "Public holiday" ? "public" : "observance", regions };
}

export function parseHolidayIcs(ics: string): FeedHoliday[] {
  const out: FeedHoliday[] = [];
  let event: Map<string, string> | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") {
      event = new Map();
      continue;
    }
    if (line === "END:VEVENT") {
      if (event) {
        const holiday = toHoliday(event);
        if (holiday) out.push(holiday);
      }
      event = null;
      continue;
    }
    if (!event) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    event.set(line.slice(0, colon).split(";")[0], line.slice(colon + 1));
  }
  return out;
}

function toHoliday(event: Map<string, string>): FeedHoliday | null {
  const start = /^(\d{4})(\d{2})(\d{2})$/.exec(event.get("DTSTART") ?? "");
  const summary = event.get("SUMMARY");
  const rawDescription = event.get("DESCRIPTION");
  if (!start || !summary || !rawDescription) return null;
  const [first = "", ...rest] = rawDescription.split("\\n");
  const kind = classify(first);
  if (!kind) return null;
  return {
    date: `${start[1]}-${start[2]}-${start[3]}`,
    name: unescapeText(summary).trim(),
    kind: kind.kind,
    regions: kind.regions,
    halfDay: rest.some((l) => /^This is a half-day holiday\.?$/.test(l.trim())),
  };
}
