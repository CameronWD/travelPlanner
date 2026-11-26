# Day start, Directions back and the Wishlist: 2026-11-26

Three open Feedback notes on main, plus one thing Cam asked for while they were being specified. Agreed with Cam on 2026-11-26.

## 1. The Day map's route buttons

Note `cmwvw3cz9000108l97q28lohy`: "Open in google maps / apple maps button should be more obvious". Cam confirmed he means the Day map's "Open today's route" row, which is a grey label and two small blue text links.

- The row becomes a label, "Open today’s route in", and two real buttons, "Google Maps" and "Apple Maps", each with the navigation arrow and a 44px touch target. Both have the same weight.
- In the Day map dialog they sit under the map below `lg`, and at the foot of the places list from `lg`. On the Travelling Home's map tile they stay above the map.
- The text links inside a pin's pop-up do not change.
- Apple's link still carries only the first and last point. That is unchanged.

## 2. The day starts from the bed you woke in

Note `cmwvw1co3000008l9qpwpn82w`: "On the day map, should we include the hotel as the starting point for a journey? So we can see how long to walk somewhere".

Today the Day map draws a dashed straight line from *tonight's* Accommodation to the first thing and gives it no Travel time. Hops are only worked out between two things to do.

**Which Accommodation.** The day's start is the Accommodation the Travellers woke in: checked into before the day (`checkIn < date`) and not checked out of before it (`checkOut >= date`). With more than one, the latest check-in.

**When there is a start hop.** From that Accommodation to the day's first located thing (Day map order: start time, then sort order), when all of these hold:
- the Accommodation has coordinates;
- the first located thing is not owned by a different Stop (its `stopId` is empty or equals the Accommodation's). A thing owned by the next Stop is reached by a Transport, so there is no hotel hop;
- the two are not the same point.

So a mid-stay day and a check-out day have one; an arrival day does not. Tonight's Accommodation keeps its "H" pin on every day. On a check-out day with a new bed tonight both are pinned and the route starts from the one woken in.

**The Travel time.** Looked up and resolved exactly as a hop between two things, in the Local travel mode of the Accommodation's Stop. For public transport the lookup leaves 30 minutes before the first thing's start time; an untimed first thing has no public transport lookup and falls back as any hop does. No Hop mode can be set on it and it raises no Flag.

**Where it shows.**
- Day view's travel card: a first row, "The Club Navona → Pantheon · 6 min walk", with the quiet hops behind "All hops", with no mode chooser.
- Day map line: the real route where one is known, dashed and straight where not, like every hop.
- Day map words: a pin's pop-up says "6 min walk from The Club Navona" for the hop that reaches it, for every hop of the day, with "(estimated)" where it is a guess. From `lg` the places list puts the start Accommodation first and shows the same time between consecutive rows.
- "Directions from previous" and the whole-route buttons start from the same Accommodation.

**Not built:** the hop back at night (logged in `docs/open.md`), a Hop mode on the start hop, the start hop in the Claude connection's `get_day`.

## 3. Directions back

Asked for by Cam during the interview: "wherever we end up, can open the app and the home screen just has a button that would open our map up".

- A "Directions back" button on the Travelling Home, in the Now/Next card's button row (all three of its layouts) and on the "Tonight's stay" card.
- It opens Google Maps with directions from the device's location to tonight's Accommodation, in the Local travel mode the Now/Next "Directions" button already uses.
- Shown only when tonight's Accommodation has coordinates or an address.
- Recorded as its own usage action, "Tapped Directions back".

## 4. The Wishlist

Note `cmwvw7t6d000408grxu3cx9hn`: "Wishlist page is a bit silly because it just has everything stacked? Needs a redesign". Cam added that the run of places down the page is all vertical with a lot of wasted space.

**What is wrong today.** The list groups ideas by Stop, but a Wishlist idea never has a Stop (ADR 0022), so no Stop section can hold one. With AI configured every Stop still gets a full-width section: a heading, "0 ideas" and a suggestions row. Every idea lands in "Not tied to a stop yet" at the bottom. The map view's Stop chips filter on the same empty link. The suggestions row's "Add to wishlist" saves a thing to do at the Stop, which never appears on this page.

**The page after.**
- One grid of every idea, best-voted first, directly under the header. No Stop sections.
- One "Add an idea" button that opens a menu: "Type it in" (the existing form), "From your Globe" (only with a Globe), "Suggest some for a Stop" (only with AI configured and at least one Stop). The last opens a dialog that asks which Stop, then shows the existing suggestions; adding one saves a Wishlist idea.
- The menu is in the page header from `md`, and a full-width button under the grid below `md`. It is shown when the Wishlist is empty too.
- Filter chips above the grid: "All", then "Near <Stop>" for each Stop with an idea within 50 km (the Schedule dialog's existing rule), in route order, then "Elsewhere" when any idea has no location or is near no Stop. Two Stops with the same name share one chip. An idea near two Stops is under both. With only "All" to show, no chips are drawn.
- Each card says "Near <Stop>" for its nearest Stop, in the place line it already has.
- The same chips filter the map view.
- Globe suggestions become one line under the chips, "3 places from your Globe are on this route", with "See them" opening the existing picker on those places.
- Unchanged: the List/Map switch, the idea card, voting, scheduling, deleting, the empty state.

**Correction to what was played back:** the playback listed "Paste a link" as a fourth way to add. There is no paste bar; `AddItemFromUrl` only opens the form from `/wishlist?add=item`. It stays as it is, and the menu has three entries.

## Documents to bring into line

- CONTEXT.md **Day map**: the start Accommodation, and times on the map.
- CONTEXT.md **Wishlist**: near a Stop.
- The help guide's Day map line ("links" becomes "buttons").
- `docs/open.md`: the hop back at night.
