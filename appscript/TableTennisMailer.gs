/**
 * Table Tennis Booking — Email Mailer + Calendar Sync
 * ============================================================================
 * This app (the Node/Vercel backend) never sends email itself, or touches
 * Google Calendar — it only writes rows to the `Notifications` tab with
 * Status = "Pending". This script, bound to the same spreadsheet, is what
 * actually sends the mail and creates/removes the Calendar events. It
 * independently watches the `Bookings` tab for two things wall-clock time
 * (not a booking action) has to drive: a "please rate this match" reminder
 * once each slot's end time has passed, and keeping Calendar events in sync
 * with each booking's Confirmed/Cancelled status.
 *
 * TWO TRIGGERS, EACH DOING A DIFFERENT JOB
 *   - An "on change" trigger fires within seconds of a new row landing in
 *     the sheet (a booking being made or cancelled) — this is what makes
 *     confirmation/cancellation emails go out almost instantly instead of
 *     waiting for the next poll.
 *   - A time-driven trigger (every 30 minutes) is kept as a safety net —
 *     it's the ONLY thing that can catch the feedback reminder job, since
 *     nothing "changes" in the sheet at the moment a slot's end time
 *     passes; the clock has to be checked on its own schedule. It also
 *     re-catches anything an on-change event might have missed. Apps
 *     Script has no "only between these hours" option for a recurring
 *     trigger, so it still wakes up all day — but the feedback-reminder
 *     scan itself (see TT_FEEDBACK_WINDOW_START/END below) exits
 *     immediately outside the facility's operating hours, so those extra
 *     wake-ups outside 1 PM–6 PM do effectively nothing.
 *   Both triggers call the exact same function, `runTableTennisMailer` —
 *   it just re-scans for rows whose marker column (Status /
 *   "Feedback Reminder Sent") is still blank/Pending and sends those. That
 *   makes it safe to run redundantly from either trigger, or manually — and
 *   it's wrapped in a LockService lock so two overlapping firings can't
 *   both send the same Pending row (which is what duplicate emails to the
 *   same person almost always mean).
 *
 * SETUP (one time)
 *   1. Open the spreadsheet → Extensions → Apps Script.
 *   2. Delete the default empty `Code.gs` content and paste this whole file
 *      in (or add it as a new script file — the function names just need to
 *      exist somewhere in the project).
 *   3. In the editor's left sidebar, click Services (+), find "Google
 *      Calendar API" in the list, and click Add. This is required — the
 *      Calendar sync below uses that Advanced Service (the `Calendar`
 *      global) instead of the simpler built-in CalendarApp, specifically
 *      so it can request an actual cancellation notification on delete
 *      (CalendarApp's own deleteEvent() can't do that reliably). Without
 *      this step, `Calendar` is undefined and every sync attempt fails.
 *   4. Select `setupTableTennisMailer` from the function dropdown at the
 *      top and click ▶ Run. The first run will ask you to authorize the
 *      script (it needs to send email, read/write this spreadsheet, and
 *      manage Calendar events) — approve it. This installs both triggers
 *      above; you don't need to run anything manually again.
 *   5. Optional: run `sendTestEmailToMyself` once to confirm mail delivery
 *      works before relying on it for real bookings.
 *
 * The live site URL used for the "Submit feedback" / "View my bookings"
 * links is the hardcoded TT_APP_URL constant below — edit that one line if
 * the domain ever changes. TT_CALENDAR_ID picks which calendar gets the
 * booking events — blank (the default) means whichever Google account this
 * script runs as; point it at a shared/resource calendar's id instead if
 * you have one for the table/room. Every email is sent from whichever
 * Google account authorized/runs the script — there's no separate "From"
 * override.
 *
 * WHAT IT DOES
 *   - Booking confirmed → emails each participant's line manager (ONE
 *     email per manager even if they manage more than one player on the
 *     same booking — the app already groups these before writing the row)
 *     and HR. Players themselves get NO email for a confirmation — see
 *     Calendar sync below for how they find out instead.
 *   - Booking cancelled → the same line manager + HR emails as above,
 *     PLUS an explicit "booking cancelled" email to every player this
 *     time — on top of Calendar's own cancellation notice below, since a
 *     missed cancellation notice is worse than a player getting two. All
 *     of this is just "send whatever's Pending in the Notifications tab"
 *     — the app decides who gets what.
 *   - Feedback reminder → sent directly by this script, not queued by the
 *     app, because it's driven by wall-clock time rather than a booking
 *     action: once a Confirmed booking's slot end time has passed and its
 *     "Feedback Reminder Sent" column isn't already TRUE, every participant
 *     gets a reminder email with a link to the Rate & feedback page, and
 *     the row is marked so it's never sent twice. The note that feedback
 *     is mandatory before the next booking matches the app's own rule (a
 *     player with any unrated past match is blocked from booking again).
 *   - Calendar sync → every newly Confirmed booking gets a Calendar event
 *     (title, the slot's time, the same "officially booked" wording the
 *     app used to email participants, now in the invite's description)
 *     with the owner and every player — but not their line managers or
 *     HR — added as attendees. That invite IS a player's confirmation;
 *     there's no separate email for it. A booking that's since been
 *     Cancelled has its description swapped to the matching "cancelled"
 *     wording and is then deleted, both calls explicitly requesting
 *     `sendUpdates: "all"` so Calendar actually emails the attendees a
 *     cancellation notice carrying that updated text (see the note on
 *     syncCalendarEvents_ for why this needs the Advanced Calendar
 *     Service rather than the simpler CalendarApp) — on top of the
 *     explicit cancellation email every player also gets (see above).
 *     Feedback reminders never touch Calendar — those stay email-only.
 *     The "Calendar Event ID" column tracks which bookings already have
 *     one.
 *
 * Nothing here runs on its own until you complete step 3 above.
 * ============================================================================
 */

