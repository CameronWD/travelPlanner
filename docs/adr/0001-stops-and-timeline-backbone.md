# Trip backbone is Stops + Timeline, not a flat calendar

A Trip is modelled as an ordered sequence of **Stops** (a place + the dates you're based
there), with **Transport** connecting them and a dated **Timeline** of **Items** within
each. We rejected a pure-calendar model (where "place" is just a tag on each dated event)
because the app must reason about *movement* between cities — route maps, per-stop cost
roll-ups, and sanity Flags (backtracking, transport dates that don't line up with a stop)
all need places to be first-class, ordered entities rather than labels. This is hard to
reverse: it's the spine every other feature hangs off.
