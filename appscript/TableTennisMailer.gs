/**
 * Table Tennis Booking — Email Mailer
 * ============================================================================
 * This app (the Node/Vercel backend) never sends email itself — it only
 * writes rows to the `Notifications` tab with Status = "Pending". This
 * script, bound to the same spreadsheet, is what actually sends the mail.
 * It also independently watches the `Bookings` tab and sends a "please rate
 * this match" reminder once each slot's end time has passed.
 *
 * TWO TRIGGERS, EACH DOING A DIFFERENT JOB
 *   - An "on change" trigger fires within seconds of a new row landing in
 *     the sheet (a booking being made or cancelled) — this is what makes
 *     confirmation/cancellation emails go out almost instantly instead of
 *     waiting for the next poll.
 *   - A time-driven trigger (every 10 minutes) is kept as a safety net —
 *     it's the ONLY thing that can catch the feedback reminder job, since
 *     nothing "changes" in the sheet at the moment a slot's end time
 *     passes; the clock has to be checked on its own schedule. It also
 *     re-catches anything an on-change event might have missed.
 *   Both triggers call the exact same function, `runTableTennisMailer` —
 *   it just re-scans for rows whose marker column (Status /
 *   "Feedback Reminder Sent") is still blank/Pending and sends those. That
 *   makes it safe to run redundantly from either trigger, or manually.
 *
 * SETUP (one time)
 *   1. Open the spreadsheet → Extensions → Apps Script.
 *   2. Delete the default empty `Code.gs` content and paste this whole file
 *      in (or add it as a new script file — the function names just need to
 *      exist somewhere in the project).
 *   3. Fill in the `Config` tab's `APP_URL` row with your live site URL, no
 *      trailing slash (e.g. https://table-tennis.10minuteschool.com) — this
 *      is used to build the "Submit feedback" / "View my bookings" links.
 *      Leave it blank and those emails just skip the button.
 *   4. In the Apps Script editor, select `setupTableTennisMailer` from the
 *      function dropdown at the top and click ▶ Run. The first run will ask
 *      you to authorize the script (it needs to send email and read/write
 *      this spreadsheet) — approve it. This installs both triggers above;
 *      you don't need to run anything manually again.
 *   5. Optional: run `sendTestEmailToMyself` once to confirm mail delivery
 *      works before relying on it for real bookings.
 *
 * WHAT IT SENDS
 *   - Booking confirmed / cancelled → every participant, each participant's
 *     line manager (ONE email per manager even if they manage more than one
 *     player on the same booking — the app already groups these before
 *     writing the row), and HR. All of this is just "send whatever's
 *     Pending in the Notifications tab" — the app decides who gets what.
 *   - Feedback reminder → sent directly by this script, not queued by the
 *     app, because it's driven by wall-clock time rather than a booking
 *     action: once a Confirmed booking's slot end time has passed and its
 *     "Feedback Reminder Sent" column isn't already TRUE, every participant
 *     gets a reminder with a link to the Rate & feedback page, and the row
 *     is marked so it's never sent twice. The note that feedback is
 *     mandatory before the next booking matches the app's own rule (a
 *     player with any unrated past match is blocked from booking again).
 *
 * Nothing here runs on its own until you complete step 4 above.
 * ============================================================================
 */

const TT_TAB_NOTIFICATIONS = "Notifications";
const TT_TAB_BOOKINGS = "Bookings";
const TT_TAB_CONFIG = "Config";
const TT_TIMEZONE = "Asia/Dhaka";
const TT_TRIGGER_FN = "runTableTennisMailer";
const TT_BRAND = "10 Minute School — Table Tennis";

/* ------------------------------------------------------------------ *
 * Entry point + trigger setup
 * ------------------------------------------------------------------ */

/** What both triggers call. Re-scans for anything still unsent and sends
 *  it — safe to run redundantly, manually, or from either trigger type. */
function runTableTennisMailer() {
  sendPendingNotifications_();
  sendFeedbackReminders_();
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
  ScriptApp.newTrigger(TT_TRIGGER_FN).timeBased().everyMinutes(10).create();
  Logger.log("Installed: " + TT_TRIGGER_FN + " will also run every 10 minutes regardless.");
}