const TT_TAB_NOTIFICATIONS = "Notifications";
const TT_TAB_BOOKINGS = "Bookings";
const TT_TIMEZONE = "Asia/Dhaka";
const TT_TRIGGER_FN = "runTableTennisMailer";
const TT_BRAND = "10 Minute School — Table Tennis";
// The live site — used to build the "Submit feedback" / "View my bookings"
// links in emails. Edit this one line if the domain ever changes.
const TT_APP_URL = "https://tenms-table-tennis-booking.vercel.app";
// Which calendar gets the "🏓 Table Tennis" events (see syncCalendarEvents_
// below). Blank = the primary calendar of whichever Google account this
// script runs as. Put a shared/resource calendar's id here instead (Google
// Calendar → that calendar's settings → "Integrate calendar" → Calendar ID)
// if you'd rather the booking show up on a dedicated table/room calendar.
const TT_CALENDAR_ID = "";
// The feedback-reminder scan only matters while slots can be running — no
// booking ends outside this window, so there's nothing to check overnight.
// Edit these two if the facility's hours ever change (currently 1:00 PM –
// 5:30 PM; the window runs a bit past close as a grace period).
const TT_FEEDBACK_WINDOW_START = "13:00";
const TT_FEEDBACK_WINDOW_END = "18:00";

/* ------------------------------------------------------------------ *
 * Entry point + trigger setup
 * ------------------------------------------------------------------ */

/**
 * What both triggers call. Re-scans for anything still unsent and sends
 * it — safe to run redundantly, manually, or from either trigger type.
 *
 * Locked so only one run is ever mid-flight: the on-change trigger can fire
 * more than once for a single write (Apps Script does this sometimes for a
 * programmatic multi-row insert), and it can also overlap with the 30-
 * minute timer. Without a lock, two runs can both read the same row while
 * it's still "Pending" — before either has marked it Sent — and each sends
 * it, which is how one cancellation turned into 2-3 identical emails to the
 * same person. A run that can't get the lock quickly just skips; the next
 * trigger (on-change or the timer) tries again shortly after.
 */
function runTableTennisMailer() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log("Another run is already sending — skipping this one to avoid duplicates.");
    return;
  }
  try {
    sendPendingNotifications_();
    sendFeedbackReminders_();
    syncCalendarEvents_();
  } finally {
    lock.releaseLock();
  }
}

