# Exchange rates are snapshotted per Cost, not converted live

Each **Cost** stores its original amount + currency together with the **exchange rate used
at the time it was recorded**, rather than always converting from the original amount using
a single live rate. Home-currency totals are computed from each cost's stored original and
its snapshotted rate. We chose this because rates drift daily and the app tracks
**estimated vs actual** spend over a multi-week trip: a live-only conversion would silently
rewrite history (yesterday's "actual" total changes overnight) and make estimated-vs-actual
comparisons meaningless. Rates remain manually overridable per cost/trip. Reversing this
later would mean we'd have already lost the historical rate data, so it's decided up front.
