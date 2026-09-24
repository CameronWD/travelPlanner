# Fonts

Static `.ttf` weights used by `lib/og-card.tsx` for the Open Graph image.
Satori (`next/og`) only reads `.ttf`/`.otf`/`.woff`, not `.woff2`, so these
are pulled as static files rather than via the regular Google Fonts CSS link
the rest of the app uses.

- **Bricolage Grotesque, weight 800 (ExtraBold)** — `BricolageGrotesque-ExtraBold.ttf`.
  Source: https://fonts.google.com/specimen/Bricolage+Grotesque
  Licence: SIL Open Font License 1.1 (OFL-1.1) — see [`OFL.txt`](./OFL.txt).
- **Plus Jakarta Sans, weight 700 (Bold)** — `PlusJakartaSans-Bold.ttf`.
  Source: https://fonts.google.com/specimen/Plus+Jakarta+Sans
  Licence: SIL Open Font License 1.1 (OFL-1.1) — see [`OFL.txt`](./OFL.txt).

`OFL.txt` is the full licence text, vendored as the OFL requires when the fonts
are redistributed, with both fonts' copyright lines (from each font's
`google/fonts` `ofl/<family>/OFL.txt`, matching the copyright string embedded
in the `.ttf` name table).

Both fonts were fetched as the static weight file referenced by the Google
Fonts CSS2 API (`fonts.googleapis.com/css2?family=...:wght@NNN`), not a
variable font — each `@font-face` rule returned a single fixed-weight
`.ttf` URL.