/** Run this once from the editor — installs both triggers described above. */
function setupTableTennisMailer() {
  setupTableTennisMailerChangeTrigger();
  setupTableTennisMailerTimeTrigger();
}

/** Instant-ish reaction to a new/edited row (new booking, cancellation, ...). */
function setupTableTennisMailerChangeTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === TT_TRIGGER_FN && t.getEventType() === ScriptApp.EventType.ON_CHANGE) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger(TT_TRIGGER_FN).forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
  Logger.log("Installed: " + TT_TRIGGER_FN + " will now also run whenever the sheet changes.");
}

/** Safety net: catches the clock-driven feedback reminder job, and anything
 *  an on-change event might have missed. */
function setupTableTennisMailerTimeTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === TT_TRIGGER_FN && t.getEventType() === ScriptApp.EventType.CLOCK) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger(TT_TRIGGER_FN).timeBased().everyMinutes(30).create();
  Logger.log("Installed: " + TT_TRIGGER_FN + " will also run every 30 minutes regardless.");
}

/** Optional: confirm mail delivery works before trusting it for real bookings. */
function sendTestEmailToMyself() {
  const me = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  if (!me) {
    Logger.log("Could not determine your email — run this from the Apps Script editor while signed in.");
    return;
  }
  MailApp.sendEmail(
    me,
    "Table Tennis mailer — test email",
    "If you can read this, the Table Tennis Apps Script mailer is wired up correctly and ready to send real booking emails.",
    {
      htmlBody: emailShell_(
        "Test email ✅",
        '<p style="margin:0;font-size:14px;color:#333;line-height:1.6;">If you can read this, the Table Tennis Apps Script mailer is wired up correctly and ready to send real booking emails.</p>'
      ),
      name: TT_BRAND,
    }
  );
  Logger.log("Sent a test email to " + me);
}

/* ------------------------------------------------------------------ *
 * 1. Send whatever's Pending in the Notifications outbox
 * ------------------------------------------------------------------ */

function sendPendingNotifications_() {
  const { sheet, headers, rows } = readSheetObjects_(TT_TAB_NOTIFICATIONS);
  if (!sheet) return;
  const statusCol = headers.indexOf("Status") + 1;
  if (!statusCol) return;

  let sent = 0;
  for (const row of rows) {
    if (String(row["Status"] || "").trim() !== "Pending") continue;
    const to = String(row["Recipient Email"] || "").trim();
    if (!to) {
      sheet.getRange(row.__row, statusCol).setValue("Failed: no recipient email");
      continue;
    }
    try {
      MailApp.sendEmail(to, String(row["Subject"] || "Table Tennis Booking"), String(row["Body"] || ""), {
        htmlBody: renderNotificationEmail_(row),
        name: TT_BRAND,
      });
      sheet.getRange(row.__row, statusCol).setValue("Sent");
      sent++;
    } catch (err) {
      sheet.getRange(row.__row, statusCol).setValue("Failed: " + err.message);
    }
  }
  if (sent) Logger.log("Sent " + sent + " queued notification(s).");
}

/* ------------------------------------------------------------------ *
 * 2. Post-match feedback reminders (time-driven, not queued by the app)
 * ------------------------------------------------------------------ */

