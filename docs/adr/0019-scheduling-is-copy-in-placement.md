# Scheduling an Item is copy-in placement, not a move

To support **Forks** (variant Plans of a Trip), the **Wishlist** must be trip-wide and shared across every Plan while scheduled Items diverge per Plan. A single Item entity that "moves" from Wishlist to Timeline can't satisfy this — the same idea may be unplaced on the real plan, on day 3 of one Fork, and day 5 of another simultaneously. So we redefined scheduling: a Wishlist idea is a durable, shared candidate, and **scheduling places a Plan-owned *copy* of it onto that Plan's Timeline**, leaving the idea in the Wishlist (Votes stay on the shared idea; un-scheduling removes only that Plan's copy).

## Consequences

- Changes prior behaviour where scheduling was a one-entity move that emptied the Wishlist. The Wishlist now persists placed ideas, marked "✓ in this plan" per Plan to avoid confusion.
- This rule applies to the real plan too, not only Forks, so the model stays uniform.
