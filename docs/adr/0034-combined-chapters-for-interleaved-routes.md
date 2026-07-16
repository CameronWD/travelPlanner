# Combined chapters for interleaved routes

Extends ADR 0008's point 4 ("auto-suggest-from-country only fills Ungrouped spans").

## Context

A Chapter is a contiguous, non-overlapping date band; membership is computed from
a Stop's arrive date (ADR 0008). Country auto-suggestion opens a new band each time
the country changes as it walks Stops in date order. This is perfect for the
canonical trip, where each country is one contiguous block (Finland → UK → Ireland
→ France → Italy).

It degrades badly when a route **revisits** a country — Munich (DE) → Strasbourg
(FR) → Frankfurt (DE) → Paris (FR). Grouping "all Germany / all France" is
impossible: those bands would overlap, which the model forbids. The suggester
therefore emitted four bands — `Germany, France, Germany, France` — two pairs
sharing a name, which reads as a mistake and adds ceremony instead of reducing
the scroll a chapter exists to tame.

We keep the model and make the suggester interleave-aware.

## Decision

1. **Detect interleaved zones.** After building country-runs, any country that
   appears in more than one (necessarily non-adjacent) run forces the span
   between its first and last run into one **zone**; overlapping spans merge.
   Runs in no zone stay standalone country chapters, exactly as before.

2. **One combined chapter per zone**, spanning the whole contiguous stretch,
   named for the countries it contains in first-appearance order, de-duplicated:
   `"Germany & France"`; three → `"A, B & C"`; four or more → `"Multi-country leg"`.

3. **Edge-peel substantial stays.** A single-country run of **5+ nights
   (run-total)** at the **front or back** of a zone is peeled into its own
   chapter. The interleaved core always merges regardless of night count; a
   substantial stay **sandwiched inside** a zone stays in the combined band —
   it cannot be extracted without re-fragmenting the contiguous stretch, and
   the band reads better than slivers.

4. **Disambiguate exact clashes.** If two suggested chapters would carry the
   identical name (e.g. a double edge-peel `Paris(7) · Munich(2) · Lyon(7)` →
   `France · Germany · France`), append each colliding chapter's anchor city:
   `France (Paris) · Germany · France (Lyon)`. Fires only on an exact match, so
   `France · Germany & France` (solo + combo) is left alone.

5. **Suggester-only.** No schema change, no migration, no UI change. A combined
   chapter is an ordinary chapter row; transport with both endpoints inside it
   is intra-chapter and folds into its subtotal (ADR 0008), so the short hops
   within a loop stop being between-legs lines while the big boundary hops in
   and out of the zone stay between-legs. Every chapter remains freely
   renamable and re-drawable; manual chapters are exempt from the naming rules.

## Consequences

- Interleaved trips get a small number of meaningful chapters instead of a pile
  of same-named single-stop bands. Per-loop budget rolls up under the combined
  chapter; boundary hops remain visible as between-legs travel.
- The suggester's output is a first proposal, not a constraint — the human keeps
  full control, which is why the threshold and edge-peel heuristics can be
  "good enough" rather than perfect.
- Purely additive to ADR 0008: the model, schema and roll-up code are untouched;
  this is logic inside the suggester. Reversible by reverting the suggester.