function sendFeedbackReminders_() {
  const nowHHMM = Utilities.formatDate(new Date(), TT_TIMEZONE, "HH:mm");
  // No slot ever ends outside the facility's operating window, so there's
  // nothing to check the rest of the day — skip the sheet read entirely.
  if (nowHHMM < TT_FEEDBACK_WINDOW_START || nowHHMM > TT_FEEDBACK_WINDOW_END) return;

  const { sheet, headers, rows } = readSheetObjects_(TT_TAB_BOOKINGS);
  if (!sheet) return;
  const sentCol = headers.indexOf("Feedback Reminder Sent") + 1;
  const sentAtCol = headers.indexOf("Feedback Reminder Sent At") + 1;
  if (!sentCol) {
    Logger.log(
      "Bookings tab is missing the 'Feedback Reminder Sent' column — re-run the app's provisioning script."
    );
    return;
  }

  const today = Utilities.formatDate(new Date(), TT_TIMEZONE, "yyyy-MM-dd");

  let remindedMatches = 0;
  for (const row of rows) {
    if (String(row["Status"] || "").trim() !== "Confirmed") continue;
    if (String(row["Feedback Reminder Sent"] || "").trim().toUpperCase() === "TRUE") continue;

    // Normalise in case the Date / End Time columns are formatted as
    // Date/Time in the sheet (getValues() then hands us a Date object, and
    // "2026-09-12" < "Fri Sep 12 ..." string compares wrong).
    const date = ttNormDate_(row["Date"]);
    const endTime = ttNormTime_(row["End Time"]);
    if (!date || !endTime) continue;
    const played = date < today || (date === today && nowHHMM >= endTime);
    if (!played) continue;

    const names = splitList_(row["Participant Names"]);
    const emails = splitList_(row["Participant Emails"]);
    let allOk = emails.length > 0;
    for (let i = 0; i < emails.length; i++) {
      if (!emails[i]) continue;
      try {
        MailApp.sendEmail(
          emails[i],
          "How was your Table Tennis match? Feedback needed — " + row["Slot Label"],
          "Your match on " + date + " (" + row["Slot Label"] + ") has wrapped up — please submit your feedback: " + TT_APP_URL + "/rate",
          {
            htmlBody: renderFeedbackReminderEmail_(names[i] || "there", row, date),
            name: TT_BRAND,
          }
        );
      } catch (err) {
        allOk = false;
      }
    }
    sheet.getRange(row.__row, sentCol).setValue(allOk ? "TRUE" : "FAILED");
    if (sentAtCol) sheet.getRange(row.__row, sentAtCol).setValue(new Date());
    if (allOk) remindedMatches++;
  }
  if (remindedMatches) Logger.log("Sent feedback reminders for " + remindedMatches + " match(es).");
}

/* ------------------------------------------------------------------ *
 * 3. Google Calendar — one event per booking, guests = the players
 * ------------------------------------------------------------------ */

/** "primary" = whichever Google account runs this script — same calendar
 *  CalendarApp.getDefaultCalendar() would use, but as a plain ID string,
 *  which is what the Advanced Calendar Service's Calendar.Events.* calls
 *  below take instead of a Calendar object. */
function ttCalendarId_() {
  return TT_CALENDAR_ID || "primary";
}

/** "YYYY-MM-DD" + "HH:mm" (Asia/Dhaka, a fixed UTC+6 with no DST) → Date. */
function ttDateTime_(dateStr, hhmm) {
  return new Date(dateStr + "T" + hhmm + ":00+06:00");
}

/** "Name (ID)", each marked "— owner" for the booking owner — matches the
 *  app's own fmtPlayers() in api/_lib/notify.ts, rebuilt from sheet columns
 *  since the .gs side doesn't have access to that Booking object. */
function ttPlayersLine_(row) {
  var ids = splitList_(row["Participant IDs"]);
  var names = splitList_(row["Participant Names"]);
  var ownerId = String(row["Owner ID"] || "").trim();
  var parts = [];
  for (var i = 0; i < names.length; i++) {
    var id = (ids[i] || "").trim();
    parts.push(names[i] + " (" + id + ")" + (id && id === ownerId ? " — owner" : ""));
  }
  return parts.join(", ");
}

/** Same wording as the "booking confirmed" email every participant already
 *  gets (api/_lib/notify.ts's participantConfirmed) — the calendar invite's
 *  description should read like that email, not a separate generic blurb.
 *  The email's greeting is personalized per recipient ("Hi <name>,"); the
 *  invite is one shared description for every guest, so it opens with a
 *  group-friendly "Hi team," instead. */
function ttConfirmedDescription_(row, date) {
  return (
    "Hi team,\n\n" +
    "Your Table Tennis match is officially booked! 🏓🔥\n\n" +
    "Booking Date: " + date + "\n" +
    "Match Time: " + row["Slot Label"] + "\n" +
    "All Players: " + ttPlayersLine_(row) + "\n" +
    "Booking ID: " + row["Booking ID"] + "\n\n" +
    "Time to bring your A-game. 😎\n\n" +
    "Happy playing!"
  );
}

