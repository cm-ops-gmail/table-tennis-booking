# Table Tennis mailer (Google Apps Script)

The app itself never sends email — it only writes rows to the spreadsheet's
`Notifications` tab with `Status = "Pending"`. **This script is what actually
sends the mail.** It's meant to be pasted into the spreadsheet's own Apps
Script project (Extensions → Apps Script), not deployed anywhere separately.

## What it sends

| Event | Trigger | Recipients |
|---|---|---|
| Booking confirmed | Employee books a slot | Every participant, each participant's line manager (one email per manager, even if they manage more than one player on the same booking), HR |
| Booking cancelled | Owner cancels | Same as above |
| Feedback reminder | A booked slot's end time passes | Every participant on that booking, with a link to Rate & feedback — and a note that feedback is mandatory before their next booking |

The first two are queued by the app and just need sending. The feedback
reminder is different: it's driven by wall-clock time, not a booking action,
so this script watches the `Bookings` tab directly and marks each row's
`Feedback Reminder Sent` column once it's handled — nothing to queue.

## Setup (one time, ~2 minutes)

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Paste the contents of [`TableTennisMailer.gs`](./TableTennisMailer.gs) into
   the editor (replacing the default empty `Code.gs`, or as a new file).
3. In the sheet's **Config** tab, fill in the `APP_URL` row with your live
   site URL (no trailing slash) — this builds the "Submit feedback" /
   "View my bookings" buttons in the emails. Leave it blank and those emails
   just skip the button.
4. Back in the Apps Script editor, pick `setupTableTennisMailer` from the
   function dropdown at the top and click **Run**. Approve the authorization
   prompt (it needs permission to send email and read/write the spreadsheet)
   — that's it, no need to run anything again. This installs **two**
   triggers, both calling `runTableTennisMailer`:
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
5. Optional but recommended: run `sendTestEmailToMyself` once to confirm
   delivery works before relying on it for real bookings.

## Notes

- Every email shares one branded HTML template (`emailShell_`) — a dark
  header card matching the app's look, with the message's Subject/Body from
  the sheet rendered inside it.
- A failed send gets `Status = "Failed: <reason>"` in the Notifications tab
  (or `Feedback Reminder Sent = "FAILED"` in Bookings) instead of silently
  disappearing, so problems are visible right in the sheet.
- `MailApp.sendEmail` quota depends on the Google account type (a Workspace
  account has a much higher daily limit than a personal Gmail account) — if
  the tool sees heavy use, keep an eye on `Failed: ... quota` errors.
