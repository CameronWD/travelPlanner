export interface ShareTallyProps {
  nights: number;
  stops: number;
  countries: number;
}

const pluralize = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);

/** SHARE.md §6 — nights, stops, countries. Never distance or spend. */
export function ShareTally({ nights, stops, countries }: ShareTallyProps) {
  const cells: Array<{ n: number; label: string }> = [
    { n: nights, label: pluralize(nights, "night", "nights") },
    { n: stops, label: pluralize(stops, "stop", "stops") },
    { n: countries, label: pluralize(countries, "country", "countries") },
  ];

  return (
    <section
      data-slot="share-tally"
      aria-label="Trip tally"
      className="grid grid-cols-3 divide-x-2 divide-border overflow-hidden rounded-2xl border-2 border-border bg-card shadow-hard-4"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="px-3 py-3">
          <p className="font-display text-[30px] font-extrabold leading-none tabular-nums">{cell.n}</p>
          <p className="mt-1 text-xs font-bold">{cell.label}</p>
        </div>
      ))}
    </section>
  );
}