/** Same wording as the "booking cancelled" email participants used to get
 *  (the app's old participantCancelled). Written into the event right
 *  before it's deleted, so the cancellation notice Calendar sends the
 *  guests carries this text rather than the leftover "officially booked"
 *  description from when the event was created. */
function ttCancelledDescription_(row, date) {
  return (
    "Hi team,\n\n" +
    "Just a quick heads-up — your Table Tennis match has been cancelled. 🏓\n\n" +
    "Booking Date: " + date + "\n" +
    "Match Time: " + row["Slot Label"] + "\n" +
    "All Players: " + ttPlayersLine_(row) + "\n" +
    "Booking Owner: " + row["Owner Name"] + "\n" +
    "Booking ID: " + row["Booking ID"] + "\n\n" +
    "Catch you on the next game! 😎"
  );
}

/**
 * Creates a Calendar event for every newly Confirmed booking (participants
 * as attendees, so each gets an invite in their own calendar — line
 * managers and HR are NOT invited, they only get the email) and removes
 * the event again for any booking that's since been Cancelled. Feedback
 * reminders never touch Calendar at all — those stay email-only. The
 * "Calendar Event ID" column doubles as both the record of an event
 * existing and the key to find it again — blank means "not created yet"
 * for a Confirmed booking, or "already cleaned up" for a Cancelled one.
 *
 * Uses the Advanced Calendar Service (the `Calendar` global — enable it
 * via the Apps Script editor's Services (+) → "Google Calendar API" →
 * Add, a one-time setup step) instead of the simpler built-in CalendarApp.
 * CalendarApp's deleteEvent() has no way to request a notification and
 * doesn't reliably send one — unlike deleting an event by hand in the
 * Calendar web UI, which always explicitly asks Google to notify guests.
 * The Advanced Service's sendUpdates: "all" is the documented way to
 * guarantee that email actually goes out, on both creation and deletion.
 */
function syncCalendarEvents_() {
  const { sheet, headers, rows } = readSheetObjects_(TT_TAB_BOOKINGS);
  if (!sheet) return;
  const evCol = headers.indexOf("Calendar Event ID") + 1;
  if (!evCol) {
    Logger.log("Bookings tab is missing the 'Calendar Event ID' column — re-run the app's provisioning script.");
    return;
  }
  const calendarId = ttCalendarId_();
  let created = 0;
  let removed = 0;

  for (const row of rows) {
    const status = String(row["Status"] || "").trim();
    const eventId = String(row["Calendar Event ID"] || "").trim();

    if (status === "Confirmed" && !eventId) {
      const date = ttNormDate_(row["Date"]);
      const start = ttNormTime_(row["Start Time"]);
      const end = ttNormTime_(row["End Time"]);
      if (!date || !start || !end) continue;
      const emails = splitList_(row["Participant Emails"]).filter(function (e) {
        return e && e.indexOf("@") > -1;
      });
      try {
        const event = Calendar.Events.insert(
          {
            summary: "🏓 Table Tennis — " + row["Slot Label"],
            description: ttConfirmedDescription_(row, date),
            start: { dateTime: ttDateTime_(date, start).toISOString(), timeZone: TT_TIMEZONE },
            end: { dateTime: ttDateTime_(date, end).toISOString(), timeZone: TT_TIMEZONE },
            attendees: emails.map(function (e) {
              return { email: e };
            }),
          },
          calendarId,
          { sendUpdates: "all" }
        );
        sheet.getRange(row.__row, evCol).setValue(event.id);
        created++;
      } catch (err) {
        sheet.getRange(row.__row, evCol).setValue("Failed: " + err.message);
      }
    } else if (status === "Cancelled" && eventId && eventId.indexOf("Failed") !== 0) {
      try {
        // Swap in the cancellation wording, then delete — sendUpdates:
        // "all" on both calls is what actually guarantees Calendar emails
        // the attendees, and the patch first means that email shows the
        // cancellation text rather than the original "officially booked"
        // description.
        Calendar.Events.patch(
          { description: ttCancelledDescription_(row, ttNormDate_(row["Date"])) },
          calendarId,
          eventId,
          { sendUpdates: "all" }
        );
        Calendar.Events.remove(calendarId, eventId, { sendUpdates: "all" });
      } catch (err) {
        // Already gone, or no longer accessible — nothing more to do here.
      }
      sheet.getRange(row.__row, evCol).setValue("");
      removed++;
    }
  }
  if (created) Logger.log("Created " + created + " calendar event(s).");
  if (removed) Logger.log("Removed " + removed + " cancelled calendar event(s).");
}

