/**
 * Canonical sheet layout for the Table Tennis Booking System — 6 tabs.
 * `provision.ts` creates any missing tab with exactly these headers; the
 * repositories read/write by header name so extra columns are tolerated.
 *
 * Settings (HR email, booking horizon, …) live in environment variables,
 * not a sheet tab — see `config.ts`.
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
  ],

  // One tab for both slot blocks and full-day blocks. Type = "slot" | "date";
  // Slot ID / Slot Label are blank for a full-day block.
  [TAB.Blocks]: [
    "Block ID",
    "Type",
    "Date",
    "Slot ID",
    "Slot Label",
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
};

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