/** Optional: confirm mail delivery works before trusting it for real bookings. */
function sendTestEmailToMyself() {
  const me = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  if (!me) {
    Logger.log("Could not determine your email — run this from the Apps Script editor while signed in.");
    return;
  }
  MailApp.sendEmail({
    to: me,
    subject: "Table Tennis mailer — test email",
    htmlBody: emailShell_(
      "Test email ✅",
      '<p style="margin:0;font-size:14px;color:#333;line-height:1.6;">If you can read this, the Table Tennis Apps Script mailer is wired up correctly and ready to send real booking emails.</p>'
    ),
    name: TT_BRAND,
  });
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
      MailApp.sendEmail({
        to,
        subject: String(row["Subject"] || "Table Tennis Booking"),
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
  const nowHHMM = Utilities.formatDate(new Date(), TT_TIMEZONE, "HH:mm");
  const appUrl = getConfigValue_(TT_TAB_CONFIG, "APP_URL", "");

  let remindedMatches = 0;
  for (const row of rows) {
    if (String(row["Status"] || "").trim() !== "Confirmed") continue;
    if (String(row["Feedback Reminder Sent"] || "").trim().toUpperCase() === "TRUE") continue;

    const date = String(row["Date"] || "").trim();
    const endTime = String(row["End Time"] || "").trim();
    if (!date || !endTime) continue;
    const played = date < today || (date === today && nowHHMM >= endTime);
    if (!played) continue;

    const names = splitList_(row["Participant Names"]);
    const emails = splitList_(row["Participant Emails"]);
    let allOk = emails.length > 0;
    for (let i = 0; i < emails.length; i++) {
      if (!emails[i]) continue;
      try {
        MailApp.sendEmail({
          to: emails[i],
          subject: "How was your Table Tennis match? Feedback needed — " + row["Slot Label"],
          htmlBody: renderFeedbackReminderEmail_(names[i] || "there", row, appUrl),
          name: TT_BRAND,
        });
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

function getConfigValue_(tabName, key, fallback) {
  const { rows } = readSheetObjects_(tabName);
  for (const r of rows) {
    if (String(r["Key"] || "").trim() === key) {
      const v = String(r["Value"] || "").trim();
      return v || fallback;
    }
  }
  return fallback;
}

function splitList_(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim());
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

function badge_(label, tone) {
  const palette =
    tone === "danger"
      ? { bg: "#fdeceb", fg: "#b3261e" }
      : tone === "warn"
      ? { bg: "#fff8e1", fg: "#8a5a00" }
      : { bg: "#e6f4ea", fg: "#1a7f37" };
  return (
    '<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:' +
    palette.bg +
    ";color:" +
    palette.fg +
    ';font-size:12px;font-weight:600;margin-bottom:16px;">' +
    escapeHtml_(label) +
    "</span>"
  );
}

/** The shared branded card every email is wrapped in. */
function emailShell_(title, innerHtml, footerNote) {
  return (
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
  const type = String(row["Type"] || "");
  const isCancel = type === "booking_cancelled";
  const badge = isCancel ? badge_("Cancelled", "danger") : badge_("Confirmed", "success");
  const appUrl = getConfigValue_(TT_TAB_CONFIG, "APP_URL", "");
  const greet =
    '<p style="margin:0 0 4px;font-size:14px;color:#333;">Hi ' +
    escapeHtml_(row["Recipient Name"] || "there") +
    ",</p>";
  const cta =
    !isCancel && appUrl && row["Recipient Role"] === "participant"
      ? ctaButton_(appUrl + "/my-bookings", "View my bookings")
      : "";
  return emailShell_(String(row["Subject"] || "Table Tennis Booking"), badge + "<br>" + greet + bodyToHtml_(row["Body"]) + cta);
}

function renderFeedbackReminderEmail_(name, bookingRow, appUrl) {
  const rateUrl = appUrl ? appUrl + "/rate" : "";
  const body =
    '<p style="margin:0 0 12px;font-size:14px;color:#333;">Hi ' +
    escapeHtml_(name) +
    ",</p>" +
    '<p style="margin:0 0 12px;font-size:14px;color:#333;line-height:1.6;">Hope you enjoyed your match! Your Table Tennis game on <strong>' +
    escapeHtml_(bookingRow["Date"]) +
    "</strong> at <strong>" +
    escapeHtml_(bookingRow["Slot Label"]) +
    "</strong> has wrapped up — we'd love a minute of your feedback.</p>" +
    (rateUrl
      ? ctaButton_(rateUrl, "Submit feedback")
      : '<p style="font-size:13px;color:#b3261e;margin:0 0 12px;">(Set APP_URL in the Config tab to include a direct link here.)</p>') +
    '<p style="margin:20px 0 0;font-size:12.5px;color:#8a5a00;background:#fff8e1;border:1px solid #ffe6a3;border-radius:8px;padding:10px 14px;line-height:1.5;">' +
    "<strong>Note:</strong> Feedback is mandatory — until you submit it for this match, you won't be able to book another Table Tennis slot." +
    "</p>";
  return emailShell_("How was your match? 🏓", body, "Table Tennis Booking System · 10 Minute School");
}