/* ------------------------------------------------------------------ *
 * Sheet helpers
 * ------------------------------------------------------------------ */

/** Reads a tab into {sheet, headers, rows}; each row object also carries
 *  __row, its 1-based sheet row number, so callers can write back to it. */
function readSheetObjects_(tabName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sheet) return { sheet: null, headers: [], rows: [] };
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map((h) => String(h).trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    if (raw.every((c) => c === "" || c === null)) continue;
    const obj = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = raw[j];
    });
    obj.__row = i + 1;
    rows.push(obj);
  }
  return { sheet, headers, rows };
}

function splitList_(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim());
}

/** Whatever the "Date" cell yields → "yyyy-MM-dd" (handles a Date object,
 *  a sheet serial, m/d/yyyy, d-MMM-yyyy, or an already-clean ISO string). */
function ttNormDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TT_TIMEZONE, "yyyy-MM-dd");
  var s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    var n = Number(s);
    if (n > 20000 && n < 90000) {
      return Utilities.formatDate(new Date(Math.round((n - 25569) * 86400000)), "UTC", "yyyy-MM-dd");
    }
  }
  var d = new Date(s);
  return isNaN(d) ? s : Utilities.formatDate(d, TT_TIMEZONE, "yyyy-MM-dd");
}

/** Whatever the "End Time" cell yields → 24h "HH:mm". */
function ttNormTime_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TT_TIMEZONE, "HH:mm");
  var s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  var ap = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (ap) {
    var h = Number(ap[1]) % 12;
    if (/p/i.test(ap[3])) h += 12;
    return ("0" + h).slice(-2) + ":" + ap[2];
  }
  var hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return ("0" + hm[1]).slice(-2) + ":" + hm[2];
  if (/^0?\.\d+$/.test(s)) {
    var mins = Math.round(Number(s) * 1440);
    return ("0" + Math.floor(mins / 60)).slice(-2) + ":" + ("0" + (mins % 60)).slice(-2);
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Email templates — one shared branded shell, plain-text bodies from the
 * sheet formatted into it. Table-based HTML for email-client compatibility.
 * ------------------------------------------------------------------ */

function escapeHtml_(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Emoji like 🏓, 👀, 🎯 sit outside the Basic Multilingual Plane and need a
 *  UTF-16 surrogate pair — those have been observed arriving as mangled "�"
 *  replacement characters in delivered mail, while single-unit characters
 *  (✨, the — dash) come through fine. The strings themselves are correct
 *  right up until MailApp sends them (confirmed by reading the very same
 *  text straight back out of the spreadsheet), so something downstream of
 *  this script doesn't round-trip a surrogate pair correctly. Numeric HTML
 *  character references are plain ASCII and sidestep that entirely — every
 *  mail client decodes them into the right glyph regardless of transport —
 *  so every HTML email is passed through this right before sending.
 *  Everything else (tags, attributes, ASCII, BMP characters) passes through
 *  untouched. */
function ttSafeHtml_(html) {
  var s = String(html || "");
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      var low = s.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        var cp = (code - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        out += "&#" + cp + ";";
        i++;
        continue;
      }
    }
    out += s.charAt(i);
  }
  return out;
}

