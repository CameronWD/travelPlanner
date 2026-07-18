# Chapter date band computed from the same membership used to render it

Amends ADR 0021 (self-healing chapter bands). Reconciles with ADR 0008/0009.

## Context

ADR 0021 established that a Chapter's `startDate`/`endDate` self-heals whenever a
member Stop is dated or re-dated — not only during a batch Firm up. But the repair
was defined over stored `chapterId`: the Chapter's band was recomputed from the Stops
that carry its id. ADR 0008's read model does the opposite — for *dated* Stops it
ignores `chapterId` and places a Stop by whichever Chapter's date band covers its
arrive date.

This split source of truth produced two bugs:

1. **Heading mismatches contents.** A dated Stop added directly (without going through
   a rough phase) had no `chapterId`. The render placed it inside the Chapter whose
   band covered its arrive date, but the self-heal saw no explicit link and did not
   extend the band to include it — so the heading dates were narrower than the visible
   contents.

2. **Chapters reverted to "rough" after a dated Stop was added.** A Chapter whose
   `startDate`/`endDate` was computed only from `chapterId`-linked Stops could drift
   out of date when a new dated Stop landed in its span but carried no `chapterId`, so
   the band looked stale or collapsed to rough.

The root cause: the band-recomputation function used a different membership rule than
the render.

## Decision

1. **`spanContributors(chapter, stops, chapters)` is the single membership rule.**
   A dated Stop contributes to Chapter C's band when:
   - it is **explicitly linked** (`Stop.chapterId === C.id`), **or**
   - it has **no chapter link** (`Stop.chapterId == null`) **and** its arrive date
     falls within C's current band (pre-update snapshot).

   This is the same rule the render uses to place stops; the band-recompute now
   produces the same set the reader would see.

2. **`chapterId != null → only its own chapter.** A Stop that is explicitly linked
   to a chapter is only a span contributor for that chapter. This prevents one Stop
   from feeding two bands simultaneously (e.g. if its arrive date happened to fall
   in a neighbour's band) — which could push bands into overlap.

3. **Membership is evaluated against a pre-update snapshot of bands.** The
   `recomputeChapterSpans` helper captures the current band state before applying
   any updates, then runs `spanContributors` against the snapshot. This makes the
   algorithm deterministic regardless of the order chapters are processed.

4. **`chapterForStop` (the render function) is not changed.** Dated Stops are still
   placed by the date band that covers their arrive date (ADR 0008). The band now
   grows to include them, so heading and contents agree — but the rendering rule
   itself is untouched.

5. **Making a Chapter's last dated Stop rough still reverts the Chapter to rough**
   (clears its band), as established in ADR 0021.

## Consequences

- Chapter heading dates now always equal what is rendered on-screen. The
  "chapters go weird after adding a dated stop" and "heading is narrower than
  contents" bugs are resolved structurally, not by patching specific code paths.
- Both membership mechanisms established in ADR 0009 (explicit `chapterId` for
  rough Stops, date-band for dated Stops) are honoured — the band-recompute and
  the render now agree. No schema change.
- The `chapterId != null → single chapter` guard preserves the non-overlap
  invariant: a Stop explicitly linked to one chapter cannot bleed into a
  neighbour's band calculation.
- `spanContributors` is a pure function in `lib/chapters.ts` operating on
  `StopLike` + `id` and `ChapterLike` shapes, making it testable without the
  database.
