/**
 * Table Tennis Booking System — email dispatcher (Google Apps Script)
 * ------------------------------------------------------------------
 * The web app never sends email. It appends rows to the "Notifications"
 * tab with Status = "Pending". This script, bound to the same spreadsheet,
 * turns those rows into emails and flips Status to "Sent" (or "Error: …").
 *
 * SETUP
 *  1. Extensions ▸ Apps Script, paste this file.
 *  2. Run `installTrigger` once (grant the Gmail/Sheets permissions).
 *  3. A time-driven trigger then runs `sendPendingNotifications` every minute.
 *
 * Notifications columns (see api/_lib/schema.ts):
 *   Notification ID | Created At | Type | Recipient Role | Recipient Name |
 *   Recipient Email | Subject | Body | Booking ID | Status
 */

var NOTIF_TAB = 'Notifications';
var SENDER_NAME = '10MS Table Tennis';

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendPendingNotifications') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendPendingNotifications').timeBased().everyMinutes(1).create();
  sendPendingNotifications();
}

function sendPendingNotifications() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(NOTIF_TAB);
    if (!sh) return;
    var range = sh.getDataRange();
    var values = range.getValues();
    if (values.length < 2) return;

    var head = values[0];
    var col = {};
    head.forEach(function (h, i) { col[String(h).trim()] = i; });

    var statusIdx = col['Status'];
    var emailIdx = col['Recipient Email'];
    var nameIdx = col['Recipient Name'];
    var subjIdx = col['Subject'];
    var bodyIdx = col['Body'];

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var status = String(row[statusIdx] || '').trim().toLowerCase();
      if (status && status !== 'pending') continue;

      var to = String(row[emailIdx] || '').trim();
      if (!to) { sh.getRange(r + 1, statusIdx + 1).setValue('Error: no recipient'); continue; }

      try {
        MailApp.sendEmail({
          to: to,
          name: SENDER_NAME,
          subject: String(row[subjIdx] || 'Table Tennis booking update'),
          body: String(row[bodyIdx] || ''),
        });
        sh.getRange(r + 1, statusIdx + 1).setValue('Sent ' + new Date().toISOString());
      } catch (err) {
        sh.getRange(r + 1, statusIdx + 1).setValue('Error: ' + err);
      }
    }
  } finally {
    lock.releaseLock();
  }
}