/** Plain-text "Label: value" lines → paragraphs with bolded labels. */
function bodyToHtml_(text) {
  const lines = String(text || "").split("\n");
  let html = "";
  let open = false;
  for (const line of lines) {
    if (line.trim() === "") {
      if (open) {
        html += "</p>";
        open = false;
      }
      continue;
    }
    if (!open) {
      html += '<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#333333;">';
      open = true;
    } else {
      html += "<br>";
    }
    const m = line.match(/^([A-Za-z][A-Za-z /]{1,30}):\s*(.*)$/);
    if (m) {
      html += '<strong style="color:#141414;">' + escapeHtml_(m[1]) + ":</strong> " + escapeHtml_(m[2]);
    } else {
      html += escapeHtml_(line);
    }
  }
  if (open) html += "</p>";
  return html;
}

function ctaButton_(url, label) {
  return (
    '<div style="margin-top:22px;"><a href="' +
    escapeHtml_(url) +
    '" style="display:inline-block;background:#141414;color:#ffffff;text-decoration:none;' +
    'padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;">' +
    escapeHtml_(label) +
    " →</a></div>"
  );
}

/** The shared branded card every email is wrapped in. */
function emailShell_(title, innerHtml, footerNote) {
  return ttSafeHtml_(
    '<div style="background:#f4f4f4;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e8e8e8;">' +
      "<tr><td>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#141414;padding:18px 28px;">' +
      '<span style="font-size:18px;vertical-align:middle;">🏓</span>' +
      '<span style="color:#ffffff;font-size:15px;font-weight:600;margin-left:10px;vertical-align:middle;">' +
      TT_BRAND +
      "</span>" +
      "</td></tr></table>" +
      '<div style="padding:28px 28px 8px;">' +
      '<h1 style="margin:0 0 14px;font-size:19px;line-height:1.4;color:#141414;">' +
      escapeHtml_(title) +
      "</h1>" +
      innerHtml +
      "</div>" +
      '<div style="padding:16px 28px;margin-top:12px;background:#fafafa;border-top:1px solid #eee;color:#9a9a9a;font-size:11.5px;line-height:1.5;">' +
      (footerNote ||
        "This is an automated message from the Table Tennis Booking System. Please don't reply directly to this email.") +
      "</div>" +
      "</td></tr></table>" +
      "</div>"
  );
}

function renderNotificationEmail_(row) {
  // The Body (authored by the app, incl. the "Hi <name>," greeting) carries
  // the whole message now; we just format it into the branded shell and add
  // a "View my bookings" button for a fresh confirmation.
  const isCancel = String(row["Type"] || "") === "booking_cancelled";
  const cta =
    !isCancel && row["Recipient Role"] === "participant"
      ? ctaButton_(TT_APP_URL + "/my-bookings", "View my bookings")
      : "";
  return emailShell_(String(row["Subject"] || "Table Tennis Booking"), bodyToHtml_(row["Body"]) + cta);
}

function renderFeedbackReminderEmail_(name, bookingRow, dateStr) {
  const body =
    '<p style="margin:0 0 12px;font-size:14px;color:#333;">Hi ' +
    escapeHtml_(name) +
    ",</p>" +
    '<p style="margin:0 0 10px;font-size:14px;color:#333;line-height:1.6;">How was your Table Tennis experience? Take a quick minute to rate your vibe and tell us what you think. ✨</p>' +
    '<p style="margin:0 0 12px;font-size:12.5px;color:#8a8a8a;">Match: <strong style="color:#333;">' +
    escapeHtml_(dateStr || bookingRow["Date"]) +
    '</strong> at <strong style="color:#333;">' +
    escapeHtml_(bookingRow["Slot Label"]) +
    "</strong></p>" +
    ctaButton_(TT_APP_URL + "/rate", "Submit feedback") +
    '<p style="margin:16px 0 0;font-size:14px;color:#333;line-height:1.6;">Game done. Feedback time and get ready for next game 🎯</p>' +
    '<p style="margin:20px 0 0;font-size:12.5px;color:#8a5a00;background:#fff8e1;border:1px solid #ffe6a3;border-radius:8px;padding:10px 14px;line-height:1.5;">' +
    "<strong>Note:</strong> Feedback is mandatory — until you submit it for this match, you won't be able to book another Table Tennis slot." +
    "</p>";
  return emailShell_("You played the game, now spill the tea! 👀🏓", body, "Table Tennis Booking System · 10 Minute School");
}
