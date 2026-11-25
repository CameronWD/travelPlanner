# Booking import: city and country names in English, 2026-11-25

Agreed with Cam on 25 Nov after a live run of `scripts/booking-import-smoke.ts` on `test/fixtures/booking-import/sample-booking.txt`: the flight printed "Lisbon", the hotel address printed "Lisboa", and the import proposed two Stops for one city. A German confirmation printing "München" would do the same against a Stop called "Munich".

Every place search in the app already asks for English (`lib/geocode.ts`, the place comboboxes), so Stops made by hand are in English. The import was the exception: its prompt asked for the city "as printed".

## What changes

1. **Three city names for every place.** For each Transport end, stay and thing to do, Claude reports the city as printed (`city`), its usual English name (`cityEnglish`), and its usual name in the main language of its country, in that language's own spelling (`cityLocal`). `cityEnglish` and `cityLocal` are the only values Claude gives that need not be printed in the document.
2. **Country in English.** Claude gives the country by its usual English name ("Germany", not "Deutschland"), still only when the document shows a country. Today "Deutschland" yields no country code, so a new Stop from it gets no timezone.
3. **Matching tries every name.** A place matches a Stop, or the Home base, when any of its three city names (or its station or airport text, as today) names it. A booking printing "München" finds a Stop called "Munich"; a booking printing "Munich" finds a Stop called "München".
4. **A new Stop is proposed under the English name.** Places that share an English name ("Lisboa" and "Lisbon") become one proposed Stop.
5. **No English name given:** the printed city is used, which is today's behaviour.

## What does not change

- An existing Stop is never renamed by the import.
- Stations, airports, a stay's name and every address stay exactly as printed ("München Hbf").
- The country agreement rule (BI-14), nearest-visit choice, layover handling and every other matching rule.

## Not in this work

- No table of city names in the code.
- No renames on any Trip. The audit of "Christmas in Europe 2026" on 25 Nov found every Stop already in English.
- A booking in a nearby town (a hotel in Kehl on the Strasbourg Stop, Malpensa for Como).

## How it is checked

- Unit tests on matching and Proposal building: both directions, the merged proposed Stop, the fallback with no English name.
- One live run of the smoke script on the sample booking with a real key: one Lisbon Stop, not two. One run shows it works for Lisbon, not for every city.

## Cost

The prompt and schema change, so the first import after deploy is not served from the prompt cache. Three short extra values per place per import.
