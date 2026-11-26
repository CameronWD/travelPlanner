# Drive times on a drive: 2026-11-27

Agreed with Cam on 2026-11-27. He asked whether the app could check how long the drive home from Brisbane Airport takes, and said of the feature: "it feels useful? Like when we do our NZ trip we will be driving most of it so we will be driving between stops." He chose to build it before the 30 Nov freeze.

## What exists today

- A **Travel time** is already looked up from real routing and cached for every car **Transport** whose two ends are located (a picked or typed point, else the Stop, else Home), with a rough estimate as the stand-in.
- A drive with **no** times shows it on its Plan card (minutes and road distance, marked estimated when it is). The moment the drive has a departure and an arrival, the figure is dropped.
- The Transport form never shows it. The Claude connection never reports it.
- The **long driving day** Flag counts a timed drive's whole typed span as time behind the wheel.

## The binding rule

**Nothing changes for a Transport that is not a drive, and a drive's stored times never change unless a Traveller presses the button.** No database change.

## 1. In the Transport form (drives only)

- Once both ends are known, a line under the times reads **"About 1h 12m · 95 km by road"** (house duration format). When only the rough estimate is available it reads "About 1h 12m · 95 km by road (estimated)".
- With a departure time entered, a button offers **"Set arrival to 10:12"**: the departure plus the Travel time, shown in the arrival end's own local time (and date, when it is another day). Pressing it fills the arrival field. Nothing is saved until the form is saved.
- When both times are entered and they allow less than the Travel time, the line adds **"Your times allow 1h."**
- The line follows the form as it stands: changing an end or the mode updates or removes it. No line when an end cannot be located, or both ends are the same point.
- Opening a drive and saving it without pressing the button submits exactly what it submits today.

## 2. On the Plan card

- A drive that has a departure time keeps its times as the main line and gains a second line, **"95 km · about 1h 12m driving"** ("(estimated)" appended when it is; thousands are separated: 1,422 km). It shows with only a departure, but never warns without both times.
- When the drive's times allow less than a real (not estimated) Travel time, that line takes the warning colour and ends **"· longer than your times"**: "95 km · about 1h 12m driving · longer than your times".
- A drive with no times looks exactly as it does today.
- The public shared page and the Day view are unchanged.

## 3. A new Flag: a drive that does not fit its times

- A car Transport with both times, whose span is shorter than its **real** Travel time, is flagged as a warning: "Drive from A to B on <date>: your times allow 1h but the road takes about 1h 12m." It targets the day of departure.
- Never raised from the rough estimate.
- It counts in the Flags total, shows wherever Flags are listed (Summary, reviews, next steps, the Claude connection), respects a Surprise like the other travel-time Flags, and can be **Marked fine** like them.

## 4. The long driving day Flag

- For a drive with both times and a real Travel time shorter than the typed span, the day counts the Travel time. Otherwise it counts the typed span, as today. A drive with no times is unchanged.

## 5. The Claude connection

- Reading a Transport that is a drive reports its Travel time: minutes, road distance in kilometres, and whether it is estimated. Other modes gain nothing. Existing fields are unchanged.

## Not in this work

- Traffic or time-of-day predictions.
- Drive times on the shared page or the Day view.
- Travel times for other modes.
- Filling an arrival automatically.

## Documents to bring into line

- CONTEXT.md: **Travel time** (shown on a timed drive too; offered in the form), **Flag** (the new one; what a long driving day counts).
- The help guide, where it describes drives and Flags.

## Decisions made while building (2026-11-27)

- The new line in the form shows only once the times are showing; the untimed box is unchanged.
- "Your times allow ..." and the warning colour need a real Travel time.
- The form may look a missing Travel time up from routing, within the existing daily limit.
- The new Flag is dated by the departure day, while a long driving day keeps the arrival day.
- No in-app undo for a drive Flag Marked fine.
- The Compare view's driving total follows the long-driving-day rule.
- A drive touching a hidden Surprise Stop reports no Travel time through the Claude connection or the form.
- Kilometres are written with a thousands separator in the form and on the card.
- A card line whose times are too short ends "· longer than your times", after Cam saw the screenshots.
