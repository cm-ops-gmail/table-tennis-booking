/**
 * Canonical sheet layout for the Table Tennis Booking System — 7 tabs.
 * `provision.ts` creates any missing tab with exactly these headers; the
 * repositories read/write by header name so extra columns are tolerated.
 *
 * Settings (HR email, booking horizon, slot timing, …) live in the `Config`
 * tab as Key/Value rows — see `config.ts`. Any key missing from the sheet
 * falls back to its environment variable, then a hardcoded default, so the
 * app still runs if the tab is empty or not yet provisioned.
 *
 * Email delivery is NOT handled by this app. The `Notifications` tab is an
 * outbox: every row starts with Status = "Pending". A bound Apps Script in
 * the spreadsheet sends the email and flips Status to "Sent".
 */

export const TAB = {
  TT: "TT",
  Bookings: "Bookings",
  Blocks: "Blocks",
  RatingQuestions: "RatingQuestions",
  RatingResponses: "RatingResponses",
  Notifications: "Notifications",
  Config: "Config",
} as const;

export const HEADERS: Record<string, string[]> = {
  // Team-member master data. Populated by HR. Column names are matched loosely
  // (see employees.ts) — "Employee Code / Work Email / LM Email" all work.
  [TAB.TT]: [
    "Employee ID",
    "Name",
    "Email",
    "Department",
    "Designation",
    "Line Manager Name",
    "Line Manager Email",
  ],

  [TAB.Bookings]: [
    "Booking ID",
    "Created At",
    "Date",
    "Slot ID",
    "Slot Label",
    "Start Time",
    "End Time",
    "Status",
    "Owner ID",
    "Owner Name",
    "Owner Email",
    "Player Count",
    "Participant IDs",
    "Participant Names",
    "Participant Emails",
    "Line Manager Emails",
    "Cancelled At",
    "Cancelled By",
    "Notes",
    // Set by the spreadsheet's Apps Script mailer once it has sent the
    // post-match "please rate this game" reminder — not written by the app.
    "Feedback Reminder Sent",
    "Feedback Reminder Sent At",
  ],

  // One tab for slot blocks, full-day blocks, AND blocked users.
  // Type = "slot" | "date" | "user". Date/Slot ID/Slot Label are blank for a
  // user block; Email is blank for slot/date blocks.
  [TAB.Blocks]: [
    "Block ID",
    "Type",
    "Date",
    "Slot ID",
    "Slot Label",
    "Email",
    "Reason",
    "Created At",
    "Created By",
    "Active",
  ],

  [TAB.RatingQuestions]: [
    "Question ID",
    "Order",
    "Question Text",
    "Type",
    "Options",
    "Active",
    "Created At",
  ],

  [TAB.RatingResponses]: [
    "Response ID",
    "Submitted At",
    "Booking ID",
    "Employee ID",
    "Employee Name",
    "Question ID",
    "Question Text",
    "Answer",
  ],

  [TAB.Notifications]: [
    "Notification ID",
    "Created At",
    "Type",
    "Recipient Role",
    "Recipient Name",
    "Recipient Email",
    "Subject",
    "Body",
    "Booking ID",
    "Status",
  ],

  // Editable-by-HR settings, read as simple Key/Value rows.
  [TAB.Config]: ["Key", "Value", "Description"],
};

export const DEFAULT_CONFIG: { key: string; value: string; description: string }[] = [
  { key: "HR_ADMIN_EMAIL", value: "", description: "Recipient for [HR] booking notifications." },
  { key: "HR_ADMIN_NAME", value: "HR Admin", description: "Display name for that recipient." },
  { key: "BOOKING_HORIZON_DAYS", value: "14", description: "How many days ahead employees can book." },
  { key: "ALLOW_RATING_EDIT", value: "TRUE", description: "TRUE lets an employee re-submit a rating." },
  { key: "FACILITY_START", value: "13:00", description: "First slot's start time, 24h HH:MM." },
  { key: "FACILITY_END", value: "17:30", description: "Display-only closing time shown to employees, 24h HH:MM." },
  { key: "MATCH_MINUTES", value: "30", description: "Length of one match, in minutes." },
  { key: "GAP_MINUTES", value: "10", description: "Gap between matches, in minutes." },
  { key: "SLOT_COUNT", value: "7", description: "Number of slots generated per day." },
  {
    key: "ADMIN_EMAILS",
    value: "",
    description:
      "Comma-separated emails that get the Admin view after signing in with 10MS SSO (matched case-insensitively). Everyone else on the roster gets the user view only.",
  },
];

export const DEFAULT_QUESTIONS: {
  text: string;
  type: string;
  options?: string;
}[] = [
  { text: "How would you rate the table quality?", type: "star" },
  { text: "How was your overall playing experience?", type: "scale" },
  { text: "Was the booking process easy to use?", type: "yesno" },
  {
    text: "Which aspect needs the most improvement?",
    type: "choice",
    options: "Table condition|Booking system|Slot availability|Space/lighting|Nothing",
  },
  { text: "Any additional feedback about the facility?", type: "text" },
];
