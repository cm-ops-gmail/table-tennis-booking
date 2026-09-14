# Table Tennis mailer + calendar sync (Google Apps Script)

The app itself never sends email or touches Google Calendar — it only writes
rows to the spreadsheet's `Notifications` tab with `Status = "Pending"`.
**This script is what actually sends the mail and manages the Calendar
events.** It's meant to be pasted into the spreadsheet's own Apps Script
project (Extensions → Apps Script), not deployed anywhere separately.

## What it does

| Event | Trigger | Effect |
|---|---|---|
| Booking confirmed | Employee books a slot | Creates a Calendar event for the slot with the owner and every player added as a guest — that invite (its description carries the same "officially booked" wording an email would) is the player's confirmation, no separate email. Each participant's line manager (one email per manager, even if they manage more than one player on the same booking) and HR get an actual email instead, since they're never added to the invite. |
| Booking cancelled | Owner cancels | Updates that Calendar event's description to matching "cancelled" wording, then deletes it, both requesting `sendUpdates: "all"` — that's what actually makes Calendar email the guests a cancellation notice carrying that text (the simpler CalendarApp can't reliably request that, see setup step 3). Line managers and HR get a "cancelled" email, same grouping as above. |
| Feedback reminder | A booked slot's end time passes | Every participant on that booking gets an email with a link to Rate & feedback — and a note that feedback is mandatory before their next booking. Calendar is never touched for this. |

The manager/HR emails are queued by the app and just need sending. The
feedback reminder and the calendar sync are different: both are driven by
wall-clock time / booking status rather than a one-off action, so this
script watches the `Bookings` tab directly — marking each row's `Feedback
Reminder Sent` and `Calendar Event ID` columns as it handles them —
nothing to queue for either.

## Setup (one time, ~2 minutes)

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Paste the contents of [`TableTennisMailer.gs`](./TableTennisMailer.gs) into
   the editor (replacing the default empty `Code.gs`, or as a new file).
3. In the editor's left sidebar, click **Services** (+), find **Google
   Calendar API** in the list, and click **Add**. This is required — the
   calendar sync uses this Advanced Service (the `Calendar` global)
   instead of the simpler built-in CalendarApp, specifically so it can
   request `sendUpdates: "all"` and guarantee an actual cancellation
   email goes out on delete (CalendarApp's own `deleteEvent()` has no way
   to request that, and doesn't reliably send one). Skip this and every
   sync attempt fails with `Calendar` undefined.
4. The live site URL for the "Submit feedback" / "View my bookings" buttons
   is the hardcoded `TT_APP_URL` constant near the top of the script —
   already set to the live domain. Edit that one line if the domain ever
   changes. `TT_CALENDAR_ID` picks which calendar gets the booking events —
   leave it blank to use whichever Google account runs this script, or set
   it to a shared/resource calendar's id if you have one for the table/room.
5. Back in the Apps Script editor, pick `setupTableTennisMailer` from the
   function dropdown at the top and click **Run**. Approve the authorization
   prompt (it needs permission to send email, read/write the spreadsheet,
   and manage Calendar events) — that's it, no need to run anything again.
   This installs **two** triggers, both calling `runTableTennisMailer`:
   - an **on-change** trigger, which fires within seconds of a new booking
     or cancellation row landing in the sheet — this is what gets
     confirmation emails out almost instantly instead of waiting on a poll;
   - a **30-minute** trigger, kept as the only way to catch the feedback
     reminder job (nothing "changes" in the sheet the instant a slot's end
     time passes — the clock has to be checked on its own schedule) and as
     a safety net for anything an on-change event might have missed. Apps
     Script can't restrict a recurring trigger to specific hours, so it
     still wakes up all day, but the reminder scan itself exits immediately
     outside `TT_FEEDBACK_WINDOW_START`/`END` (1 PM–6 PM by default —
     edit those two constants in the script if your facility hours differ),
     so nothing actually happens on those overnight wake-ups.
6. Optional but recommended: run `sendTestEmailToMyself` once to confirm
   delivery works before relying on it for real bookings.

## Notes

- Every email shares one branded HTML template (`emailShell_`) — a dark
  header card matching the app's look, with the message's Subject/Body from
  the sheet rendered inside it.
- A failed send gets `Status = "Failed: <reason>"` in the Notifications tab
  (or `Feedback Reminder Sent = "FAILED"` in Bookings) instead of silently
  disappearing, so problems are visible right in the sheet. A calendar event
  that fails to create is recorded the same way, in `Calendar Event ID`
  (e.g. `Failed: ...`) — that row is left alone on later runs rather than
  retried forever; clear the cell by hand to have it try again.
- `MailApp.sendEmail` quota depends on the Google account type (a Workspace
  account has a much higher daily limit than a personal Gmail account) — if
  the tool sees heavy use, keep an eye on `Failed: ... quota` errors.
- Emails always send from whichever Google account authorized/runs the
  script (step 4 above) — there's no separate "From" address to configure.
- Guests only get an *invite* — Calendar can't add an event straight onto
  someone else's calendar without their own permission. Most Workspace
  accounts show it immediately either way; whether it's auto-accepted
  depends on that person's own Calendar settings.
