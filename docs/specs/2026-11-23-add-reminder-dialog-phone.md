# Add Reminder is a dialog on phones

Branch `feat/add-reminder-dialog-phone`, cut from `main` at `859510e5`. From the polish
decisions list (O3): the Reminders card adds a Reminder with a form in the page, which
cannot stay above a phone keyboard the way a sheet does. Cam, 20 Nov 2026: make it a dialog
on phones, and keep the About choice.

- On a phone, "Add Reminder" on the Reminders card (trip home and Checklists) opens the
  Add Reminder dialog instead of unfolding the form in the page. The dialog is the app's
  existing one: it docks above the keyboard and its Save stays in view.
- Opened from the Reminders card, the dialog offers the About choice the form has: the whole
  trip (the default), a Stop, a thing to do or a Transport, from the same list. Opened from
  a Stop, a thing to do or a Transport, as today, it already knows what it is about and
  shows no choice.
- On desktop nothing changes: the form unfolds in the card.
- The dialog's title is "Add Reminder", Cancel is outlined, the primary button is last.
- A Reminder added either way appears on the card at once, as it does now.
- Nothing about a Surprise is offered in the About list that the form does not already
  offer to this Traveller.
