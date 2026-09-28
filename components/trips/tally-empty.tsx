/** First-run Tally (TRIPS_PAGE.md §7): dashed, no fill, no toggle, four "—" cells. */
export function TallyEmpty() {
  const cells = ["countries", "places", "nights away", "km travelled"];
  return (
    <section aria-label="Tally" className="flex h-full min-h-0 flex-col rounded-[24px] border-2 border-dashed border-border px-[22px] py-5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Tally</span>
      <p className="mt-2 font-display text-[22px] font-extrabold leading-[1.1] text-foreground">Starts counting with your first trip</p>
      <dl className="mt-auto grid grid-cols-2 gap-x-4 border-t-2 border-border">
        {cells.map((l) => (
          <div key={l} className="border-b-2 border-border/20 py-2">
            <dd className="font-display text-[20px] font-extrabold leading-[1.1] text-border-soft">—</dd>
            <dt className="text-[13px] font-semibold text-muted-foreground">{l}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
